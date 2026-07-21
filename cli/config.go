package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// Config stored locally on the user's machine
type Config struct {
	BaseURL       string `json:"base_url"`
	Token         string `json:"token"`
	TokenPrefix   string `json:"token_prefix"`
	SessionID     string `json:"session_id"`
	DeviceName    string `json:"device_name"`
	Fingerprint   string `json:"device_fingerprint"`
	ExpiresAt     string `json:"expires_at"`
}

func configPath() string {
	home, _ := os.UserHomeDir()
	var dir string
	switch runtime.GOOS {
	case "windows":
		dir = filepath.Join(home, ".verdex")
	case "darwin":
		dir = filepath.Join(home, ".verdex")
	default:
		dir = filepath.Join(home, ".config", "verdex")
	}
	os.MkdirAll(dir, 0700)
	return filepath.Join(dir, "config.json")
}

func loadConfig() (*Config, error) {
	path := configPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg Config
	json.Unmarshal(data, &cfg)
	return &cfg, nil
}

func saveConfig(cfg *Config) error {
	path := configPath()
	data, _ := json.MarshalIndent(cfg, "", "  ")
	return os.WriteFile(path, data, 0600)
}

func deleteConfig() {
	path := configPath()
	os.Remove(path)
}

func defaultBaseURL() string {
	return "https://verdexswap.site"
}
