package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// APIClient handles all communication with the Verdex backend
type APIClient struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func NewAPIClient(baseURL string) *APIClient {
	return &APIClient{
		BaseURL: strings.TrimSuffix(baseURL, "/"),
		HTTP: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// TokenResponse from /api/mining/token
type TokenResponse struct {
	Success     bool   `json:"success"`
	Token       string `json:"token"`
	TokenPrefix string `json:"token_prefix"`
	SessionID   string `json:"session_id"`
	ExpiresAt   string `json:"expires_at"`
	Error       string `json:"error"`
}

// ChallengeResponse from /api/mining/challenge
type ChallengeResponse struct {
	Success     bool   `json:"success"`
	SessionID  string `json:"session_id"`
	ChallengeID string `json:"challenge_id"`
	Challenge  string `json:"challenge"`
	Difficulty int    `json:"difficulty"`
	ExpiresAt  string `json:"expires_at"`
	Error      string `json:"error"`
}

// HeartbeatResponse from /api/mining/heartbeat
type HeartbeatResponse struct {
	Success            bool   `json:"success"`
	Message            string `json:"message"`
	UptimeTotalSeconds int64  `json:"uptime_total_seconds"`
	VPBalance          int64  `json:"vp_balance"`
	Streak             int    `json:"streak"`
	NextHeartbeatWait  int    `json:"next_heartbeat_wait"`
	Error              string `json:"error"`
}

// StatusResponse from /api/mining/status
type StatusResponse struct {
	IsMining          bool        `json:"is_mining"`
	ActiveSession     interface{} `json:"active_session"`
	UptimeTodaySeconds int64      `json:"uptime_today_seconds"`
	TotalUptimeSeconds int64      `json:"total_uptime_seconds"`
	VPBalance         int64       `json:"vp_balance"`
	Streak            int         `json:"streak"`
	LongestStreak      int         `json:"longest_streak"`
	Rank              int         `json:"rank"`
	LastHeartbeat     string      `json:"last_heartbeat"`
	Error             string      `json:"error"`
}

// DeviceInfo sent during auth
type DeviceInfo struct {
	DeviceFingerprint string `json:"device_fingerprint"`
	DeviceName        string `json:"device_name"`
	DeviceOS          string `json:"device_os"`
	DeviceArch        string `json:"device_arch"`
	CLIVersion        string `json:"cli_version"`
}

// requestToken generates a new device API token using the Supabase JWT
func (c *APIClient) requestToken(jwt string, info DeviceInfo) (*TokenResponse, error) {
	body, _ := json.Marshal(info)
	req, _ := http.NewRequest("POST", c.BaseURL+"/api/mining/token", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+jwt)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result TokenResponse
	json.Unmarshal(respBody, &result)

	if resp.StatusCode != 200 {
		return &result, fmt.Errorf("error: %s", result.Error)
	}
	return &result, nil
}

// getChallenge requests a new PoW challenge
func (c *APIClient) getChallenge() (*ChallengeResponse, error) {
	req, _ := http.NewRequest("POST", c.BaseURL+"/api/mining/challenge", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Device-Token", c.Token)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("challenge request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result ChallengeResponse
	json.Unmarshal(respBody, &result)

	if resp.StatusCode != 200 {
		return &result, fmt.Errorf("error: %s", result.Error)
	}
	return &result, nil
}

// sendHeartbeat sends the PoW solution to the server
func (c *APIClient) sendHeartbeat(challengeID, nonce, solution string) (*HeartbeatResponse, error) {
	body, _ := json.Marshal(map[string]string{
		"challenge_id": challengeID,
		"nonce":        nonce,
		"pow_solution": solution,
	})
	req, _ := http.NewRequest("POST", c.BaseURL+"/api/mining/heartbeat", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Device-Token", c.Token)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("heartbeat failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result HeartbeatResponse
	json.Unmarshal(respBody, &result)

	if resp.StatusCode != 200 {
		return &result, fmt.Errorf("error: %s", result.Error)
	}
	return &result, nil
}

// getStatus fetches mining status
func (c *APIClient) getStatus(jwt string) (*StatusResponse, error) {
	req, _ := http.NewRequest("GET", c.BaseURL+"/api/mining/status", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("status request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result StatusResponse
	json.Unmarshal(respBody, &result)

	if resp.StatusCode != 200 {
		return &result, fmt.Errorf("error: %s", result.Error)
	}
	return &result, nil
}
