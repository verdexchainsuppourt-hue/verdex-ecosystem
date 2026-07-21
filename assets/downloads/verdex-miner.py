#!/usr/bin/env python3
"""
Verdex Miner v3.0 — Ultra-Premium Desktop Mining Application
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Google OAuth with auto-signup/auto-signin
• Real SHA-256 Proof-of-Work with multi-process workers
• Adaptive difficulty, hardware scoring, phase-based rewards
• Premium animated dashboard with glowing sparkline charts
• Normal / Pro / Eco mining modes with thermal protection
• GPU detection, battery awareness, system stress management
• Tabbed UI: Overview · Mining · History · Settings
"""
import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
import threading
import time
import json
import os
import sys
import hashlib
import multiprocessing
import platform
import uuid
import requests
import webbrowser
import math
import subprocess
import random
from urllib.parse import urlencode, urlparse, parse_qs
import http.server
import socketserver
from datetime import datetime, timedelta

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CONFIGURATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API_BASE = "https://verdexswap.site"
SUPABASE_URL = "https://unbzescopxtmtbrgqlhh.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYnplc2NvcHh0bXRicmdxbGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Njc1MjcsImV4cCI6MjA5OTE0MzUyN30.jHm7uIV_fBWIP-EFl3d2AY5P42X3tcIIbEGwNfSYiPM"
REDIRECT_PORT = 8420
VERSION = "3.0.0"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PREMIUM COLOR PALETTE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
C = {
    # Backgrounds
    "bg":       "#050a05",
    "bg2":      "#080f08",
    "surface":  "#0c1a0e",
    "s2":       "#0f2412",
    "s3":       "#153018",
    "card":     "#0d1f10",
    "card_h":   "#112814",
    # Primary green
    "p":        "#22c55e",
    "pl":       "#4ade80",
    "pl2":      "#86efac",
    "pd":       "#16a34a",
    "pg":       "#166534",
    "glow":     "#22c55e",
    # Text
    "t":        "#f0fdf4",
    "t2":       "#dcfce7",
    "tm":       "#86a389",
    "td":       "#4a6d4d",
    "ts":       "#334b36",
    # Accent colors
    "red":      "#ef4444",
    "red_l":    "#fca5a5",
    "orange":   "#f59e0b",
    "orange_l": "#fcd34d",
    "blue":     "#3b82f6",
    "blue_l":   "#93c5fd",
    "purple":   "#a855f7",
    "cyan":     "#06b6d4",
    # Tab
    "tab_bg":   "#0a150c",
    "tab_sel":  "#16a34a",
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MULTIPROCESS SOLVER WORKER (Must be top-level for Windows/PyInstaller pickling)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _mining_worker(ch, tg, res, cnt, st, wid):
    import hashlib
    import os
    import time as _time
    lc = 0
    t0 = _time.time()
    prefix = os.urandom(4).hex() + str(wid)
    while not st.is_set() and res.get("value") is None:
        n = prefix + os.urandom(8).hex() + str(int(_time.time() * 1e9))
        h = hashlib.sha256((ch + n).encode()).hexdigest()
        lc += 1
        if h.startswith(tg):
            e = _time.time() - t0
            res["value"] = (n, lc / e if e > 0 else 0)
            st.set()
            return
        if lc % 10000 == 0:
            try:
                cnt.value += 10000
            except Exception:
                pass

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SYSTEM HARDWARE DETECTION (Cross-platform, no pip deps)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class SystemDetector:
    """Detects CPU, GPU, RAM, battery using OS-native commands."""

    @staticmethod
    def get_cpu_info():
        cores = multiprocessing.cpu_count()
        threads = cores
        name = "Unknown CPU"
        freq_mhz = 0
        try:
            if platform.system() == "Windows":
                out = subprocess.check_output("wmic cpu get Name /value", shell=True, timeout=10).decode().strip()
                for line in out.split("\n"):
                    if "Name=" in line:
                        name = line.split("=", 1)[1].strip()
                out2 = subprocess.check_output("wmic cpu get NumberOfCores /value", shell=True, timeout=10).decode().strip()
                for line in out2.split("\n"):
                    if "NumberOfCores=" in line:
                        cores = int(line.split("=")[1].strip())
                out3 = subprocess.check_output("wmic cpu get NumberOfLogicalProcessors /value", shell=True, timeout=10).decode().strip()
                for line in out3.split("\n"):
                    if "NumberOfLogicalProcessors=" in line:
                        threads = int(line.split("=")[1].strip())
                out4 = subprocess.check_output("wmic cpu get MaxClockSpeed /value", shell=True, timeout=10).decode().strip()
                for line in out4.split("\n"):
                    if "MaxClockSpeed=" in line:
                        freq_mhz = int(line.split("=")[1].strip())
            elif platform.system() == "Linux":
                with open("/proc/cpuinfo") as f:
                    for line in f:
                        if "model name" in line:
                            name = line.split(":")[1].strip()
                            break
            elif platform.system() == "Darwin":
                name = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], timeout=10).decode().strip()
        except Exception:
            pass
        return {"name": name, "cores": cores, "threads": threads, "freq_mhz": freq_mhz}

    @staticmethod
    def get_ram_info():
        ram_gb = 4.0
        try:
            if platform.system() == "Windows":
                out = subprocess.check_output("wmic ComputerSystem get TotalPhysicalMemory /value", shell=True, timeout=10).decode().strip()
                for line in out.split("\n"):
                    if "TotalPhysicalMemory=" in line:
                        ram_gb = round(int(line.split("=")[1].strip()) / (1024 ** 3), 1)
            elif platform.system() == "Linux":
                with open("/proc/meminfo") as f:
                    for line in f:
                        if "MemTotal" in line:
                            ram_gb = round(int(line.split()[1]) / (1024 * 1024), 1)
                            break
            elif platform.system() == "Darwin":
                ram_gb = round(int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], timeout=10).decode().strip()) / (1024 ** 3), 1)
        except Exception:
            pass
        return ram_gb

    @staticmethod
    def get_gpu_info():
        gpu_name = "Integrated Graphics"
        gpu_vram = 0.0
        gpu_type = "integrated"
        try:
            if platform.system() == "Windows":
                out = subprocess.check_output("wmic path win32_VideoController get Name,AdapterRAM /value", shell=True, timeout=10).decode().strip()
                best_gpu, best_vram = None, 0.0
                curr_gpu, curr_vram = None, 0.0
                for line in out.split("\n"):
                    line = line.strip()
                    if "Name=" in line:
                        curr_gpu = line.split("=", 1)[1].strip()
                    if "AdapterRAM=" in line:
                        try:
                            curr_vram = round(int(line.split("=")[1].strip()) / (1024 ** 3), 1)
                        except ValueError:
                            curr_vram = 0.0
                    if curr_gpu:
                        is_basic = "basic" in curr_gpu.lower() or "microsoft" in curr_gpu.lower()
                        if not is_basic and curr_vram > best_vram:
                            best_gpu = curr_gpu
                            best_vram = curr_vram
                if best_gpu:
                    gpu_name = best_gpu
                    gpu_vram = best_vram
                    lname = gpu_name.lower()
                    if any(k in lname for k in ["nvidia", "geforce", "rtx", "gtx", "quadro"]):
                        gpu_type = "nvidia"
                    elif any(k in lname for k in ["radeon", "amd", "rx "]):
                        gpu_type = "amd"
                    else:
                        gpu_type = "dedicated"
                elif curr_gpu:
                    gpu_name = curr_gpu
                    gpu_vram = curr_vram
            elif platform.system() == "Linux":
                try:
                    nvidia_out = subprocess.check_output("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", shell=True, timeout=10).decode().strip()
                    parts = nvidia_out.split(",")
                    gpu_name = parts[0].strip()
                    gpu_vram = round(int(parts[1].split()[0]) / 1024, 1)
                    gpu_type = "nvidia"
                except Exception:
                    pass
        except Exception:
            pass
        return {"name": gpu_name, "vram": gpu_vram, "type": gpu_type}

    @staticmethod
    def get_battery_status():
        try:
            if platform.system() == "Windows":
                out = subprocess.check_output("wmic path Win32_Battery get BatteryStatus,EstimatedChargeRemaining /value", shell=True, timeout=10).decode().strip()
                status, percent = 2, 100
                for line in out.split("\n"):
                    if "BatteryStatus=" in line:
                        status = int(line.split("=")[1].strip())
                    if "EstimatedChargeRemaining=" in line:
                        percent = int(line.split("=")[1].strip())
                return (status in (2, 3, 6, 7, 8, 9), percent)
        except Exception:
            pass
        return (True, 100)

    @staticmethod
    def get_cpu_temp():
        """Try to get CPU temp on Windows via wmic or return None."""
        try:
            if platform.system() == "Windows":
                out = subprocess.check_output("wmic /namespace:\\\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /value",
                                              shell=True, stderr=subprocess.DEVNULL, timeout=10).decode().strip()
                for line in out.split("\n"):
                    if "CurrentTemperature=" in line:
                        raw = int(line.split("=")[1].strip())
                        return round((raw / 10.0) - 273.15, 1)
        except Exception:
            pass
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ANIMATED WIDGETS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class GlowCard(ctk.CTkFrame):
    """A card with an animated glow border effect."""
    def __init__(self, parent, glow_color=C["p"], **kw):
        kw.setdefault("fg_color", C["card"])
        kw.setdefault("corner_radius", 16)
        kw.setdefault("border_width", 1)
        kw.setdefault("border_color", C["s3"])
        super().__init__(parent, **kw)
        self._glow_color = glow_color
        self._glow_on = False

    def set_glow(self, on):
        self._glow_on = on
        self.configure(border_color=self._glow_color if on else C["s3"],
                       border_width=2 if on else 1)


class AnimatedProgress(ctk.CTkFrame):
    """A thin animated progress bar with glow."""
    def __init__(self, parent, **kw):
        super().__init__(parent, fg_color=C["s2"], height=6, corner_radius=3, **kw)
        self._bar = ctk.CTkFrame(self, fg_color=C["p"], height=6, corner_radius=3, width=0)
        self._bar.place(x=0, y=0, relheight=1.0)
        self._pct = 0.0

    def set(self, pct):
        self._pct = max(0.0, min(1.0, pct))
        try:
            w = self.winfo_width()
            self._bar.configure(width=int(w * self._pct))
        except Exception:
            pass


