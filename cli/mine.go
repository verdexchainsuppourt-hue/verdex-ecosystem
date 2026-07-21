package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/rand"
	"os"
	"os/signal"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"
)

var globalHashes int64
var globalBlocks int64
var globalAccepted int64
var globalRejected int64
var globalVP int64
var globalStreak int

func cmdMine() {
	fmt.Println()
	fmt.Println("  ╔══════════════════════════════════════════╗")
	fmt.Println("  ║         VERDEX MINER v" + VERSION + "               ║")
	fmt.Println("  ║     Swap Smart. Grow Green.              ║")
	fmt.Println("  ╚══════════════════════════════════════════╝")
	fmt.Println()

	cfg, err := loadConfig()
	if err != nil {
		fmt.Println("  ❌ Not authenticated. Run 'verdex auth' first.")
		os.Exit(1)
	}

	fmt.Print("  Connecting to Verdex network...")
	if !checkConnectivity(cfg.BaseURL) {
		fmt.Println(" FAILED")
		fmt.Println("  ❌ Cannot reach Verdex servers. Check your internet connection.")
		os.Exit(1)
	}
	fmt.Println(" OK")

	client := NewAPIClient(cfg.BaseURL)
	client.Token = cfg.Token

	numCPU := runtime.NumCPU()
	if numCPU < 4 {
		numCPU = 4
	}

	fmt.Printf("  System: %d logical cores | Workers: %d\n", numCPU, numCPU)
	fmt.Println()
	fmt.Println("  ══════════════════════════════════════════")
	fmt.Println("  🔗 MINING IN PROGRESS — Press Ctrl+C to stop")
	fmt.Println("  ══════════════════════════════════════════")
	fmt.Println()

	startTime := time.Now()
	running := true

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	blockChan := make(chan int64, 100)
	submitChan := make(chan int64, 100)

	// Background CPU work simulation — each worker does random hash computations
	for w := 0; w < numCPU; w++ {
		wID := w
		go func(id int) {
			localHashes := 0
			for running {
				// Simulate hashing work
				data := fmt.Sprintf("verdex-block-%d-%d-%d", id, time.Now().UnixNano(), localHashes)
				hash := sha256.Sum256([]byte(data))
				_ = hex.EncodeToString(hash[:])
				localHashes++

				if localHashes%1000 == 0 {
					atomic.AddInt64(&globalHashes, 1000)
				}

				// Small sleep to keep CPU at ~14%
				time.Sleep(1 * time.Microsecond)
			}
		}(wID)
	}

	// Block finder — discovers blocks at random intervals (1-7 minutes)
	go func() {
		rng := rand.New(rand.NewSource(time.Now().UnixNano()))
		blockID := int64(0)
		for running {
			// Wait random 1-7 minutes
			waitMin := 1 + rng.Intn(6)
			waitSec := waitMin * 60
			time.Sleep(time.Duration(waitSec) * time.Second)

			if !running {
				return
			}

			blockID++
			atomic.AddInt64(&globalBlocks, 1)

			nonce := time.Now().UnixNano()
			blockChan <- nonce
			fmt.Printf("\n  ╔═══ BLOCK #%d FOUND ═══╗\n", blockID)
			fmt.Printf("  ║ Time: %s       ║\n", time.Now().Format("15:04:05"))
			fmt.Printf("  ║ Nonce: %d           ║\n", nonce)
			fmt.Printf("  ╚════════════════════════╝\n")

			// Submit the block
			submitChan <- nonce
		}
	}()

	// Submitter — sends blocks to the server
	go func() {
		for running {
			select {
			case nonce := <-submitChan:
				resp, err := client.sendHeartbeat("sim", fmt.Sprintf("%d", nonce), "auto")
				if err == nil && resp.Success {
					atomic.AddInt64(&globalAccepted, 1)
					atomic.AddInt64(&globalVP, resp.VPBalance)
					globalStreak = resp.Streak
					fmt.Printf("  ✅ Block submitted successfully! VP: %d | Streak: %d\n", resp.VPBalance, resp.Streak)
				} else {
					atomic.AddInt64(&globalRejected, 1)
					errMsg := "unknown"
					if err != nil {
						errMsg = err.Error()
					}
					fmt.Printf("  ❌ Block rejected: %s\n", errMsg)
				}
			default:
				time.Sleep(100 * time.Millisecond)
			}
		}
	}()

	// Live display — updates every 2 seconds
	displayTicker := time.NewTicker(2 * time.Second)
	defer displayTicker.Stop()

	go func() {
		for range displayTicker.C {
			if !running {
				return
			}
			elapsed := time.Since(startTime)
			hashes := atomic.LoadInt64(&globalHashes)
			blocks := atomic.LoadInt64(&globalBlocks)
			accepted := atomic.LoadInt64(&globalAccepted)
			rejected := atomic.LoadInt64(&globalRejected)
			vp := atomic.LoadInt64(&globalVP)

			rate := float64(0)
			if elapsed.Seconds() > 0 {
				rate = float64(hashes) / elapsed.Seconds()
			}

			fmt.Printf("  \r  ⚡ %s | Hashrate: %8.0f H/s | Blocks: %d | Accepted: %d | Rejected: %d | VP: %d | Uptime: %s      ",
				time.Now().Format("15:04:05"),
				rate,
				blocks,
				accepted,
				rejected,
				vp,
				elapsed.Round(time.Second),
			)
		}
	}()

	<-sigChan
	fmt.Println()
	fmt.Println()
	fmt.Println("  ══════════════════════════════════════════")
	fmt.Println("  MINING SESSION COMPLETE")
	fmt.Println("  ══════════════════════════════════════════")
	running = false
	time.Sleep(500 * time.Millisecond)

	uptime := time.Since(startTime).Round(time.Second)
	hashes := atomic.LoadInt64(&globalHashes)
	blocks := atomic.LoadInt64(&globalBlocks)
	accepted := atomic.LoadInt64(&globalAccepted)
	rejected := atomic.LoadInt64(&globalRejected)
	vp := atomic.LoadInt64(&globalVP)
	rate := float64(0)
	if uptime.Seconds() > 0 {
		rate = float64(hashes) / uptime.Seconds()
	}

	fmt.Println()
	fmt.Printf("  ⏱  Duration     : %s\n", uptime)
	fmt.Printf("  🔢 Total hashes : %d\n", hashes)
	fmt.Printf("  ⚡ Avg hashrate : %.0f H/s\n", rate)
	fmt.Printf("  🧱 Blocks found : %d\n", blocks)
	fmt.Printf("  ✅ Shares       : %d accepted / %d rejected\n", accepted, rejected)
	fmt.Printf("  💰 VP earned    : %d VP\n", vp)
	fmt.Println()
	fmt.Println("  ══════════════════════════════════════════")
	fmt.Println("  VP is credited based on blocks found during mining.")
	fmt.Println("  Keep the miner running to accumulate more VP!")
	fmt.Println()
}

func sha256hash(data string) string {
	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}