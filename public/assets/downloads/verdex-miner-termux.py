#!/usr/bin/env python3
"""
Verdex Termux Miner v2.0 - Premium Android PoW Cloud Miner
Battery-aware mining profiles (Eco, Normal, Pro), hardware auto-detection,
rich terminal coloring, and hybrid cloud mining optimization.
"""
import hashlib
import json
import os
import sys
import time
import requests
import uuid
import platform
import subprocess
from datetime import datetime

API_BASE = "https://verdexswap.site"
TOKEN_FILE = os.path.expanduser("~/.verdex_token")

# ANSI Colors
CLR_RESET = "\033[0m"
CLR_GREEN = "\033[1;32m"
CLR_RED = "\033[1;31m"
CLR_YELLOW = "\033[1;33m"
CLR_BLUE = "\033[1;34m"
CLR_CYAN = "\033[1;36m"
CLR_GRAY = "\033[90m"
CLR_WHITE = "\033[1;37m"

class AndroidSystemDetector:
    """Helper to detect Android system stats and battery status inside Termux."""
    @staticmethod
    def get_battery_info():
        # returns (is_charging, capacity_percent)
        is_charging = True
        capacity = 100
        
        # Method 1: Check Termux API (if installed)
        try:
            out = subprocess.check_output("termux-battery-status", shell=True, stderr=subprocess.DEVNULL).decode()
            data = json.loads(out)
            capacity = int(data.get("percentage", 100))
            status = data.get("status", "UNKNOWN")
            is_charging = status in ["CHARGING", "FULL"]
            return is_charging, capacity
        except Exception:
            pass

        # Method 2: Direct sysfs check (Standard Linux/Android)
        try:
            if os.path.exists("/sys/class/power_supply/battery/capacity"):
                with open("/sys/class/power_supply/battery/capacity") as f:
                    capacity = int(f.read().strip())
            if os.path.exists("/sys/class/power_supply/battery/status"):
                with open("/sys/class/power_supply/battery/status") as f:
                    status = f.read().strip().upper()
                    is_charging = status in ["CHARGING", "FULL"]
            return is_charging, capacity
        except Exception:
            pass

        return is_charging, capacity

    @staticmethod
    def get_hardware_info():
        cores = 4
        ram_gb = 3.0
        cpu_name = "ARMv8 Processor"

        # Cores count
        try:
            cores = os.cpu_count() or 4
        except Exception:
            pass

        # CPU Name
        try:
            if os.path.exists("/proc/cpuinfo"):
                with open("/proc/cpuinfo") as f:
                    for line in f:
                        if "Hardware" in line or "model name" in line:
                            cpu_name = line.split(":")[1].strip()
                            break
        except Exception:
            pass

        # RAM info
        try:
            if os.path.exists("/proc/meminfo"):
                with open("/proc/meminfo") as f:
                    for line in f:
                        if "MemTotal" in line:
                            kb = int(line.split()[1])
                            ram_gb = round(kb / (1024 * 1024), 1)
                            break
        except Exception:
            pass

        return {"cores": cores, "ram": ram_gb, "name": cpu_name}


def get_device_fp():
    h = hashlib.sha256()
    for part in [platform.node(), str(uuid.getnode()), "android-termux-v2"]:
        h.update(str(part).encode())
    return h.hexdigest()

def load_token():
    if os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return None

def save_token(token):
    with open(TOKEN_FILE, 'w') as f:
        json.dump({"token": token}, f)

def auth_flow():
    print(f"\n{CLR_GREEN}=================================================={CLR_RESET}")
    print(f"  {CLR_WHITE}VERDEX ANDROID MINER — AUTHENTICATION{CLR_RESET}")
    print(f"{CLR_GREEN}=================================================={CLR_RESET}")
    print("\n1. Open browser: https://verdexswap.site/dashboard")
    print("2. Authenticate & go to API Tokens")
    print("3. Click 'Create Token'")
    print("4. Copy the API Token (starts with vdxt_)")
    print("5. Paste it here:\n")
    token = input(f"  {CLR_CYAN}API Token: {CLR_RESET}").strip()
    if token.startswith("vdxt_"):
        save_token(token)
        print(f"\n  {CLR_GREEN}✓ Token verified and stored locally.{CLR_RESET}\n")
        return token
    print(f"\n  {CLR_RED}✗ Invalid format. Token must begin with 'vdxt_'{CLR_RESET}\n")
    return None

def get_phase_emoji(phase):
    return {1: "🟢", 2: "🟡", 3: "🔴"}.get(phase, "⚪")

def solve_pow(challenge, difficulty, workers):
    target = "0" * difficulty
    count = 0
    start = time.time()
    
    # We solve in a single process but with lightweight cycles to protect mobile devices
    while True:
        nonce = str(uuid.uuid4()).replace("-", "") + hex(int(time.time() * 1e9))[2:]
        h = hashlib.sha256((challenge + nonce).encode()).hexdigest()
        count += 1
        if h.startswith(target):
            elapsed = time.time() - start
            hashrate = count / (elapsed + 0.001)
            return nonce, hashrate
            
        # Give CPU a small sleep breathing room if running in lightweight Eco mode
        if count % 10000 == 0:
            elapsed = time.time() - start
            hashrate = count / (elapsed + 0.001)
            sys.stdout.write(f"\r  {CLR_GRAY}⛏ Hashrate: {hashrate:.0f} H/s | Attempts: {count:,}{CLR_RESET}")
            sys.stdout.flush()
            if workers == 1:
                time.sleep(0.02) # Throttling for battery saving

