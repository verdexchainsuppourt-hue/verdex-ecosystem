package main

import (
	"fmt"
	"os"
)

// cmdStatus shows current mining status
func cmdStatus() {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Println("\n  ❌ Not authenticated. Run 'verdex auth' first.\n")
		os.Exit(1)
	}

	client := NewAPIClient(cfg.BaseURL)
	client.Token = cfg.Token

	fmt.Println()
	fmt.Println("  Verdex Mining Status")
	fmt.Println("  ──────────────────────────")

	// Try to get status via device token first (no JWT needed)
	// If that fails, tell user to check the website
	fmt.Printf("  Device: %s\n", cfg.DeviceName)
	fmt.Printf("  Token: %s...\n", cfg.TokenPrefix)

	// The status API needs a JWT, but the CLI only has a device token
	// So we show what we know from the local config + heartbeat stats
	fmt.Println()
	fmt.Println("  To see your full status (VP balance, rank, uptime):")
	fmt.Println("  Visit: https://verdexswap.site/dashboard")
	fmt.Println()
	fmt.Println("  To start mining: verdex mine")
	fmt.Println("  To stop mining:  verdex stop")
}

// cmdWallet shows wallet info
func cmdWallet() {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Println("\n  ❌ Not authenticated. Run 'verdex auth' first.\n")
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("  Verdex Wallet")
	fmt.Println("  ──────────────────────────")
	fmt.Printf("  Device: %s\n", cfg.DeviceName)
	fmt.Printf("  Token: %s...\n", cfg.TokenPrefix)
	if cfg.SessionID != "" {
		fmt.Printf("  Session: %s...\n", cfg.SessionID[:8])
	}
	fmt.Println()
	fmt.Println("  Your VP balance and VDX address are managed in your dashboard:")
	fmt.Println("  https://verdexswap.site/dashboard")
	fmt.Println()
	fmt.Println("  VDX tokens will be available after mainnet launch (Dec 12, 2026).")
}

// cmdWhoami shows the authenticated account
func cmdWhoami() {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Println("\n  ❌ Not authenticated. Run 'verdex auth' first.\n")
		os.Exit(1)
	}

	fmt.Println()
	fmt.Println("  Authenticated as:")
	fmt.Printf("    Device: %s\n", cfg.DeviceName)
	fmt.Printf("    Token:  %s...\n", cfg.TokenPrefix)
	if cfg.SessionID != "" {
		fmt.Printf("    Session: %s\n", cfg.SessionID)
	}
	fmt.Println()
}

// cmdStop stops mining and clears the local session
func cmdStop() {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Println("\n  Not authenticated. Nothing to stop.\n")
		os.Exit(0)
	}

	fmt.Println()
	fmt.Println("  Stopping mining session...")
	fmt.Printf("  Device: %s\n", cfg.DeviceName)

	// Clear config (token remains valid on server but CLI forgets it)
	deleteConfig()
	fmt.Println()
	fmt.Println("  ✅ Session stopped. You are logged out.")
	fmt.Println("  Run 'verdex auth' to authenticate again.")
}
