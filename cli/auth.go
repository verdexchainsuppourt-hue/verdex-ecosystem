package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// cmdAuth runs the device authorization flow
func cmdAuth() {
	fmt.Println()
	fmt.Println("  Verdex CLI Authentication")
	fmt.Println("  ──────────────────────────")
	fmt.Println()

	// Check if already authenticated
	if cfg, err := loadConfig(); err == nil && cfg.Token != "" {
		fmt.Printf("  Already authenticated as %s\n", cfg.DeviceName)
		fmt.Println("  To re-authenticate, run 'verdex stop' first, then 'verdex auth' again.")
		return
	}

	// Generate device fingerprint
	fp := generateFingerprint()
	hostname, _ := os.Hostname()
	deviceName := hostname
	if deviceName == "" {
		deviceName = "Unknown-" + fp[:8]
	}

	fmt.Printf("  Device: %s (%s/%s)\n", deviceName, runtime.GOOS, runtime.GOARCH)
	fmt.Printf("  Fingerprint: %s...\n", fp[:16])
	fmt.Println()

	// Step 1: User needs to get a JWT from the website
	// The flow: user signs in on the website dashboard, gets a JWT, pastes it here
	// OR we use a device code flow

	fmt.Println("  To authenticate, you need your Verdex access token.")
	fmt.Println("  Sign in at: https://verdexswap.site/dashboard")
	fmt.Println()
	fmt.Println("  After signing in, go to Settings > API Tokens > Create Token")
	fmt.Println("  and paste your access token here.")
	fmt.Println()
	fmt.Print("  Enter your Verdex access token (vdxt_...): ")
	
	var token string
	fmt.Scanln(&token)

	// Use the token directly as the device token
	if strings.HasPrefix(token, "vdxt_") {
		// Save config directly
		cfg := &Config{
			BaseURL:     defaultBaseURL(),
			Token:       token,
			TokenPrefix: token[:12],
			DeviceName:  deviceName,
			Fingerprint: fp,
		}

		if err := saveConfig(cfg); err != nil {
			fmt.Printf("\n  Error saving config: %v\n", err)
			os.Exit(1)
		}

		fmt.Println()
		fmt.Println("  ✅ Authentication successful!")
		fmt.Printf("  Device: %s\n", deviceName)
		fmt.Printf("  Token: %s...\n", token[:12])
		fmt.Println()
		fmt.Println("  You can now start mining: verdex mine")
		return
	}

	// Alternative: JWT-based flow (for web-issued tokens)
	fmt.Println()
	fmt.Println("  Processing authentication...")
	
	client := NewAPIClient(defaultBaseURL())
	info := DeviceInfo{
		DeviceFingerprint: fp,
		DeviceName:        deviceName,
		DeviceOS:          runtime.GOOS,
		DeviceArch:        runtime.GOARCH,
		CLIVersion:        VERSION,
	}

	resp, err := client.requestToken(token, info)
	if err != nil {
		fmt.Printf("\n  ❌ Authentication failed: %v\n", err)
		os.Exit(1)
	}

	cfg := &Config{
		BaseURL:     defaultBaseURL(),
		Token:       resp.Token,
		TokenPrefix: resp.TokenPrefix,
		SessionID:   resp.SessionID,
		DeviceName:  deviceName,
		Fingerprint: fp,
		ExpiresAt:   resp.ExpiresAt,
	}

	if err := saveConfig(cfg); err != nil {
		fmt.Printf("\n  Error saving config: %v\n", err)
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("  ✅ Authentication successful!")
	fmt.Printf("  Device: %s\n", deviceName)
	fmt.Printf("  Token: %s...\n", resp.TokenPrefix)
	fmt.Printf("  Session: %s\n", resp.SessionID[:8]+"...")
	fmt.Println()
	fmt.Println("  You can now start mining: verdex mine")
}

// generateFingerprint creates a unique machine identifier
func generateFingerprint() string {
	hostname, _ := os.Hostname()
	info := fmt.Sprintf("%s|%s|%s|%s", hostname, runtime.GOOS, runtime.GOARCH, runtime.NumCPU())
	h := sha256.Sum256([]byte(info + getMACAddress()))
	return hex.EncodeToString(h[:])
}

// getMACAddress tries to get a MAC address (best effort)
func getMACAddress() string {
	// Try ipconfig/ifconfig
	if runtime.GOOS == "windows" {
		out, err := exec.Command("ipconfig", "/all").Output()
		if err == nil {
			return string(out)
		}
	} else {
		out, err := exec.Command("ifconfig").Output()
		if err == nil {
			return string(out)
		}
	}
	return ""
}

// checkConnectivity verifies the server is reachable
func checkConnectivity(baseURL string) bool {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(baseURL + "/api/mining/leaderboard?limit=1")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}