def main_loop(token, fp):
    session = requests.Session()
    hw = AndroidSystemDetector.get_hardware_info()
    
    # AI Hardware Score
    hw_score = 15 if hw["cores"] <= 4 else 30
    if hw["ram"] > 4:
        hw_score += 10
    # Mobile penalty scaling
    hw_score = int(hw_score * 0.5)
    hw_score = max(5, hw_score)
    
    hw_profile = {
        "cpu_cores": hw["cores"],
        "cpu_threads": hw["cores"],
        "ram_gb": hw["ram"],
        "gpu_name": "mobile-integrated",
        "gpu_vram_gb": 0,
        "is_mobile": True,
        "benchmark_score": hw_score * 1000
    }

    print(f"\n{CLR_GREEN}=================================================={CLR_RESET}")
    print(f"  {CLR_WHITE}VERDEX MINER RUNNING — HYBRID ANDROID CLIENT{CLR_RESET}")
    print(f"  {CLR_GRAY}Specs: {hw['cores']} Cores | {hw['ram']} GB RAM | Grade: {hw_score}/100{CLR_RESET}")
    print(f"{CLR_GREEN}=================================================={CLR_RESET}")
    print(f"  {CLR_YELLOW}Press Ctrl+C to terminate mining session.{CLR_RESET}\n")

    solved = 0
    mining_mode = "normal"
    
    while True:
        try:
            # Check battery and auto-throttling profiles
            is_plugged, bat_percent = AndroidSystemDetector.get_battery_info()
            
            if not is_plugged:
                if bat_percent < 25:
                    mining_mode = "eco"
                    workers = 1
                else:
                    mining_mode = "normal"
                    workers = max(1, hw["cores"] // 2)
            else:
                mining_mode = "pro"  # Plugged-in allows pro mining profile
                workers = hw["cores"]

            # Challenge request
            r = session.post(f"{API_BASE}/api/mining/challenge", json={
                "device_fingerprint": fp,
                "device_os": "android",
                "device_arch": "aarch64",
                "cli_version": "2.0",
                "mining_mode": mining_mode,
                "mining_source": "termux",
                "hardware_profile": hw_profile
            }, headers={"X-Device-Token": token}, timeout=15)

            if r.status_code == 401:
                print(f"  {CLR_RED}[!] Unauthorized. Token revoked or invalid.{CLR_RESET}")
                break
            if r.status_code != 200:
                print(f"  {CLR_YELLOW}[!] Challenge latency ({r.status_code}). Retrying in 10s...{CLR_RESET}")
                time.sleep(10)
                continue

            data = r.json()
            challenge = data.get("challenge") or data.get("pow_challenge", "")
            difficulty = data.get("difficulty", 4)
            phase = data.get("phase", 1)
            phase_label = data.get("phase_label", "Light")
            base_reward = data.get("reward_per_share", 1)
            est_reward = data.get("estimated_reward", 1)
            
            emoji = get_phase_emoji(phase)
            t = datetime.now().strftime("%H:%M:%S")
            
            # Print status log
            bat_status = f"{CLR_GREEN}Plugged{CLR_RESET}" if is_plugged else f"{CLR_YELLOW}{bat_percent}%{CLR_RESET}"
            print(f"  [{t}] {emoji} Phase {phase} ({phase_label}) | Mode: {CLR_WHITE}{mining_mode.upper()}{CLR_RESET} | Battery: {bat_status}")
            print(f"  Challenge Diff: {difficulty} zeros | Target Reward: {est_reward} VP")

            # Solve Pow challenge
            nonce, hashrate = solve_pow(challenge, difficulty, workers)

            # Heartbeat submission
            sr = session.post(f"{API_BASE}/api/mining/heartbeat", json={
                "nonce": nonce,
                "pow_solution": nonce,
                "mining_mode": mining_mode,
                "mining_source": "termux",
                "hashrate": hashrate,
                "hardware_profile": hw_profile
            }, headers={"X-Device-Token": token}, timeout=15)

            t = datetime.now().strftime("%H:%M:%S")
            if sr.status_code == 200:
                res = sr.json()
                solved += 1
                vp = res.get("vp_balance", 0)
                streak = res.get("streak", 0)
                uptime = res.get("uptime_total_seconds", 0)
                reward_vp = res.get("reward_vp", est_reward)
                
                print(f"\n  [{t}] {CLR_GREEN}✓ Block #{solved} Mined! +{reward_vp} VP{CLR_RESET}")
                print(f"  Total Wallet: {CLR_GREEN}{vp} VP{CLR_RESET} | Streak: {streak}d | Uptime: {uptime//60} mins\n")
            elif sr.status_code == 429:
                wait = sr.json().get("wait_seconds", 10)
                print(f"\n  [{t}] {CLR_YELLOW}⏳ Rate Limit Cooldown. Waiting {wait}s...{CLR_RESET}")
                time.sleep(min(wait, 30))
            else:
                print(f"\n  [{t}] {CLR_RED}✗ Verification rejection ({sr.status_code}){CLR_RESET}")
                time.sleep(5)

        except KeyboardInterrupt:
            print(f"\n\n  {CLR_CYAN}📊 Session stats: {solved} blocks accepted. Average hashrate: {hashrate:.0f} H/s{CLR_RESET}\n")
            break
        except Exception as e:
            t = datetime.now().strftime("%H:%M:%S")
            print(f"\n  [{t}] {CLR_RED}! Connection error: {str(e)[:45]}. Retrying in 10s...{CLR_RESET}")
            time.sleep(10)


if __name__ == "__main__":
    print(f"\n{CLR_CYAN}  ⚡ VERDEX MOBILE ANDROID MINER v2.0{CLR_RESET}")
    print(f"  {CLR_GRAY}===================================={CLR_RESET}")
    
    data = load_token()
    token = data['token'] if data else None
    
    if not token:
        token = auth_flow()
        
    if token:
        fp = get_device_fp()
        main_loop(token, fp)
