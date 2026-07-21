#!/usr/bin/env python3
"""Create deployment zip for Vercel dashboard upload"""
import os, zipfile, io

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(ROOT, "verdex-deploy.zip")

FILES = [
    "admin.html",
    "dashboard.html",
    "vercel.json",
    "api/_lib.js",
    "api/debug.js",
    "api/mining/challenge.js",
    "api/mining/heartbeat.js",
    "api/mining/token-create.js",
    "api/mining/leaderboard.js",
    "assets/downloads/verdex-miner.py",
    "assets/downloads/verdex-miner-termux.py",
    "assets/downloads/verdex-miner-gui.py",
    "assets/downloads/build_exe.py",
    "assets/downloads/build_exe.bat",
    "assets/downloads/verdex-miner.spec",
]

def create():
    with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as zf:
        for filepath in FILES:
            full = os.path.join(ROOT, filepath)
            if os.path.exists(full):
                zf.write(full, filepath)
                print(f"  [+] {filepath}")
            else:
                print(f"  [!] MISSING: {filepath}")
    
    size = os.path.getsize(OUTPUT) / 1024
    print(f"\n  [OK] Package created: {OUTPUT} ({size:.1f} KB)")
    print("\n  ===== DEPLOYMENT INSTRUCTIONS =====")
    print("  1. Go to https://vercel.com/YOUR_PROJECT/deployments")
    print("  2. Click 'Upload' and select verdex-deploy.zip")
    print("  3. Or upload individual files via the Vercel dashboard")
    print("  ====================================")

if __name__ == "__main__":
    create()
