package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

const (
	VERSION = "1.1.0"
)

func main() {
	// Single-instance lock: prevent multiple instances
	if !lockInstance() {
		fmt.Println()
		fmt.Println("  Verdex Miner is already running.")
		fmt.Println("  Check your system tray or task manager.")
		fmt.Println()
		pressEnter()
		os.Exit(0)
	}
	defer unlockInstance()

	cmd := ""
	if len(os.Args) >= 2 {
		cmd = os.Args[1]
	}

	switch cmd {
	case "auth":
		cmdAuth()
		pressEnter()
	case "mine":
		cmdMine()
	case "status":
		cmdStatus()
		pressEnter()
	case "wallet":
		cmdWallet()
		pressEnter()
	case "whoami":
		cmdWhoami()
		pressEnter()
	case "stop":
		cmdStop()
		pressEnter()
	case "version":
		fmt.Printf("verdex %s\n", VERSION)
		pressEnter()
	case "help", "--help", "-h":
		printHelp()
		pressEnter()
	case "":
		autoMine()
	default:
		fmt.Printf("Unknown command: %s\n\n", cmd)
		printHelp()
		pressEnter()
	}
}

func pressEnter() {
	fmt.Println()
	fmt.Print("  Press Enter to exit.")
	bufio.NewReader(os.Stdin).ReadBytes('\n')
}

func autoMine() {
	fmt.Println()
	fmt.Println("  ╔══════════════════════════════════════════╗")
	fmt.Println("  ║         VERDEX MINER v" + VERSION + "               ║")
	fmt.Println("  ║     Swap Smart. Grow Green.              ║")
	fmt.Println("  ╚══════════════════════════════════════════╝")
	fmt.Println()

	cfg, err := loadConfig()
	if err == nil && cfg.Token != "" {
		// Already authenticated — verify token is still valid, then mine
		fmt.Println("  🔑 Authenticated as", cfg.DeviceName)
		fmt.Printf("  Token: %s...\n", cfg.TokenPrefix)
		fmt.Println()
		cmdMine()
		return
	}

	fmt.Println("  WELCOME TO VERDEX MINING!")
	fmt.Println("  ──────────────────────────")
	fmt.Println()
	fmt.Println("  Before you can mine, you need to authenticate.")
	fmt.Println("  We'll open your browser so you can sign in.")
	fmt.Println()

	openBrowser("https://verdexswap.site/dashboard")

	fmt.Println("  Step 1: Sign in to Verdex (or create an account)")
	fmt.Println("  Step 2: On the dashboard, click '+ Create Token'")
	fmt.Println("  Step 3: Name your device and click 'Generate Token'")
	fmt.Println("  Step 4: Copy the token and paste it below, then press Enter")
	fmt.Println()

	fp := generateFingerprint()
	hostname, _ := os.Hostname()
	deviceName := hostname
	if deviceName == "" {
		deviceName = "Unknown-" + fp[:8]
	}

	fmt.Printf("  Device: %s\n", deviceName)
	fmt.Println()
	fmt.Print("  Enter Verdex token (vdxt_...): ")

	reader := bufio.NewReader(os.Stdin)
	token, _ := reader.ReadString('\n')
	token = strings.TrimSpace(token)

	if token == "" {
		fmt.Println()
		fmt.Println("  No token entered.")
		pressEnter()
		os.Exit(0)
	}

	if len(token) >= 12 {
		cfg := &Config{
			BaseURL:     defaultBaseURL(),
			Token:       token,
			TokenPrefix: token[:12],
			DeviceName:  deviceName,
			Fingerprint: fp,
		}

		if err := saveConfig(cfg); err != nil {
			fmt.Printf("\n  Error saving config: %v\n", err)
			pressEnter()
			os.Exit(1)
		}

		fmt.Println()
		fmt.Println("  ✅ Authentication successful!")
		fmt.Println()
		fmt.Println("  Starting miner now...")
		fmt.Println()
		cmdMine()
		return
	}

	fmt.Println()
	fmt.Println("  Invalid token. Run verdex.exe again.")
	pressEnter()
	os.Exit(0)
}

func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default:
		err = exec.Command("xdg-open", url).Start()
	}
	if err != nil {
		fmt.Printf("  (Could not open browser: %v)\n", err)
	}
}

func printHelp() {
	logo := `
██╗   ██╗██████╗ ███████╗███╗   ██╗████████╗
██║   ██║██╔══██╗██╔════╝████╗  ██║╚══██╔══╝
██║   ██║██║  ██║█████╗  ██╔██╗ ██║   ██║
╚██╗ ██╔╝██║  ██║██╔══╝  ██║╚██╗██║   ██║
 ╚████╔╝ ██████╔╝███████╗██║ ╚████║   ██║
  ╚═══╝  ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝
`
	fmt.Println(logo)
	fmt.Printf("  Verdex CLI Miner v%s\n", VERSION)
	fmt.Println("  Swap Smart. Grow Green.")
	fmt.Println()
	fmt.Println("USAGE:")
	fmt.Println("  verdex <command>")
	fmt.Println()
	fmt.Println("COMMANDS:")
	fmt.Println("  auth      Authenticate with your Verdex account")
	fmt.Println("  mine      Start mining Verdex Points (VP)")
	fmt.Println("  status    Show current mining status and VP balance")
	fmt.Println("  wallet    Show your wallet info")
	fmt.Println("  whoami    Show authenticated account")
	fmt.Println("  stop      Stop mining and logout")
	fmt.Println("  version   Show version")
	fmt.Println("  help      Show this help message")
	fmt.Println()
	fmt.Println("TIP: Just double-click verdex.exe to auto-start!")
	fmt.Println()
	fmt.Println("Download: https://mega.nz/file/nHpDmDrK#ihzNhLDbbbThKWD2ZKeJKARPRvxbEpVDdZWJQ_Ky9Fk")
	fmt.Println("For more info: https://verdexswap.site/dashboard")
}