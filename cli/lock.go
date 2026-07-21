package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

func lockInstance() bool {
	dir := lockDir()
	os.MkdirAll(dir, 0700)
	path := filepath.Join(dir, "verdex.pid")

	// Check if lock file exists with a running process
	if data, err := os.ReadFile(path); err == nil {
		pidStr := strings.TrimSpace(string(data))
		if pid, err := strconv.Atoi(pidStr); err == nil {
			if processExists(pid) {
				return false
			}
		}
	}

	// Write our PID
	os.WriteFile(path, []byte(fmt.Sprintf("%d", os.Getpid())), 0644)
	return true
}

func unlockInstance() {
	dir := lockDir()
	os.Remove(filepath.Join(dir, "verdex.pid"))
}

func lockDir() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(home, "AppData", "Local", "verdex")
	default:
		return filepath.Join(home, ".config", "verdex")
	}
}

func processExists(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Windows, FindProcess always succeeds — we need to send signal 0
	if runtime.GOOS == "windows" {
		// Try to open the process — if it fails, it doesn't exist
		proc, err := os.FindProcess(pid)
		if err != nil {
			return false
		}
		// Signal 0 checks if process exists
		err = proc.Signal(os.Interrupt)
		// On Windows, Signal always returns an error — just check if process handle is valid
		if err != nil && err.Error() == "not supported by windows" {
			return true // Process handle is valid
		}
		return err == nil
	}
	// Unix: signal 0 checks existence
	if err := p.Signal(os.Interrupt); err != nil {
		return false
	}
	return true
}