class SparklineChart(tk.Canvas):
    """Premium sparkline chart with gradient fill and glow line."""
    def __init__(self, parent, height=100, **kw):
        super().__init__(parent, height=height, bg=C["card"], bd=0,
                         highlightthickness=0, **kw)
        self._data = [0] * 60
        self._max_points = 60

    def push(self, value):
        self._data.append(value)
        if len(self._data) > self._max_points:
            self._data.pop(0)
        self.redraw()

    def set_data(self, data):
        self._data = list(data)[-self._max_points:]
        self.redraw()

    def redraw(self):
        self.delete("all")
        w = self.winfo_width()
        h = self.winfo_height()
        if w <= 1 or h <= 1:
            return

        pts = self._data
        max_val = max(pts) if max(pts) > 0 else 1
        pad_top, pad_bot = 12, 8

        # Calculate coordinates
        coords = []
        dx = w / max(len(pts) - 1, 1)
        for i, p in enumerate(pts):
            cx = i * dx
            cy = pad_top + (1.0 - p / max_val) * (h - pad_top - pad_bot)
            coords.append((cx, cy))

        # Draw gradient fill bands
        gradient_colors = [
            "#071208", "#091509", "#0b180a", "#0d1c0c",
            "#0f200e", "#112410", "#132812"
        ]
        for idx, gc in enumerate(gradient_colors):
            band_h = h / len(gradient_colors)
            y0 = int(idx * band_h)
            y1 = int((idx + 1) * band_h)
            self.create_rectangle(0, y0, w, y1, fill=gc, outline="")

        # Draw filled area under the line
        if len(coords) >= 2:
            poly = [(0, h)]
            for cx, cy in coords:
                poly.append((cx, cy))
            poly.append((w, h))
            self.create_polygon(poly, fill="#0a2010", outline="", stipple="gray25")

        # Draw the main line with glow
        if len(coords) >= 2:
            # Outer glow (wider, darker green)
            flat_glow = []
            for cx, cy in coords:
                flat_glow.extend([cx, cy])
            self.create_line(flat_glow, fill="#145520", width=5, smooth=True, capstyle="round")
            # Inner bright line
            flat_main = []
            for cx, cy in coords:
                flat_main.extend([cx, cy])
            self.create_line(flat_main, fill=C["pl"], width=2.5, smooth=True, capstyle="round")

        # Draw dots at last 3 points
        for cx, cy in coords[-3:]:
            r = 3
            self.create_oval(cx - r, cy - r, cx + r, cy + r, fill=C["pl"], outline=C["glow"])

        # Current value label
        if pts:
            last_val = pts[-1]
            self.create_text(w - 8, 10, text=f"{last_val:,.0f} H/s", anchor="ne",
                             fill=C["pl"], font=("Segoe UI", 9, "bold"))

        # Grid lines (subtle)
        for i in range(4):
            gy = pad_top + i * ((h - pad_top - pad_bot) / 3)
            self.create_line(0, gy, w, gy, fill="#0f1f12", dash=(2, 6))


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN APPLICATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class VerdexSplash(ctk.CTkToplevel):
    """Futuristic borderless startup splash screen playing logo GIF animation."""
    def __init__(self, parent, on_complete):
        super().__init__(parent)
        self.on_complete = on_complete

        # Borderless window
        self.overrideredirect(True)
        self.configure(fg_color=C["bg"])

        # Size & Center on screen
        w, h = 420, 480
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

        # Set top-most
        self.attributes("-topmost", True)

        # Label/Frame structure
        self.card = ctk.CTkFrame(self, fg_color=C["surface"], border_color=C["s3"], border_width=1, corner_radius=20)
        self.card.pack(fill="both", expand=True, padx=4, pady=4)

        # Title
        ctk.CTkLabel(self.card, text="VERDEX DEPIN", font=("Segoe UI", 16, "bold"), text_color=C["pl"]).pack(pady=(24, 0))
        ctk.CTkLabel(self.card, text="Mining Platform", font=("Segoe UI", 10), text_color=C["tm"]).pack()

        # Animation Canvas / Label
        self.anim_lbl = ctk.CTkLabel(self.card, text="", image=None)
        self.anim_lbl.pack(pady=20, expand=True)

        # Loading text
        self.loading_lbl = ctk.CTkLabel(self.card, text="Initializing hardware nodes...", font=("Segoe UI", 10, "italic"), text_color=C["td"])
        self.loading_lbl.pack(pady=(0, 24))

        # Load GIF frames
        self.frames = []
        self.frame_idx = 0

        try:
            from PIL import Image, ImageTk
            gif_path = "assets/verdex_logo_cinematic.gif"
            if getattr(sys, 'frozen', False):
                base_path = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
                gif_path = os.path.join(base_path, "assets", "verdex_logo_cinematic.gif")
                if not os.path.exists(gif_path):
                    gif_path = os.path.join(os.path.dirname(sys.executable), "assets", "verdex_logo_cinematic.gif")

            if os.path.exists(gif_path):
                im = Image.open(gif_path)
                try:
                    while True:
                        frame = im.copy().resize((260, 260), Image.Resampling.LANCZOS)
                        self.frames.append(ImageTk.PhotoImage(frame))
                        im.seek(len(self.frames))
                except EOFError:
                    pass
        except Exception as e:
            print("Failed to load splash GIF:", e)

        self.start_time = time.time()
        self.animate()

    def animate(self):
        elapsed = time.time() - self.start_time

        # Cycle through loading texts
        if elapsed < 1.2:
            self.loading_lbl.configure(text="Connecting to DePIN pool...")
        elif elapsed < 2.2:
            self.loading_lbl.configure(text="Benchmarking core CPU/GPU performance...")
        else:
            self.loading_lbl.configure(text="Decrypting secure authentication handshake...")

        # Play GIF animation
        if self.frames:
            self.anim_lbl.configure(image=self.frames[self.frame_idx])
            self.frame_idx = (self.frame_idx + 1) % len(self.frames)

        if elapsed < 3.5:
            # Continue animating
            self.after(33, self.animate) # ~30 fps
        else:
            # End splash and trigger main GUI
            self.destroy()
            self.on_complete()


class VerdexMiner(ctk.CTk):
    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")

        self.title("Verdex Miner v3.0")
        w, h = 680, 920
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        x, y = max(0, (sw - w) // 2), max(0, (sh - h) // 2)
        self.geometry(f"{w}x{h}+{x}+{y}")
        self.minsize(640, 850)
        self.configure(fg_color=C["bg"])
        self.resizable(True, True)

        # State
        self.user = None
        self.access_token = None
        self.refresh_token = None
        self.api_token = None
        self.mining = False
        self.mining_mode = "normal"  # normal / pro / eco
        self.mining_thread = None
        self._anim_phase = 0.0
        self._particles = []

        # Hardware
        self._detect_hardware()

        # Mining stats
        self.vp = 0.0
        self.streak = 0
        self.uptime = 0
        self.phase_num = 1
        self.phase_name = "Light"
        self.solved = 0
        self.hashrate = 0.0
        self.peak_hashrate = 0.0
        self.start_time = None
        self.reward_rate = 1.0
        self.hash_history = [0.0] * 60
        self.sessions = []
        self.transactions = []
        self.total_earned_session = 0.0
        self.blocks_this_session = 0
        self.cpu_temp = None
        self.active_workers = 0

        # Pool mining stats
        self.pool_data = {
            "hashrate": 0, "active_miners": 0,
            "round": {"progress": 0, "shares_submitted": 0, "reward_pool": 10.0, "minutes_remaining": 60},
            "your_stats": None,
            "leaderboard": [],
            "network": {"total_blocks_mined": 0, "total_vp_mined": 0, "shares_today": 0},
        }

        # Frame container
        self.container = ctk.CTkFrame(self, fg_color="transparent")
        self.container.pack(fill="both", expand=True)
        self.login_frame = None
        self.dash_frame = None
        self.current_tab = "overview"

        # Hide window, trigger splash first
        self.withdraw()
        VerdexSplash(self, self.on_splash_complete)

    def on_splash_complete(self):
        self.deiconify()
        self._build_login()
        self._load_session()
        self.protocol("WM_DELETE_WINDOW", self._exit)

    # ── HARDWARE DETECTION ──
    def _detect_hardware(self):
        self.cpu_info = SystemDetector.get_cpu_info()
        self.ram_gb = SystemDetector.get_ram_info()
        self.gpu_info = SystemDetector.get_gpu_info()

        cores = self.cpu_info["cores"]
        threads = self.cpu_info["threads"]
        has_gpu = self.gpu_info["type"] != "integrated"
        vram = self.gpu_info["vram"]
        freq = self.cpu_info.get("freq_mhz", 0)

        # Tiered CPU scoring: cores + threads + frequency bonus
        cpu_score = min(40, 5 + cores * 2 + (threads - cores) + (freq // 500))
        ram_score = min(25, int(self.ram_gb * 1.5))
        gpu_score = 0
        if has_gpu:
            gpu_score = min(35, 10 + int(vram * 3))

        self.hw_score = min(100, cpu_score + ram_score + gpu_score)

        # Hardware tier label
        if self.hw_score >= 80:
            self.hw_tier = "TITAN"
            self.hw_tier_color = C["purple"]
        elif self.hw_score >= 60:
            self.hw_tier = "ELITE"
            self.hw_tier_color = C["cyan"]
        elif self.hw_score >= 40:
            self.hw_tier = "STANDARD"
            self.hw_tier_color = C["pl"]
        elif self.hw_score >= 20:
            self.hw_tier = "BASIC"
            self.hw_tier_color = C["orange"]
        else:
            self.hw_tier = "ENTRY"
            self.hw_tier_color = C["red"]

        # Device fingerprint
        h = hashlib.sha256()
        for p in [platform.node(), str(uuid.getnode()), self.cpu_info["name"], f"verdex-v{VERSION}"]:
            h.update(str(p).encode())
        self.dfp = h.hexdigest()

    # ── SESSION PERSISTENCE ──
    def _get_config_path(self):
        return os.path.join(os.path.expanduser("~"), ".verdex_miner.json")

    def _load_session(self):
        p = self._get_config_path()
        if os.path.exists(p):
            try:
                with open(p) as f:
                    d = json.load(f)
                if d.get("api_token") and d.get("access_token"):
                    self.api_token = d["api_token"]
                    self.access_token = d["access_token"]
                    self.refresh_token = d.get("refresh_token")
                    # Validate token before auto-login
                    self.after(300, self._validate_and_enter)
            except Exception:
                pass

    def _validate_and_enter(self):
        """Validate stored token; if expired, try refresh; otherwise show login."""
        try:
            ur = requests.get(f"{SUPABASE_URL}/auth/v1/user",
                              headers={"apikey": SUPABASE_ANON_KEY,
                                       "Authorization": f"Bearer {self.access_token}"},
                              timeout=8)
            if ur.status_code == 200:
                self.user = ur.json()
                self._show_dash()
                return

            # Try refresh token
            if self.refresh_token:
                rr = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=refresh_token",
                                   json={"refresh_token": self.refresh_token},
                                   headers={"apikey": SUPABASE_ANON_KEY,
                                            "Content-Type": "application/json"},
                                   timeout=10)
                if rr.status_code == 200:
                    rd = rr.json()
                    self.access_token = rd.get("access_token", self.access_token)
                    self.refresh_token = rd.get("refresh_token", self.refresh_token)
                    self.user = rd.get("user", {})
                    self._save_session()
                    self._show_dash()
                    return
        except Exception:
            pass
        # Tokens invalid, stay on login screen
        self.api_token = None
        self.access_token = None

    def _save_session(self):
        p = self._get_config_path()
        try:
            with open(p, "w") as f:
                json.dump({
                    "api_token": self.api_token,
                    "access_token": self.access_token,
                    "refresh_token": self.refresh_token,
                    "email": self.user.get("email", "") if self.user else "",
                    "version": VERSION,
                }, f)
        except Exception:
            pass

    def _exit(self):
        self.mining = False
        time.sleep(0.3)
        self.destroy()

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # LOGIN SCREEN
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _build_login(self):
        if self.login_frame:
            self.login_frame.destroy()
        self.login_frame = ctk.CTkFrame(self.container, fg_color="transparent")
        self.login_frame.pack(fill="both", expand=True)
        self.login_frame.grid_columnconfigure(0, weight=1)
        self.login_frame.grid_rowconfigure(0, weight=1)

        # Central card
        card = ctk.CTkFrame(self.login_frame, fg_color=C["surface"],
                            corner_radius=28, border_width=2, border_color=C["s3"])
        card.grid(row=0, column=0, padx=40, pady=50, sticky="nsew")
        card.grid_columnconfigure(0, weight=1)

        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(padx=44, pady=50, fill="both", expand=True)

        # Logo area with animated icon
        logo_frame = ctk.CTkFrame(inner, fg_color="transparent")
        logo_frame.pack(pady=(0, 8))

        self._logo_canvas = tk.Canvas(logo_frame, width=100, height=100,
                                       bg=C["surface"], bd=0, highlightthickness=0)
        self._logo_canvas.pack()
        self._draw_logo_ring(0)

        # Title
        tf = ctk.CTkFrame(inner, fg_color="transparent")
        tf.pack()
        ctk.CTkLabel(tf, text="VERDEX", font=("Segoe UI", 38, "bold"),
                     text_color=C["pl"]).pack(side="left")
        ctk.CTkLabel(tf, text="MINER", font=("Segoe UI", 38, "bold"),
                     text_color=C["t"]).pack(side="left", padx=4)

        # Version badge
        vb = ctk.CTkFrame(inner, fg_color="transparent")
        vb.pack(pady=(2, 0))
        ctk.CTkLabel(vb, text=f"v{VERSION}", font=("Segoe UI", 10, "bold"),
                     text_color="#000", fg_color=C["p"], corner_radius=4,
                     padx=8, height=20).pack(side="left", padx=2)
        ctk.CTkLabel(vb, text="Desktop Mining Application",
                     font=("Segoe UI", 11), text_color=C["tm"]).pack(side="left", padx=6)

        # Separator
        ctk.CTkFrame(inner, fg_color=C["s3"], height=1).pack(fill="x", pady=24)

        # Hardware Detection Card
        hw_card = ctk.CTkFrame(inner, fg_color=C["s2"], corner_radius=14,
                               border_width=1, border_color=C["s3"])
        hw_card.pack(fill="x", pady=(0, 20), padx=4)

        hw_header = ctk.CTkFrame(hw_card, fg_color="transparent")
        hw_header.pack(fill="x", padx=16, pady=(12, 6))
        ctk.CTkLabel(hw_header, text="🖥", font=("Segoe UI", 14)).pack(side="left")
        ctk.CTkLabel(hw_header, text="DETECTED HARDWARE",
                     font=("Segoe UI", 10, "bold"), text_color=C["pl"]).pack(side="left", padx=6)
        ctk.CTkLabel(hw_header, text=self.hw_tier, font=("Segoe UI", 9, "bold"),
                     text_color="#000", fg_color=self.hw_tier_color,
                     corner_radius=4, padx=8, height=18).pack(side="right")

        specs = [
            f"CPU: {self.cpu_info['name'][:48]} ({self.cpu_info['cores']}C/{self.cpu_info['threads']}T)",
            f"GPU: {self.gpu_info['name'][:48]} ({self.gpu_info['vram']} GB)",
            f"RAM: {self.ram_gb} GB  •  Score: {self.hw_score}/100",
        ]
        for s in specs:
            ctk.CTkLabel(hw_card, text=s, font=("Segoe UI", 10),
                         text_color=C["t2"], anchor="w").pack(fill="x", padx=16, pady=1)

        # Score progress bar
        prog = AnimatedProgress(hw_card)
        prog.pack(fill="x", padx=16, pady=(6, 12))
        self.after(200, lambda: prog.set(self.hw_score / 100.0))

        # Google Login Button
        self.login_btn = ctk.CTkButton(
            inner, text="   Continue with Google   ",
            command=self._google_login,
            fg_color="#ffffff", text_color="#111111", hover_color="#e8e8e8",
            font=("Segoe UI", 15, "bold"), height=54, corner_radius=14,
            border_width=1, border_color="#cccccc")
        self.login_btn.pack(pady=(4, 8), fill="x", padx=4)

        sub_txt = ctk.CTkFrame(inner, fg_color="transparent")
        sub_txt.pack()
        ctk.CTkLabel(sub_txt, text="🔒", font=("Segoe UI", 10)).pack(side="left")
        ctk.CTkLabel(sub_txt, text="Auto sign-up if new  •  Auto sign-in if existing",
                     font=("Segoe UI", 10), text_color=C["td"]).pack(side="left", padx=4)

        self.login_status = ctk.CTkLabel(inner, text="",
                                          font=("Segoe UI", 12), text_color=C["tm"])
        self.login_status.pack(pady=(12, 0))

        # Animate logo
        self._animate_login_logo()

    def _draw_logo_ring(self, phase):
        c = self._logo_canvas
        c.delete("all")
        cx, cy, r = 50, 50, 36

        # Outer glow ring
        for i in range(3):
            offset = phase * 60 + i * 120
            start = offset % 360
            extent = 90
            color = ["#0d3d1a", "#145525", "#1a6b30"][i]
            c.create_arc(cx - r - 4, cy - r - 4, cx + r + 4, cy + r + 4,
                        start=start, extent=extent, outline=color, width=3, style="arc")

        # Main ring
        for i in range(4):
            offset = -phase * 45 + i * 90
            start = offset % 360
            extent = 70
            color = [C["pd"], C["p"], C["pl"], C["p"]][i]
            c.create_arc(cx - r, cy - r, cx + r, cy + r,
                        start=start, extent=extent, outline=color, width=3, style="arc")

        # Center bolt
        c.create_text(cx, cy, text="⚡", font=("Segoe UI", 28), fill=C["pl"])

    def _animate_login_logo(self):
        if not self.login_frame or not self.login_frame.winfo_exists():
            return
        self._anim_phase += 0.08
        try:
            self._draw_logo_ring(self._anim_phase)
        except Exception:
            pass
        self.after(50, self._animate_login_logo)

    def _set_login_status(self, text, color=C["tm"]):
        try:
            self.login_status.configure(text=text, text_color=color)
            self.update_idletasks()
        except Exception:
            pass

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # GOOGLE OAUTH — Auto sign-up / sign-in
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _google_login(self):
        self._set_login_status("⏳ Starting secure authentication...", C["orange"])
        self.login_btn.configure(state="disabled", text="   Connecting...   ")

        result = [None]

        class OAuthHandler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                fp = urlparse(self.path)
                q = parse_qs(fp.query)

                # Handle all incoming OAuth redirects
                if fp.path == "/callback":
                    # Direct callback with tokens as query params
                    err = q.get("error", [None])[0]
                    tok = q.get("access_token", [None])[0]
                    ref = q.get("refresh_token", [None])[0]
                    code = q.get("code", [None])[0]
                    if err:
                        result[0] = f"error:{err}"
                        self._resp(self._done_page("❌", "Authentication Failed", str(err)))
                    elif tok:
                        result[0] = json.dumps({"access_token": tok, "refresh_token": ref or ""})
                        self._resp(self._done_page("✅", "Authentication Complete",
                                                     "You can close this tab and return to Verdex Miner."))
                    elif code:
                        # PKCE code flow — exchange code for tokens
                        result[0] = json.dumps({"code": code})
                        self._resp(self._done_page("✅", "Authentication Complete",
                                                     "You can close this tab and return to Verdex Miner."))
                    else:
                        self._resp(self._done_page("⚠️", "No Token Received",
                                                     "Please try again."))
                    return

                # Root path — serve a page that extracts hash fragment tokens
                # Supabase implicit flow returns tokens in the URL hash (#access_token=...)
                # Hash fragments are never sent to the server, so JS must extract and redirect
                tok_from_query = q.get("access_token", [None])[0]
                code_from_query = q.get("code", [None])[0]
                if tok_from_query:
                    # Tokens came as query params directly
                    ref = q.get("refresh_token", [""])[0]
                    result[0] = json.dumps({"access_token": tok_from_query, "refresh_token": ref or ""})
                    self._resp(self._done_page("✅", "Authentication Complete",
                                                 "You can close this tab."))
                    return
                if code_from_query:
                    result[0] = json.dumps({"code": code_from_query})
                    self._resp(self._done_page("✅", "Authentication Complete",
                                                 "You can close this tab."))
                    return

                # No tokens in query — serve JS extractor for hash fragment
                self._resp("""<!DOCTYPE html>
<html><head><title>Verdex Auth</title></head>
<body style="background:#050a05;color:#f0fdf4;display:flex;align-items:center;
justify-content:center;min-height:100vh;font-family:sans-serif;margin:0">
<div style="text-align:center">
<div id="icon" style="font-size:48px;color:#22c55e;animation:pulse 1s infinite">⚡</div>
<h2 id="title" style="margin-top:16px">Authenticating...</h2>
<p id="msg" style="color:#86a389">Securing your session...</p>
</div>
<style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}</style>
<script>
(function(){
  // Try hash fragment first (implicit flow)
  var h = window.location.hash.substring(1);
  if(h && h.indexOf('access_token') !== -1) {
    window.location.replace('/callback?' + h);
    return;
  }
  // Try query params (code flow or direct)
  var p = window.location.search.substring(1);
  if(p && (p.indexOf('access_token') !== -1 || p.indexOf('code') !== -1)) {
    window.location.replace('/callback?' + p);
    return;
  }
  // No tokens found at all — show message
  if(!h && !p) {
    document.getElementById('icon').textContent = '⏳';
    document.getElementById('title').textContent = 'Waiting for redirect...';
    document.getElementById('msg').textContent = 'If this takes too long, try signing in again.';
  }
  // Retry after a short delay (in case page loads before hash is set)
  setTimeout(function() {
    var h2 = window.location.hash.substring(1);
    if(h2 && h2.indexOf('access_token') !== -1) {
      window.location.replace('/callback?' + h2);
    }
  }, 1000);
})();
</script>
</body></html>""")
                return

                # Catch-all for any other paths
                self._resp("Verdex OAuth Receiver Active")

            def _done_page(self, icon, title, msg):
                return f"""<!DOCTYPE html>
<html><head><title>Verdex Auth</title></head>
<body style="background:#050a05;color:#f0fdf4;display:flex;align-items:center;
justify-content:center;min-height:100vh;font-family:sans-serif;margin:0">
<div style="text-align:center">
<div style="font-size:72px;color:#22c55e;animation:pop .5s ease">{icon}</div>
<h2 style="margin-top:12px">{title}</h2>
<p style="color:#86a389">{msg}</p>
<p style="color:#4a6d4d;font-size:12px;margin-top:24px">This window will close automatically.</p>
</div>
<style>@keyframes pop{{0%{{transform:scale(0)}}80%{{transform:scale(1.2)}}100%{{transform:scale(1)}}}}</style>
<script>setTimeout(function(){{window.close()}},3000);</script>
</body></html>"""

            def _resp(self, msg):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(msg.encode())

            def log_message(self, *a):
                pass

        def serve():
            try:
                with socketserver.TCPServer(("127.0.0.1", REDIRECT_PORT), OAuthHandler) as s:
                    s.timeout = 180
                    while result[0] is None:
                        s.handle_request()
            except Exception:
                pass

        t = threading.Thread(target=serve, daemon=True)
        t.start()

        # Open the Google OAuth flow — Supabase handles signup vs signin automatically!
        # If the Google account has never signed up, Supabase creates a new user.
        # If already signed up, Supabase signs them in. No extra code needed.
        auth_url = f"{API_BASE}/auth-desktop.html?port={REDIRECT_PORT}"
        webbrowser.open(auth_url)
        self._set_login_status("🌐 Check your browser to sign in with Google...", C["orange"])

        # Poll for result
        wait_start = time.time()
        while result[0] is None and time.time() - wait_start < 180:
            self.update()
            time.sleep(0.1)

        if not result[0]:
            self._set_login_status("⏰ Authentication timed out. Try again.", C["red"])
            self.login_btn.configure(state="normal", text="   Continue with Google   ")
            return

        raw = result[0]
        if isinstance(raw, str) and raw.startswith("error:"):
            self._set_login_status(f"❌ Auth error: {raw[6:]}", C["red"])
            self.login_btn.configure(state="normal", text="   Continue with Google   ")
            return

        try:
            d = json.loads(raw)
            self.access_token = d.get("access_token")
            self.refresh_token = d.get("refresh_token", "")
            auth_code = d.get("code")

            # If we received a code instead of a token (PKCE flow), exchange it
            if auth_code and not self.access_token:
                self._set_login_status("🔄 Exchanging auth code...", C["pl"])
                try:
                    ex = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=authorization_code",
                                       json={"auth_code": auth_code,
                                             "code_verifier": ""},
                                       headers={"apikey": SUPABASE_ANON_KEY,
                                                "Content-Type": "application/json"},
                                       timeout=15)
                    if ex.status_code == 200:
                        ed = ex.json()
                        self.access_token = ed.get("access_token")
                        self.refresh_token = ed.get("refresh_token", "")
                except Exception as ce:
                    self._set_login_status(f"❌ Code exchange failed: {str(ce)[:50]}", C["red"])
                    self.login_btn.configure(state="normal", text="   Continue with Google   ")
                    return

            if not self.access_token:
                self._set_login_status("❌ No access token received", C["red"])
                self.login_btn.configure(state="normal", text="   Continue with Google   ")
                return

            self._set_login_status("🔄 Fetching your account...", C["pl"])

            # Get user info from Supabase (with proper error handling)
            ur = requests.get(f"{SUPABASE_URL}/auth/v1/user",
                              headers={"apikey": SUPABASE_ANON_KEY,
                                       "Authorization": f"Bearer {self.access_token}"},
                              timeout=10)
            if ur.status_code != 200:
                self._set_login_status(f"❌ Supabase error: {ur.status_code}", C["red"])
                self.login_btn.configure(state="normal", text="   Continue with Google   ")
                return

            try:
                self.user = ur.json()
            except Exception:
                self._set_login_status(f"❌ Invalid response from Supabase", C["red"])
                self.login_btn.configure(state="normal", text="   Continue with Google   ")
                return

            email = self.user.get("email", "Unknown")
            if not self.user.get("id"):
                self._set_login_status("❌ No user ID in response", C["red"])
                self.login_btn.configure(state="normal", text="   Continue with Google   ")
                return

            # Ensure profile exists on our website backend (auto-signup sync)
            self._ensure_profile_exists()

            self._set_login_status("🔑 Generating device mining token...", C["pl"])

            # Create API token for this device (with proper error handling)
            tr = requests.post(f"{API_BASE}/api/mining/token-create",
                               json={"name": f"Desktop v{VERSION}",
                                     "device_name": platform.node()},
                               headers={"Authorization": f"Bearer {self.access_token}",
                                        "Content-Type": "application/json"},
                               timeout=15)

            if tr.status_code != 200:
                self._set_login_status(f"❌ API error ({tr.status_code}): {tr.text[:60]}", C["red"])
                self.login_btn.configure(state="normal", text="   Continue with Google   ")
                return

            try:
                td = tr.json()
            except Exception:
                self._set_login_status(f"❌ Invalid API response", C["red"])
                self.login_btn.configure(state="normal", text="   Continue with Google   ")
                return

            if td.get("success"):
                self.api_token = td["token"]
                self._save_session()
                self._set_login_status(f"✅ Welcome, {email}", C["pl"])
                self.after(600, self._show_dash)
            else:
                self._set_login_status(f"❌ Token error: {td.get('error', 'unknown')}", C["red"])
                self.login_btn.configure(state="normal", text="   Continue with Google   ")

        except json.JSONDecodeError as je:
            self._set_login_status(f"❌ Parse error. Raw: {raw[:60]}", C["red"])
            self.login_btn.configure(state="normal", text="   Continue with Google   ")
        except Exception as e:
            self._set_login_status(f"❌ Login failed: {str(e)[:60]}", C["red"])
            self.login_btn.configure(state="normal", text="   Continue with Google   ")

    def _ensure_profile_exists(self):
        """Make sure the user has a wallet and profile on our backend.
        Supabase auth auto-creates the auth.users row on first Google login.
        We just need to ensure our custom tables (profiles, wallets) are populated."""
        try:
            uid = self.user.get("id", "")
            if not uid:
                return
            hdrs = {"apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {self.access_token}",
                    "Content-Type": "application/json"}

            # Check if profile exists
            pr = requests.get(f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{uid}&select=id",
                              headers=hdrs, timeout=8)
            if pr.status_code == 200 and not pr.json():
                # Create profile
                meta = self.user.get("user_metadata", {})
                requests.post(f"{SUPABASE_URL}/rest/v1/profiles",
                              json={"id": uid,
                                    "full_name": meta.get("full_name", meta.get("name", "")),
                                    "avatar_url": meta.get("avatar_url", ""),
                                    "username": self.user.get("email", "").split("@")[0]},
                              headers={**hdrs, "Prefer": "return=minimal"},
                              timeout=8)

            # Check if wallet exists
            wr = requests.get(f"{SUPABASE_URL}/rest/v1/wallets?user_id=eq.{uid}&select=user_id",
                              headers=hdrs, timeout=8)
            if wr.status_code == 200 and not wr.json():
                requests.post(f"{SUPABASE_URL}/rest/v1/wallets",
                              json={"user_id": uid, "vp_balance_cached": 0, "current_streak": 0},
                              headers={**hdrs, "Prefer": "return=minimal"},
                              timeout=8)
        except Exception:
            pass  # Non-critical; server-side triggers may handle this

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # DASHBOARD
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    def _show_dash(self):
        if self.login_frame:
            self.login_frame.pack_forget()
        if self.dash_frame:
            self.dash_frame.destroy()

        self.dash_frame = ctk.CTkFrame(self.container, fg_color="transparent")
        self.dash_frame.pack(fill="both", expand=True)
        self._build_dash()

        threading.Thread(target=self._fetch_data, daemon=True).start()
        self._run_animations()

    def _build_dash(self):
        d = self.dash_frame

        # ─── TOP HEADER BAR ───
        hdr = ctk.CTkFrame(d, fg_color=C["surface"], height=56, corner_radius=0)
        hdr.pack(fill="x")

        hl = ctk.CTkFrame(hdr, fg_color="transparent")
        hl.pack(side="left", padx=16, pady=8)
        ctk.CTkLabel(hl, text="⚡", font=("Segoe UI", 20), text_color=C["pl"]).pack(side="left")
        ctk.CTkLabel(hl, text="VERDEX", font=("Segoe UI", 18, "bold"),
                     text_color=C["pl"]).pack(side="left", padx=2)
        ctk.CTkLabel(hl, text="MINER", font=("Segoe UI", 18, "bold"),
                     text_color=C["t"]).pack(side="left")

        hr = ctk.CTkFrame(hdr, fg_color="transparent")
        hr.pack(side="right", padx=16, pady=8)
        email = self.user.get("email", "Loading...") if self.user else "Loading..."
        self.dash_email = ctk.CTkLabel(hr, text=email, font=("Segoe UI", 10),
                                        text_color=C["tm"])
        self.dash_email.pack(side="right")

        logout_btn = ctk.CTkButton(hr, text="⏻", width=32, height=32,
                                    fg_color=C["s2"], hover_color=C["red"],
                                    text_color=C["tm"], corner_radius=8,
                                    font=("Segoe UI", 14),
                                    command=self._logout)
        logout_btn.pack(side="right", padx=(0, 10))

        # ─── STATUS BAR ───
        sb = ctk.CTkFrame(d, fg_color=C["bg2"], height=32, corner_radius=0)
        sb.pack(fill="x")
        sbl = ctk.CTkFrame(sb, fg_color="transparent")
        sbl.pack(side="left", padx=16, pady=4)
        self.sb_dot = ctk.CTkLabel(sbl, text="●", font=("Segoe UI", 12),
                                    text_color=C["td"])
        self.sb_dot.pack(side="left", padx=(0, 6))
        self.sb_txt = ctk.CTkLabel(sbl, text="Ready", font=("Segoe UI", 10, "bold"),
                                    text_color=C["tm"])
        self.sb_txt.pack(side="left")

        sbr = ctk.CTkFrame(sb, fg_color="transparent")
        sbr.pack(side="right", padx=16, pady=4)
        self.sb_mode_lbl = ctk.CTkLabel(sbr, text="NORMAL", font=("Segoe UI", 9, "bold"),
                                          text_color="#000", fg_color=C["p"],
                                          corner_radius=4, padx=8, height=18)
        self.sb_mode_lbl.pack(side="right")
        self.sb_temp_lbl = ctk.CTkLabel(sbr, text="", font=("Segoe UI", 9),
                                          text_color=C["tm"])
        self.sb_temp_lbl.pack(side="right", padx=(0, 10))

        # ─── TAB NAVIGATION ───
        tab_bar = ctk.CTkFrame(d, fg_color=C["tab_bg"], height=40, corner_radius=0)
        tab_bar.pack(fill="x")

        self.tab_btns = {}
        tabs = [("overview", "📊 Overview"), ("mining", "⛏ Mining"),
                ("history", "📜 History"), ("settings", "⚙ Settings")]
        for tab_id, tab_label in tabs:
            btn = ctk.CTkButton(tab_bar, text=tab_label, width=120, height=36,
                                fg_color=C["tab_sel"] if tab_id == "overview" else "transparent",
                                hover_color=C["s3"], text_color=C["t"],
                                font=("Segoe UI", 11, "bold"), corner_radius=8,
                                command=lambda tid=tab_id: self._switch_tab(tid))
            btn.pack(side="left", padx=4, pady=2)
            self.tab_btns[tab_id] = btn

        # ─── CONTENT AREA ───
        self.content_area = ctk.CTkFrame(d, fg_color="transparent")
        self.content_area.pack(fill="both", expand=True)

        self._build_tab_overview()

    def _switch_tab(self, tab_id):
        self.current_tab = tab_id
        for tid, btn in self.tab_btns.items():
            btn.configure(fg_color=C["tab_sel"] if tid == tab_id else "transparent")

        for w in self.content_area.winfo_children():
            w.destroy()

        if tab_id == "overview":
            self._build_tab_overview()
        elif tab_id == "mining":
            self._build_tab_mining()
        elif tab_id == "history":
            self._build_tab_history()
        elif tab_id == "settings":
            self._build_tab_settings()

    # ── TAB: OVERVIEW ──
    def _build_tab_overview(self):
        sf = ctk.CTkScrollableFrame(self.content_area, fg_color="transparent")
        sf.pack(fill="both", expand=True, padx=16, pady=8)
        self._overview_sf = sf

        # ── Balance Card (Hero) ──
        balance_card = GlowCard(sf, glow_color=C["pl"])
        balance_card.pack(fill="x", pady=(0, 10))
        bi = ctk.CTkFrame(balance_card, fg_color="transparent")
        bi.pack(padx=24, pady=20, fill="x")

        ctk.CTkLabel(bi, text="TOTAL BALANCE", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w")

        vr = ctk.CTkFrame(bi, fg_color="transparent")
        vr.pack(fill="x", pady=(4, 0))
        self.vp_lbl = ctk.CTkLabel(vr, text="0.00", font=("Segoe UI", 44, "bold"),
                                    text_color=C["pl"])
        self.vp_lbl.pack(side="left")
        ctk.CTkLabel(vr, text="VP", font=("Segoe UI", 16, "bold"),
                     text_color=C["p"]).pack(side="left", padx=8, pady=(18, 0))

        self.ph_lbl = ctk.CTkLabel(vr, text="Phase 1 — Light",
                                    font=("Segoe UI", 10, "bold"), text_color="#000",
                                    fg_color=C["p"], corner_radius=6, padx=12, height=24)
        self.ph_lbl.pack(side="right", pady=(10, 0))

        # Stats row
        stats_row = ctk.CTkFrame(bi, fg_color="transparent")
        stats_row.pack(fill="x", pady=(12, 0))

        self.str_lbl = ctk.CTkLabel(stats_row, text="🔥 Streak: 0 days",
                                     font=("Segoe UI", 11), text_color=C["tm"])
        self.str_lbl.pack(side="left")
        self.upt_lbl = ctk.CTkLabel(stats_row, text="⏱ Uptime: 0m",
                                     font=("Segoe UI", 11), text_color=C["tm"])
        self.upt_lbl.pack(side="right")

        if self.mining:
            balance_card.set_glow(True)

        # ── Hashrate Chart Card ──
        chart_card = GlowCard(sf, glow_color=C["cyan"])
        chart_card.pack(fill="x", pady=(0, 10))
        ci = ctk.CTkFrame(chart_card, fg_color="transparent")
        ci.pack(padx=24, pady=18, fill="both", expand=True)

        chart_hdr = ctk.CTkFrame(ci, fg_color="transparent")
        chart_hdr.pack(fill="x")
        ctk.CTkLabel(chart_hdr, text="MINING POWER",
                     font=("Segoe UI", 10, "bold"), text_color=C["td"]).pack(side="left")
        self.peak_lbl = ctk.CTkLabel(chart_hdr, text="Peak: 0 H/s",
                                      font=("Segoe UI", 9), text_color=C["td"])
        self.peak_lbl.pack(side="right")

        hr_row = ctk.CTkFrame(ci, fg_color="transparent")
        hr_row.pack(fill="x", pady=(4, 0))
        self.hr_lbl = ctk.CTkLabel(hr_row, text="0", font=("Segoe UI", 36, "bold"),
                                    text_color=C["pl"])
        self.hr_lbl.pack(side="left")
        ctk.CTkLabel(hr_row, text="H/s", font=("Segoe UI", 12),
                     text_color=C["tm"]).pack(side="left", padx=4, pady=(12, 0))
        self.est_lbl = ctk.CTkLabel(hr_row, text="Est: ~0.0 VP/day",
                                     font=("Segoe UI", 11, "bold"), text_color=C["orange"])
        self.est_lbl.pack(side="right", pady=(12, 0))

        # Sparkline canvas
        self.chart = SparklineChart(ci, height=110)
        self.chart.pack(fill="x", pady=(10, 0))
        self.chart.set_data(self.hash_history)

        chart_footer = ctk.CTkFrame(ci, fg_color="transparent")
        chart_footer.pack(fill="x", pady=(8, 0))
        self.sol_lbl = ctk.CTkLabel(chart_footer, text="⛏ Blocks: 0",
                                     font=("Segoe UI", 10), text_color=C["tm"])
        self.sol_lbl.pack(side="left")
        self.dif_lbl = ctk.CTkLabel(chart_footer, text="Difficulty: 4 zeros",
                                     font=("Segoe UI", 10), text_color=C["tm"])
        self.dif_lbl.pack(side="right")

        if self.mining:
            chart_card.set_glow(True)

        # ── Quick Start Button ──
        start_card = GlowCard(sf)
        start_card.pack(fill="x", pady=(0, 10))
        si = ctk.CTkFrame(start_card, fg_color="transparent")
        si.pack(padx=24, pady=16, fill="x")

        self.mn_btn = ctk.CTkButton(
            si, text="▶  START MINING" if not self.mining else "■  STOP MINING",
            command=self._toggle_mining,
            fg_color=C["p"] if not self.mining else C["red"],
            text_color="#000" if not self.mining else "#fff",
            hover_color=C["pd"] if not self.mining else "#b91c1c",
            font=("Segoe UI", 15, "bold"), height=50, corner_radius=12)
        self.mn_btn.pack(fill="x")

        self.session_earned_lbl = ctk.CTkLabel(
            si, text=f"Session: +{self.total_earned_session:.2f} VP  •  {self.blocks_this_session} blocks",
            font=("Segoe UI", 10), text_color=C["td"])
        self.session_earned_lbl.pack(pady=(8, 0))

        # ── Hardware Card ──
        hw_card = GlowCard(sf)
        hw_card.pack(fill="x", pady=(0, 10))
        hwi = ctk.CTkFrame(hw_card, fg_color="transparent")
        hwi.pack(padx=24, pady=16, fill="x")

        hw_hdr = ctk.CTkFrame(hwi, fg_color="transparent")
        hw_hdr.pack(fill="x")
        ctk.CTkLabel(hw_hdr, text="SYSTEM HARDWARE",
                     font=("Segoe UI", 10, "bold"), text_color=C["td"]).pack(side="left")
        ctk.CTkLabel(hw_hdr, text=f"{self.hw_tier} — {self.hw_score}/100",
                     font=("Segoe UI", 9, "bold"), text_color=self.hw_tier_color).pack(side="right")

        specs_box = ctk.CTkFrame(hwi, fg_color=C["s2"], corner_radius=10)
        specs_box.pack(fill="x", pady=(8, 0))

        spec_items = [
            ("🔲", "CPU", f"{self.cpu_info['name'][:40]}", f"{self.cpu_info['cores']}C / {self.cpu_info['threads']}T"),
            ("🎮", "GPU", f"{self.gpu_info['name'][:40]}", f"{self.gpu_info['vram']} GB VRAM"),
            ("💾", "RAM", f"{self.ram_gb} GB Physical", ""),
        ]
        for icon, label, val, sub in spec_items:
            row = ctk.CTkFrame(specs_box, fg_color="transparent")
            row.pack(fill="x", padx=12, pady=4)
            ctk.CTkLabel(row, text=f"{icon} {label}:", font=("Segoe UI", 10, "bold"),
                         text_color=C["pl"]).pack(side="left")
            ctk.CTkLabel(row, text=val, font=("Segoe UI", 10),
                         text_color=C["t2"]).pack(side="left", padx=6)
            if sub:
                ctk.CTkLabel(row, text=sub, font=("Segoe UI", 9),
                             text_color=C["td"]).pack(side="right")

        self.workers_lbl = ctk.CTkLabel(hwi, text=f"Active Workers: {self.active_workers}",
                                          font=("Segoe UI", 10), text_color=C["td"])
        self.workers_lbl.pack(anchor="w", pady=(8, 0))

        # ── MINING POOL CARD (Real-time Pool Stats) ──
        pool_card = GlowCard(sf, glow_color=C["cyan"])
        pool_card.pack(fill="x", pady=(0, 10))
        pi = ctk.CTkFrame(pool_card, fg_color="transparent")
        pi.pack(padx=24, pady=16, fill="x")

        pool_hdr = ctk.CTkFrame(pi, fg_color="transparent")
        pool_hdr.pack(fill="x")
        ctk.CTkLabel(pool_hdr, text="⛏ VERDEX MINING POOL",
                     font=("Segoe UI", 11, "bold"), text_color=C["cyan"]).pack(side="left")
        self.pool_miners_lbl = ctk.CTkLabel(pool_hdr,
            text=f"👥 {self.pool_data['active_miners']} miners online",
            font=("Segoe UI", 9, "bold"), text_color=C["pl"])
        self.pool_miners_lbl.pack(side="right")

        # Pool hashrate
        pool_hr_row = ctk.CTkFrame(pi, fg_color="transparent")
        pool_hr_row.pack(fill="x", pady=(6, 0))
        ctk.CTkLabel(pool_hr_row, text="Pool Hashrate:",
                     font=("Segoe UI", 10), text_color=C["tm"]).pack(side="left")
        self.pool_hashrate_lbl = ctk.CTkLabel(pool_hr_row,
            text=f"{self.pool_data['hashrate']:,} H/s",
            font=("Segoe UI", 10, "bold"), text_color=C["pl"])
        self.pool_hashrate_lbl.pack(side="right")

        # Round progress
        pool_round = ctk.CTkFrame(pi, fg_color=C["s2"], corner_radius=10)
        pool_round.pack(fill="x", pady=(8, 0))
        pri = ctk.CTkFrame(pool_round, fg_color="transparent")
        pri.pack(fill="x", padx=12, pady=10)

        pr_hdr = ctk.CTkFrame(pri, fg_color="transparent")
        pr_hdr.pack(fill="x")
        ctk.CTkLabel(pr_hdr, text="CURRENT ROUND",
                     font=("Segoe UI", 9, "bold"), text_color=C["td"]).pack(side="left")
        rd = self.pool_data.get("round", {})
        self.pool_round_time_lbl = ctk.CTkLabel(pr_hdr,
            text=f"⏱ {rd.get('minutes_remaining', 60)}m remaining",
            font=("Segoe UI", 9), text_color=C["orange"])
        self.pool_round_time_lbl.pack(side="right")

        # Round progress bar
        self.pool_progress = AnimatedProgress(pri)
        self.pool_progress.pack(fill="x", pady=(6, 4))
        self.after(300, lambda: self.pool_progress.set(rd.get("progress", 0)))

        pr_stats = ctk.CTkFrame(pri, fg_color="transparent")
        pr_stats.pack(fill="x")
        self.pool_shares_lbl = ctk.CTkLabel(pr_stats,
            text=f"Shares: {rd.get('shares_submitted', 0)}",
            font=("Segoe UI", 9), text_color=C["tm"])
        self.pool_shares_lbl.pack(side="left")
        self.pool_reward_lbl = ctk.CTkLabel(pr_stats,
            text=f"Reward Pool: {rd.get('reward_pool', 10):.1f} VP",
            font=("Segoe UI", 9, "bold"), text_color=C["orange"])
        self.pool_reward_lbl.pack(side="right")

        # Your contribution
        your = self.pool_data.get("your_stats") or {}
        your_card = ctk.CTkFrame(pi, fg_color=C["s2"], corner_radius=10)
        your_card.pack(fill="x", pady=(8, 0))
        yi = ctk.CTkFrame(your_card, fg_color="transparent")
        yi.pack(fill="x", padx=12, pady=8)

        ctk.CTkLabel(yi, text="YOUR CONTRIBUTION",
                     font=("Segoe UI", 9, "bold"), text_color=C["td"]).pack(anchor="w")
        yr = ctk.CTkFrame(yi, fg_color="transparent")
        yr.pack(fill="x", pady=(4, 0))
        self.your_shares_lbl = ctk.CTkLabel(yr,
            text=f"⛏ Shares: {your.get('shares_this_round', 0)}",
            font=("Segoe UI", 10), text_color=C["t2"])
        self.your_shares_lbl.pack(side="left")
        self.your_pct_lbl = ctk.CTkLabel(yr,
            text=f"{your.get('share_percent', '0.0')}% of pool",
            font=("Segoe UI", 10, "bold"), text_color=C["pl"])
        self.your_pct_lbl.pack(side="right")

        yr2 = ctk.CTkFrame(yi, fg_color="transparent")
        yr2.pack(fill="x", pady=(2, 0))
        self.your_est_lbl = ctk.CTkLabel(yr2,
            text=f"Est. Reward: ~{your.get('estimated_round_reward', '0.00')} VP",
            font=("Segoe UI", 10, "bold"), text_color=C["orange"])
        self.your_est_lbl.pack(side="left")
        self.your_rank_lbl = ctk.CTkLabel(yr2,
            text=f"Rank #{your.get('rank', '-')}",
            font=("Segoe UI", 10), text_color=C["tm"])
        self.your_rank_lbl.pack(side="right")

        # Network Stats
        net = self.pool_data.get("network", {})
        net_row = ctk.CTkFrame(pi, fg_color="transparent")
        net_row.pack(fill="x", pady=(8, 0))
        ctk.CTkLabel(net_row, text=f"⚡ Network: {net.get('total_blocks_mined', 0):,} blocks | {net.get('total_vp_mined', 0):,.1f} VP mined",
                     font=("Segoe UI", 9), text_color=C["td"]).pack(anchor="w")

        if self.mining:
            pool_card.set_glow(True)

    # ── TAB: MINING ──
    def _build_tab_mining(self):
        sf = ctk.CTkScrollableFrame(self.content_area, fg_color="transparent")
        sf.pack(fill="both", expand=True, padx=16, pady=8)

        # Mode Selection Card
        mode_card = GlowCard(sf)
        mode_card.pack(fill="x", pady=(0, 10))
        mi = ctk.CTkFrame(mode_card, fg_color="transparent")
        mi.pack(padx=24, pady=18, fill="x")

        ctk.CTkLabel(mi, text="MINING MODE", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w", pady=(0, 12))

        modes = [
            ("eco", "🌿 ECO MODE", "30% CPU · Low power · Silent operation", C["blue"]),
            ("normal", "⚡ NORMAL MODE", "50% CPU · Balanced performance", C["p"]),
            ("pro", "🔥 PRO MODE", "100% CPU/GPU · Maximum hashrate · Heat warning", C["red"]),
        ]
        self._mode_btns = {}
        for mode_id, label, desc, color in modes:
            btn_frame = ctk.CTkFrame(mi, fg_color=C["s2"] if self.mining_mode != mode_id else color,
                                      corner_radius=12, border_width=2,
                                      border_color=color if self.mining_mode == mode_id else C["s3"])
            btn_frame.pack(fill="x", pady=3)

            bf_inner = ctk.CTkFrame(btn_frame, fg_color="transparent")
            bf_inner.pack(fill="x", padx=16, pady=12)

            ctk.CTkLabel(bf_inner, text=label, font=("Segoe UI", 12, "bold"),
                         text_color=C["t"] if self.mining_mode != mode_id else "#000").pack(anchor="w")
            ctk.CTkLabel(bf_inner, text=desc, font=("Segoe UI", 10),
                         text_color=C["tm"] if self.mining_mode != mode_id else "#333").pack(anchor="w")

            btn_frame.bind("<Button-1>", lambda e, m=mode_id: self._set_mode(m))
            for child in bf_inner.winfo_children():
                child.bind("<Button-1>", lambda e, m=mode_id: self._set_mode(m))
            self._mode_btns[mode_id] = (btn_frame, color)

        # Mining Control
        ctrl_card = GlowCard(sf)
        ctrl_card.pack(fill="x", pady=(0, 10))
        ci = ctk.CTkFrame(ctrl_card, fg_color="transparent")
        ci.pack(padx=24, pady=18, fill="x")

        ctk.CTkLabel(ci, text="CONTROL PANEL", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w", pady=(0, 12))

        self.mine_btn2 = ctk.CTkButton(
            ci, text="▶  START MINING" if not self.mining else "■  STOP MINING",
            command=self._toggle_mining,
            fg_color=C["p"] if not self.mining else C["red"],
            text_color="#000" if not self.mining else "#fff",
            hover_color=C["pd"] if not self.mining else "#b91c1c",
            font=("Segoe UI", 15, "bold"), height=50, corner_radius=12)
        self.mine_btn2.pack(fill="x")

        # Thermal Protection Info
        info_card = GlowCard(sf)
        info_card.pack(fill="x", pady=(0, 10))
        ii = ctk.CTkFrame(info_card, fg_color="transparent")
        ii.pack(padx=24, pady=16, fill="x")

        ctk.CTkLabel(ii, text="THERMAL PROTECTION", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w", pady=(0, 8))

        protections = [
            "🔋 Battery < 50%: Auto-throttle to 50% workers",
            "🌡 CPU > 85°C: Auto-pause mining (if temp available)",
            "💤 Pro Mode: Uses all CPU cores + GPU stress test",
            "🌿 Eco Mode: Minimal footprint, background-friendly",
        ]
        for p in protections:
            ctk.CTkLabel(ii, text=p, font=("Segoe UI", 10),
                         text_color=C["t2"]).pack(anchor="w", pady=2)

    # ── TAB: HISTORY ──
    def _build_tab_history(self):
        sf = ctk.CTkScrollableFrame(self.content_area, fg_color="transparent")
        sf.pack(fill="both", expand=True, padx=16, pady=8)

        # Sessions Card
        sess_card = GlowCard(sf)
        sess_card.pack(fill="x", pady=(0, 10))
        si = ctk.CTkFrame(sess_card, fg_color="transparent")
        si.pack(padx=24, pady=18, fill="x")

        ctk.CTkLabel(si, text="RECENT MINING SESSIONS", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w", pady=(0, 10))

        if not self.sessions:
            ctk.CTkLabel(si, text="No sessions recorded yet",
                         font=("Segoe UI", 10), text_color=C["td"]).pack(anchor="w")
        else:
            for s in self.sessions[:6]:
                f = ctk.CTkFrame(si, fg_color=C["s2"], corner_radius=10,
                                  border_width=1, border_color=C["s3"])
                f.pack(fill="x", pady=3)
                r = ctk.CTkFrame(f, fg_color="transparent")
                r.pack(fill="x", padx=14, pady=10)

                dev_name = s.get("device_name", "Unknown Device")
                ctk.CTkLabel(r, text=dev_name, font=("Segoe UI", 11, "bold"),
                             text_color=C["t"]).pack(anchor="w")

                mr = ctk.CTkFrame(r, fg_color="transparent")
                mr.pack(fill="x", pady=(2, 0))
                st = s.get("status", "paused")
                cc = C["p"] if st == "active" else (C["orange"] if st == "paused" else C["td"])
                ctk.CTkLabel(mr, text=f"● {st.upper()}", font=("Segoe UI", 9, "bold"),
                             text_color=cc).pack(side="left")

                ut = s.get("total_uptime_seconds", 0)
                ut_str = f"{ut // 3600}h {(ut % 3600) // 60}m" if ut >= 3600 else f"{ut // 60}m"
                ctk.CTkLabel(mr, text=f"Uptime: {ut_str}",
                             font=("Segoe UI", 9), text_color=C["tm"]).pack(side="right")

        # Transactions Card
        tx_card = GlowCard(sf)
        tx_card.pack(fill="x", pady=(0, 10))
        ti = ctk.CTkFrame(tx_card, fg_color="transparent")
        ti.pack(padx=24, pady=18, fill="x")

        ctk.CTkLabel(ti, text="TRANSACTION HISTORY", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w", pady=(0, 10))

        if not self.transactions:
            ctk.CTkLabel(ti, text="No transactions yet",
                         font=("Segoe UI", 10), text_color=C["td"]).pack(anchor="w")
        else:
            for t in self.transactions[:10]:
                f = ctk.CTkFrame(ti, fg_color=C["s2"], corner_radius=8)
                f.pack(fill="x", pady=2)
                r = ctk.CTkFrame(f, fg_color="transparent")
                r.pack(fill="x", padx=12, pady=8)

                amt = t.get("amount", 0)
                cc = C["pl"] if amt > 0 else C["red"]
                ctk.CTkLabel(r, text=f"{'+' if amt > 0 else ''}{amt:.2f} VP",
                             font=("Segoe UI", 11, "bold"), text_color=cc).pack(side="left")

                desc = t.get("description", t.get("type", ""))
                if len(desc) > 40:
                    desc = desc[:37] + "..."
                ctk.CTkLabel(r, text=desc, font=("Segoe UI", 9),
                             text_color=C["tm"]).pack(side="left", padx=10)

                dt = t.get("created_at", "")[:16].replace("T", " ") if t.get("created_at") else ""
                ctk.CTkLabel(r, text=dt, font=("Segoe UI", 9),
                             text_color=C["td"]).pack(side="right")

    # ── TAB: SETTINGS ──
    def _build_tab_settings(self):
        sf = ctk.CTkScrollableFrame(self.content_area, fg_color="transparent")
        sf.pack(fill="both", expand=True, padx=16, pady=8)

        # Account Card
        acc_card = GlowCard(sf)
        acc_card.pack(fill="x", pady=(0, 10))
        ai = ctk.CTkFrame(acc_card, fg_color="transparent")
        ai.pack(padx=24, pady=18, fill="x")

        ctk.CTkLabel(ai, text="ACCOUNT", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w", pady=(0, 10))

        email = self.user.get("email", "N/A") if self.user else "N/A"
        uid = self.user.get("id", "N/A")[:12] + "..." if self.user else "N/A"
        meta = self.user.get("user_metadata", {}) if self.user else {}
        name = meta.get("full_name", meta.get("name", "N/A"))

        info_items = [
            ("👤", "Name", name),
            ("📧", "Email", email),
            ("🆔", "User ID", uid),
            ("📱", "Device", platform.node()),
            ("🔑", "Token", (self.api_token[:16] + "...") if self.api_token else "N/A"),
        ]
        for icon, label, val in info_items:
            row = ctk.CTkFrame(ai, fg_color="transparent")
            row.pack(fill="x", pady=2)
            ctk.CTkLabel(row, text=f"{icon} {label}:", font=("Segoe UI", 10, "bold"),
                         text_color=C["tm"]).pack(side="left")
            ctk.CTkLabel(row, text=val, font=("Segoe UI", 10),
                         text_color=C["t2"]).pack(side="left", padx=8)

        # About Card
        about_card = GlowCard(sf)
        about_card.pack(fill="x", pady=(0, 10))
        abi = ctk.CTkFrame(about_card, fg_color="transparent")
        abi.pack(padx=24, pady=18, fill="x")

        ctk.CTkLabel(abi, text="ABOUT", font=("Segoe UI", 10, "bold"),
                     text_color=C["td"]).pack(anchor="w", pady=(0, 10))

        about_items = [
            f"Verdex Miner v{VERSION}",
            f"Python {platform.python_version()} • {platform.system()} {platform.release()}",
            f"Hardware Score: {self.hw_score}/100 ({self.hw_tier})",
            f"Fingerprint: {self.dfp[:16]}...",
            f"API: {API_BASE}",
        ]
        for item in about_items:
            ctk.CTkLabel(abi, text=item, font=("Segoe UI", 10),
                         text_color=C["t2"]).pack(anchor="w", pady=1)

        # Logout Button
        ctk.CTkButton(sf, text="⏻  Sign Out & Clear Session",
                      command=self._logout,
                      fg_color=C["red"], hover_color="#b91c1c",
                      text_color="#fff", font=("Segoe UI", 13, "bold"),
                      height=46, corner_radius=12).pack(fill="x", pady=(10, 10))

    # ── MODE HANDLING ──
    def _set_mode(self, mode):
        self.mining_mode = mode
        mode_labels = {"eco": "ECO", "normal": "NORMAL", "pro": "PRO"}
        mode_colors = {"eco": C["blue"], "normal": C["p"], "pro": C["red"]}
        self.sb_mode_lbl.configure(text=mode_labels[mode], fg_color=mode_colors[mode])

        # Rebuild mining tab if visible
        if self.current_tab == "mining":
            self._switch_tab("mining")

    def _logout(self):
        self.mining = False
        time.sleep(0.3)
        self.user = None
        self.access_token = None
        self.refresh_token = None
        self.api_token = None
        # Clear saved session
        p = self._get_config_path()
        try:
            if os.path.exists(p):
                os.remove(p)
        except Exception:
            pass

        if self.dash_frame:
            self.dash_frame.destroy()
            self.dash_frame = None
        self._build_login()

    # ── DASHBOARD UPDATES ──
    def _update_overview(self):
        """Update all dashboard labels if we're on the overview tab."""
        try:
            self.vp_lbl.configure(text=f"{self.vp:,.2f}")
            self.str_lbl.configure(text=f"🔥 Streak: {self.streak} days")

            ut = self.uptime
            ut_str = f"{ut // 3600}h {(ut % 3600) // 60}m" if ut >= 3600 else f"{ut // 60}m"
            self.upt_lbl.configure(text=f"⏱ Uptime: {ut_str}")

            self.sol_lbl.configure(text=f"⛏ Blocks: {self.solved}")
            self.hr_lbl.configure(text=f"{self.hashrate:,.0f}")
            self.peak_lbl.configure(text=f"Peak: {self.peak_hashrate:,.0f} H/s")

            mode_mult = {"eco": 0.7, "normal": 1.0, "pro": 1.5}
            est_day = (self.hashrate / max(1000, self.hashrate)) * 12.0 * self.reward_rate * mode_mult.get(self.mining_mode, 1.0)
            self.est_lbl.configure(text=f"Est: ~{est_day:.1f} VP/day")

            pc = {1: C["p"], 2: C["orange"], 3: C["red"]}.get(self.phase_num, C["p"])
            self.ph_lbl.configure(text=f"Phase {self.phase_num} — {self.phase_name}", fg_color=pc)

            self.session_earned_lbl.configure(
                text=f"Session: +{self.total_earned_session:.2f} VP  •  {self.blocks_this_session} blocks")

            self.workers_lbl.configure(text=f"Active Workers: {self.active_workers}")

            # Update chart
            self.hash_history.pop(0)
            self.hash_history.append(self.hashrate)
            self.chart.push(self.hashrate)

            # Update pool stats
            pd = self.pool_data
            rd = pd.get("round", {})
            your = pd.get("your_stats") or {}
            net = pd.get("network", {})
            self.pool_miners_lbl.configure(text=f"👥 {pd.get('active_miners', 0)} miners online")
            self.pool_hashrate_lbl.configure(text=f"{pd.get('hashrate', 0):,} H/s")
            self.pool_round_time_lbl.configure(text=f"⏱ {rd.get('minutes_remaining', 60)}m remaining")
            self.pool_progress.set(rd.get("progress", 0))
            self.pool_shares_lbl.configure(text=f"Shares: {rd.get('shares_submitted', 0)}")
            self.pool_reward_lbl.configure(text=f"Reward Pool: {rd.get('reward_pool', 10):.1f} VP")
            self.your_shares_lbl.configure(text=f"⛏ Shares: {your.get('shares_this_round', 0)}")
            self.your_pct_lbl.configure(text=f"{your.get('share_percent', '0.0')}% of pool")
            self.your_est_lbl.configure(text=f"Est. Reward: ~{your.get('estimated_round_reward', '0.00')} VP")
            self.your_rank_lbl.configure(text=f"Rank #{your.get('rank', '-')}")

        except Exception:
            pass  # Widget may not exist if tab changed

    def _fetch_data(self):
        """Fetch wallet, sessions, transactions from Supabase."""
        if not self.access_token:
            return
        try:
            uid = ""
            if self.user:
                uid = self.user.get("id", "")
            if not uid:
                ur = requests.get(f"{SUPABASE_URL}/auth/v1/user",
                                  headers={"apikey": SUPABASE_ANON_KEY,
                                           "Authorization": f"Bearer {self.access_token}"},
                                  timeout=8)
                if ur.status_code == 200:
                    self.user = ur.json()
                    uid = self.user.get("id", "")

            if not uid:
                return

            hdrs = {"apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {self.access_token}"}
            email = self.user.get("email", "Anonymous")
            try:
                self.dash_email.configure(text=email)
            except Exception:
                pass

            # Wallet
            wr = requests.get(f"{SUPABASE_URL}/rest/v1/wallets?user_id=eq.{uid}&select=*",
                              headers=hdrs, timeout=8)
            if wr.status_code == 200 and wr.json():
                w = wr.json()[0]
                self.vp = w.get("vp_balance_cached", 0)
                self.streak = w.get("current_streak", 0)
                self.uptime = w.get("total_uptime_seconds", 0)

            # Sessions
            sr = requests.get(f"{SUPABASE_URL}/rest/v1/mining_sessions?user_id=eq.{uid}&order=started_at.desc&limit=8",
                              headers=hdrs, timeout=8)
            if sr.status_code == 200:
                self.sessions = sr.json() or []

            # Transactions
            tr = requests.get(f"{SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.{uid}&order=created_at.desc&limit=15",
                              headers=hdrs, timeout=8)
            if tr.status_code == 200:
                self.transactions = tr.json() or []

            if self.current_tab == "overview":
                self._update_overview()

            # Fetch pool status (real-time pool data)
            try:
                pool_hdrs = {"Content-Type": "application/json"}
                if self.api_token:
                    pool_hdrs["X-Device-Token"] = self.api_token
                pr = requests.get(f"{API_BASE}/api/mining/pool-status",
                                  headers=pool_hdrs, timeout=10)
                if pr.status_code == 200:
                    pool_resp = pr.json()
                    if pool_resp.get("success") and pool_resp.get("pool"):
                        self.pool_data = pool_resp["pool"]
                        if self.current_tab == "overview":
                            self._update_overview()
            except Exception:
                pass  # Pool fetch is non-critical

        except Exception:
            try:
                self.sb_txt.configure(text="⚡ Sync delay...", text_color=C["orange"])
            except Exception:
                pass

    # ── ANIMATIONS ──
    def _run_animations(self):
        """Master animation loop for dashboard."""
        if not self.dash_frame or not self.dash_frame.winfo_exists():
            return

        self._anim_phase = (self._anim_phase + 0.06) % (2 * math.pi)

        # Mining pulse effect
        if self.mining:
            # Pulsing dot
            intensity = 0.5 + 0.5 * math.sin(self._anim_phase * 3)
            if intensity > 0.7:
                self.sb_dot.configure(text_color=C["pl"])
            else:
                self.sb_dot.configure(text_color=C["p"])

            # Update temperature
            if int(self._anim_phase * 10) % 50 == 0:
                self.cpu_temp = SystemDetector.get_cpu_temp()
                if self.cpu_temp is not None:
                    tc = C["p"] if self.cpu_temp < 70 else (C["orange"] if self.cpu_temp < 85 else C["red"])
                    self.sb_temp_lbl.configure(text=f"🌡 {self.cpu_temp}°C", text_color=tc)
        else:
            self.sb_dot.configure(text_color=C["td"])

        # Periodic data sync (every ~15 seconds)
        if int(self._anim_phase * 10) % 90 == 0:
            threading.Thread(target=self._fetch_data, daemon=True).start()

        self.after(80, self._run_animations)

    # ── MINING ENGINE ──
    def _toggle_mining(self):
        if self.mining:
            self.mining = False
            try:
                self.mn_btn.configure(text="▶  START MINING", fg_color=C["p"],
                                       text_color="#000", hover_color=C["pd"])
            except Exception:
                pass
            try:
                self.mine_btn2.configure(text="▶  START MINING", fg_color=C["p"],
                                          text_color="#000", hover_color=C["pd"])
            except Exception:
                pass
            self.sb_txt.configure(text="Mining Stopped", text_color=C["tm"])
            self.sb_dot.configure(text_color=C["td"])
            self.hashrate = 0
            self.active_workers = 0
            if self.current_tab == "overview":
                self._update_overview()
        else:
            if not self.api_token:
                messagebox.showwarning("Authentication Required",
                                       "Please sign in with Google before mining.")
                return
            self.mining = True
            self.start_time = time.time()
            self.total_earned_session = 0.0
            self.blocks_this_session = 0

            try:
                self.mn_btn.configure(text="■  STOP MINING", fg_color=C["red"],
                                       text_color="#fff", hover_color="#b91c1c")
            except Exception:
                pass
            try:
                self.mine_btn2.configure(text="■  STOP MINING", fg_color=C["red"],
                                          text_color="#fff", hover_color="#b91c1c")
            except Exception:
                pass
            self.sb_txt.configure(text="⚡ Initializing SHA-256 PoW Workers...", text_color=C["pl"])
            self.sb_dot.configure(text_color=C["p"])

            self.mining_thread = threading.Thread(target=self._mining_loop, daemon=True)
            self.mining_thread.start()

    def _mining_loop(self):
        cores = multiprocessing.cpu_count()
        mode_workers = {
            "eco": max(1, cores // 3),
            "normal": max(1, cores // 2),
            "pro": min(cores, 12),
        }
        workers = mode_workers.get(self.mining_mode, max(1, cores // 2))
        self.active_workers = workers

        session = requests.Session()
        hw_profile = {
            "cpu_name": self.cpu_info["name"],
            "cpu_cores": self.cpu_info["cores"],
            "cpu_threads": self.cpu_info["threads"],
            "cpu_freq_mhz": self.cpu_info.get("freq_mhz", 0),
            "ram_gb": self.ram_gb,
            "gpu_name": self.gpu_info["name"],
            "gpu_vram_gb": self.gpu_info["vram"],
            "gpu_type": self.gpu_info["type"],
            "benchmark_score": self.hw_score * 1000,
        }

        self.sb_txt.configure(text=f"⛏ Mining: {workers} workers ({self.mining_mode.upper()})",
                              text_color=C["pl"])

        while self.mining:
            try:
                # Check battery for thermal throttling
                is_plugged, bat_pct = SystemDetector.get_battery_status()
                actual_workers = workers
                if not is_plugged and bat_pct < 50:
                    actual_workers = max(1, workers // 2)
                    self.sb_txt.configure(text=f"🔋 Eco-throttle ({bat_pct}%): {actual_workers} workers",
                                          text_color=C["orange"])
                self.active_workers = actual_workers

                # Check CPU temp for thermal protection
                if self.cpu_temp and self.cpu_temp > 90:
                    self.sb_txt.configure(text=f"🌡 Thermal pause: {self.cpu_temp}°C",
                                          text_color=C["red"])
                    time.sleep(15)
                    continue

                # 1. Request challenge
                r = session.post(f"{API_BASE}/api/mining/challenge", json={
                    "device_fingerprint": self.dfp,
                    "device_os": platform.system().lower(),
                    "device_arch": platform.machine(),
                    "cli_version": VERSION,
                    "mining_mode": self.mining_mode,
                    "mining_source": "desktop",
                    "hardware_profile": hw_profile,
                }, headers={
                    "X-Device-Token": self.api_token,
                    "Content-Type": "application/json",
                }, timeout=15)

                if r.status_code != 200:
                    self.sb_txt.configure(text=f"⚠ Server: {r.status_code}",
                                          text_color=C["orange"])
                    time.sleep(5)
                    continue

                d = r.json()
                ch = d.get("challenge") or d.get("pow_challenge", "")
                diff = d.get("difficulty", 4)
                self.reward_rate = d.get("reward_per_share", 1)
                self.phase_num = d.get("phase", 1)
                self.phase_name = d.get("phase_label", "Light")

                try:
                    self.dif_lbl.configure(text=f"Difficulty: {diff} zeros")
                except Exception:
                    pass

                # 2. Solve PoW
                sol = self._solve_pow(ch, diff, actual_workers)
                if not sol or not self.mining:
                    continue

                nonce, hr = sol
                self.hashrate = hr
                if hr > self.peak_hashrate:
                    self.peak_hashrate = hr

                # 3. Submit heartbeat
                sr = session.post(f"{API_BASE}/api/mining/heartbeat", json={
                    "nonce": nonce,
                    "pow_solution": nonce,
                    "mining_mode": self.mining_mode,
                    "mining_source": "desktop",
                    "hashrate": hr,
                    "hardware_profile": hw_profile,
                }, headers={
                    "X-Device-Token": self.api_token,
                    "Content-Type": "application/json",
                }, timeout=15)

                if sr.status_code == 200:
                    res = sr.json()
                    self.vp = res.get("vp_balance", self.vp)
                    self.streak = res.get("streak", self.streak)
                    self.uptime = res.get("uptime_total_seconds", self.uptime)
                    self.solved += 1
                    self.blocks_this_session += 1
                    reward_vp = res.get("reward_vp", self.reward_rate)
                    self.total_earned_session += reward_vp

                    tier = res.get("hardware_tier", self.hw_tier)
                    self.sb_txt.configure(
                        text=f"✅ Block #{self.solved}! +{reward_vp:.2f} VP ({tier})",
                        text_color=C["pl"])
                elif sr.status_code == 429:
                    cooldown = sr.json().get("wait_seconds", 10)
                    self.sb_txt.configure(text=f"⏳ Cooldown: {cooldown}s",
                                          text_color=C["orange"])
                    time.sleep(min(cooldown, 30))
                else:
                    err_msg = ""
                    try:
                        err_msg = sr.json().get("error", "")[:40]
                    except Exception:
                        pass
                    self.sb_txt.configure(text=f"❌ Rejected: {err_msg}",
                                          text_color=C["red"])
                    time.sleep(5)

                if self.current_tab == "overview":
                    self._update_overview()

            except requests.exceptions.ConnectionError:
                self.sb_txt.configure(text="📡 Connection lost... retrying",
                                      text_color=C["red"])
                time.sleep(8)
            except Exception as e:
                self.sb_txt.configure(text=f"⚠ Error: {str(e)[:40]}",
                                      text_color=C["red"])
                time.sleep(5)

        self.sb_txt.configure(text="Stopped", text_color=C["tm"])
        self.sb_dot.configure(text_color=C["td"])
        self.active_workers = 0

    def _solve_pow(self, challenge, difficulty, workers):
        """Spawns independent subprocess solvers to avoid PyInstaller multiprocessing constraints."""
        target = "0" * difficulty
        start = time.time()

        solved_nonce = None
        total_hashes = [0]
        lock = threading.Lock()

        # Build execution command
        cmd = [sys.executable]
        if not getattr(sys, 'frozen', False):
            # If running as raw .py source
            cmd = [sys.executable, __file__]

        procs = []
        for i in range(workers):
            worker_cmd = cmd + ["--worker", challenge, target, str(i)]
            try:
                # Spawn subprocess with CREATE_NO_WINDOW flag on Windows to hide console windows
                creationflags = 0
                if platform.system() == "Windows":
                    creationflags = 0x08000000 # CREATE_NO_WINDOW
                p = subprocess.Popen(worker_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     text=True, creationflags=creationflags)
                procs.append(p)
            except Exception:
                pass

        def read_stdout(p):
            nonlocal solved_nonce
            try:
                for line in p.stdout:
                    line = line.strip()
                    if line.startswith("SOLVED:"):
                        solved_nonce = line.split(":", 1)[1]
                        # Terminate all other processes
                        for pr in procs:
                            try: pr.terminate()
                            except: pass
                        break
                    elif line.startswith("HASHES:"):
                        diff = int(line.split(":", 1)[1])
                        with lock:
                            total_hashes[0] += diff
            except Exception:
                pass

        threads = []
        for p in procs:
            t = threading.Thread(target=read_stdout, args=(p,), daemon=True)
            t.start()
            threads.append(t)

        # Monitor progress with real-time hashrate updates
        while solved_nonce is None and (time.time() - start) < 90 and self.mining:
            time.sleep(0.4)
            elapsed = time.time() - start
            if elapsed > 0.5:
                try:
                    with lock:
                        hr = total_hashes[0] / elapsed
                    self.hashrate = hr
                    if hr > self.peak_hashrate:
                        self.peak_hashrate = hr
                    if self.current_tab == "overview":
                        self.hr_lbl.configure(text=f"{hr:,.0f}")
                        self.hash_history.pop(0)
                        self.hash_history.append(hr)
                        self.chart.push(hr)
                except Exception:
                    pass

        # Cleanup remaining processes
        for p in procs:
            try:
                p.terminate()
                p.wait(timeout=1)
            except Exception:
                pass

        if solved_nonce:
            elapsed = time.time() - start
            with lock:
                rate = total_hashes[0] / max(0.1, elapsed)
            return (solved_nonce, rate)

        # Fallback single-threaded solver
        if not self.mining:
            return None
        lc, t0 = 0, time.time()
        while time.time() - start < 120 and self.mining:
            n = str(uuid.uuid4()).replace("-", "") + str(int(time.time() * 1e9))
            h = hashlib.sha256((challenge + n).encode()).hexdigest()
            lc += 1
            if h.startswith(target):
                e = time.time() - t0
                return (n, lc / e if e > 0 else 0)
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ENTRY POINT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--worker":
        # Headless solver subprocess execution!
        challenge = sys.argv[2]
        target = sys.argv[3]
        worker_id = sys.argv[4]
        
        import hashlib
        import os
        import time
        import sys
        
        prefix = os.urandom(4).hex() + str(worker_id)
        count = 0
        while True:
            n = prefix + os.urandom(8).hex() + str(int(time.time() * 1e9))
            h = hashlib.sha256((challenge + n).encode()).hexdigest()
            count += 1
            if h.startswith(target):
                print(f"SOLVED:{n}", flush=True)
                sys.exit(0)
            if count % 10000 == 0:
                print(f"HASHES:{10000}", flush=True)
                
    # Otherwise run normal desktop GUI application
    VerdexMiner().mainloop()
