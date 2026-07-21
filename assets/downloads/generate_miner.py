#!/usr/bin/env python3
"""Generate the enhanced Verdex Miner source code."""
import os

CODE = r'''#!/usr/bin/env python3
"""
Verdex Miner v2.0 - Ultimate Edition
Supabase Google OAuth (PKCE) + Full Dashboard + CPU PoW Mining
"""
import customtkinter as ctk, tkinter as tk
from tkinter import messagebox
import threading, time, json, os, sys, hashlib, multiprocessing, platform, uuid
import requests, secrets, base64, webbrowser, random, math
from datetime import datetime, timedelta
from urllib.parse import urlencode
import http.server, socketserver

API_BASE = "https://verdexswap.site"
SUPABASE_URL = "https://unbzescopxtmtbrgqlhh.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYnplc2NvcHh0bXRicmdxbGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Njc1MjcsImV4cCI6MjA5OTE0MzUyN30.jHm7uIV_fBWIP-EFl3d2AY5P42X3tcIIbEGwNfSYiPM"
REDIRECT_PORT = 8420

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("green")

C = {
    "bg": "#010301", "surface": "#0a1a0a", "s2": "#0f2410", "s3": "#15301a",
    "p": "#22c55e", "pl": "#4ade80", "pd": "#16a34a", "pg": "#166534",
    "t": "#f0fdf4", "tm": "#86a389", "td": "#4a6d4d",
    "d": "#ef4444", "dl": "#fca5a5", "w": "#f59e0b", "b": "#3b82f6",
}

def pkce():
    v = secrets.token_urlsafe(64)[:128]
    d = hashlib.sha256(v.encode()).digest()
    c = base64.urlsafe_b64encode(d).rstrip(b"=").decode()
    return v, c

def fp():
    h = hashlib.sha256()
    for p in [platform.node(), str(uuid.getnode()),
              os.environ.get("COMPUTERNAME", "unknown"),
              os.environ.get("PROCESSOR_IDENTIFIER", "unknown"), "win"]:
        h.update(str(p).encode())
    return h.hexdigest()


class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Verdex Miner v2.0")
        w, h = 580, 860
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        x, y = max(0, (sw - w) // 2), max(0, (sh - h) // 2)
        self.geometry(f"{w}x{h}+{x}+{y}")
        self.minsize(520, 750)
        self.configure(fg_color=C["bg"])
        self.resizable(False, False)

        self.user = None
        self.access_token = None
        self.api_token = None
        self.dfp = fp()
        self.mining = False
        self.pro_mode = False
        self.mining_thread = None
        self._anim_phase = 0.0

        self.wallet = None
        self.sessions = []
        self.transactions = []
        self.streak = 0
        self.vp = 0
        self.phase_num = 1
        self.phase_name = "Light Phase"
        self.solved = 0
        self.hashrate = 0
        self.uptime = 0
        self.start_time = None
        self.reward_rate = 1

        self.container = ctk.CTkFrame(self, fg_color="transparent")
        self.container.pack(fill="both", expand=True)
        self.login_frame = None
        self.dash_frame = None
        self._build_login()
        self._load()
        self.protocol("WM_DELETE_WINDOW", self._exit)

    def _load(self):
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".verdex")
        if os.path.exists(p):
            try:
                with open(p) as f:
                    d = json.load(f)
                if d.get("api_token"):
                    self.api_token = d["api_token"]
                    self.access_token = d.get("access_token")
                    self.after(300, self._show_dash)
            except:
                pass

    def _save(self):
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".verdex")
        try:
            with open(p, "w") as f:
                json.dump({
                    "api_token": self.api_token,
                    "access_token": self.access_token,
                    "email": self.user.get("email", "") if self.user else ""
                }, f)
        except:
            pass

    def _exit(self):
        self.mining = False
        time.sleep(0.3)
        self.destroy()

    # ── LOGIN ──
    def _build_login(self):
        if self.login_frame:
            self.login_frame.destroy()
        self.login_frame = ctk.CTkFrame(self.container, fg_color="transparent")
        self.login_frame.pack(fill="both", expand=True)
        c = self.login_frame
        c.grid_columnconfigure(0, weight=1)
        c.grid_rowconfigure(0, weight=1)

        card = ctk.CTkFrame(c, fg_color=C["surface"], corner_radius=28,
                            border_width=1, border_color=C["s2"])
        card.grid(row=0, column=0, padx=28)

        inner = ctk.CTkFrame(card, fg_color="transparent")
        inner.pack(padx=40, pady=40)

        ctk.CTkLabel(inner, text="\u26a1", font=("Segoe UI", 56),
                     text_color=C["p"]).pack(pady=(0, 4))
        tf = ctk.CTkFrame(inner, fg_color="transparent")
        tf.pack()
        ctk.CTkLabel(tf, text="VERDEX", font=("Segoe UI", 36, "bold"),
                     text_color=C["pl"]).pack(side="left")
        ctk.CTkLabel(tf, text="MINER", font=("Segoe UI", 36, "bold"),
                     text_color=C["t"]).pack(side="left")
        ctk.CTkLabel(inner, text="Desktop Mining Application",
                     font=("Segoe UI", 11), text_color=C["tm"]).pack(pady=(0, 28))

        self.login_btn = ctk.CTkButton(
            inner, text="  \u25b6  Continue with Google  ",
            command=self._google_login,
            fg_color="#ffffff", text_color="#111111", hover_color="#e0e0e0",
            font=("Segoe UI", 14, "bold"), height=48, corner_radius=14)
        self.login_btn.pack(pady=(0, 4))

        ctk.CTkLabel(inner, text="Sign in with your Google account",
                     font=("Segoe UI", 9), text_color=C["td"]).pack(pady=(0, 16))

        self.login_status = ctk.CTkLabel(inner, text="",
                                         font=("Segoe UI", 11), text_color=C["tm"])
        self.login_status.pack()

    def _set_login_status(self, t, c=C["tm"]):
        try:
            self.login_status.configure(text=t, text_color=c)
            self.update()
        except:
            pass

    # ── OAUTH ──
    def _google_login(self):
        self._set_login_status("Starting authentication...", C["w"])
        self.login_btn.configure(state="disabled", text="  \u23f3  Connecting...  ")

        self.pkce_v, self.pkce_c = pkce()
        result = [None]

        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                from urllib.parse import urlparse, parse_qs
                p = urlparse(self.path)
                q = parse_qs(p.query)
                code = q.get("code", [None])[0]
                err = q.get("error", [None])[0]
                if err:
                    result[0] = f"error:{err}"
                    self._resp(400, "Auth Failed")
                elif code:
                    result[0] = code
                    self._resp(200, "<html><body style='background:#010301;color:#f0fdf4;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;margin:0'><div style='text-align:center'><div style='font-size:64px;color:#22c55e;animation:pulse 1s infinite'>\u2713</div><h2>Authentication Complete</h2><p style='color:#86a389'>Return to Verdex Miner.</p><style>@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}</style></div></body></html>")
                else:
                    self._resp(400, "No code")
            def _resp(self, s, b):
                self.send_response(s)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                if isinstance(b, str):
                    self.wfile.write(b.encode())
            def log_message(self, *a): pass

        def serve():
            try:
                with socketserver.TCPServer(("127.0.0.1", REDIRECT_PORT), H) as s:
                    s.timeout = 120
                    while result[0] is None:
                        s.handle_request()
            except:
                pass

        t = threading.Thread(target=serve, daemon=True)
        t.start()

        ru = f"http://127.0.0.1:{REDIRECT_PORT}"
        url = (f"{SUPABASE_URL}/auth/v1/authorize?"
               + urlencode({"provider": "google", "redirect_to": ru,
                           "code_challenge": self.pkce_c,
                           "code_challenge_method": "s256"}))
        webbrowser.open(url)
        self._set_login_status("Waiting for Google sign-in...", C["w"])
        t.join(timeout=120)

        if not result[0]:
            self._set_login_status("Authentication cancelled or timed out", C["d"])
            self.login_btn.configure(state="normal", text="  \u25b6  Continue with Google  ")
            return

        code = result[0]
        if isinstance(code, str) and code.startswith("error:"):
            self._set_login_status(f"Auth error: {code[6:]}", C["d"])
            self.login_btn.configure(state="normal", text="  \u25b6  Continue with Google  ")
            return

        self._set_login_status("Exchanging code for session...", C["pl"])
        try:
            d = None
            for _h in [
                {"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
                {"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/x-www-form-urlencoded"},
            ]:
                try:
                    body = (json.dumps({"grant_type": "authorization_code", "client_id": "sb",
                                        "code": code, "code_verifier": self.pkce_v,
                                        "redirect_uri": ru})
                            if "json" in _h["Content-Type"]
                            else urlencode({"grant_type": "authorization_code", "client_id": "sb",
                                           "code": code, "code_verifier": self.pkce_v,
                                           "redirect_uri": ru}))
                    r = requests.post(f"{SUPABASE_URL}/auth/v1/token",
                                      data=body, headers=_h, timeout=15)
                    if r.status_code == 200:
                        d = r.json()
                        break
                except:
                    pass

            if not d:
                self._set_login_status("Auth failed - enable Google OAuth in Supabase", C["d"])
                self.login_btn.configure(state="normal", text="  \u25b6  Continue with Google  ")
                return

            self.access_token = d.get("access_token")
            if not self.access_token:
                self._set_login_status("No access token received", C["d"])
                self.login_btn.configure(state="normal", text="  \u25b6  Continue with Google  ")
                return

            ur = requests.get(f"{SUPABASE_URL}/auth/v1/user",
                headers={"apikey": SUPABASE_ANON_KEY,
                         "Authorization": f"Bearer {self.access_token}"}, timeout=10)
            self.user = ur.json()
            email = self.user.get("email", "Unknown")

            self._set_login_status(f"Authenticated as {email}. Creating token...", C["pl"])
            for _ in range(2):
                tr = requests.post(f"{API_BASE}/api/mining/token-create",
                    json={"name": "Desktop Miner", "device_name": platform.node()},
                    headers={"Authorization": f"Bearer {self.access_token}",
                             "Content-Type": "application/json"}, timeout=15)
                td = tr.json()
                if td.get("success"):
                    self.api_token = td["token"]
                    self._save()
                    self._set_login_status(f"Welcome, {email}!", C["pl"])
                    self.after(500, self._show_dash)
                    return
                self._set_login_status("Setting up account...", C["w"])
                time.sleep(0.5)

            self._set_login_status(f"Setup: {td.get('error','failed')}", C["d"])
            self.login_btn.configure(state="normal", text="  \u25b6  Continue with Google  ")

        except Exception as e:
            self._set_login_status(f"Error: {str(e)[:50]}", C["d"])
            self.login_btn.configure(state="normal", text="  \u25b6  Continue with Google  ")

    # ── DASHBOARD ──
    def _show_dash(self):
        if self.login_frame:
            self.login_frame.pack_forget()
        if self.dash_frame:
            self.dash_frame.destroy()

        self.dash_frame = ctk.CTkFrame(self.container, fg_color="transparent")
        self.dash_frame.pack(fill="both", expand=True)
        self._build_dash()
        self._fetch_data()
        self._animate_pulse()

    def _build_dash(self):
        d = self.dash_frame

        # Header
        hdr = ctk.CTkFrame(d, fg_color="transparent", height=48)
        hdr.pack(fill="x", padx=20, pady=(12, 2))
        hl = ctk.CTkFrame(hdr, fg_color="transparent")
        hl.pack(side="left")
        ctk.CTkLabel(hl, text="\u26a1", font=("Segoe UI", 18), text_color=C["p"]).pack(side="left")
        ctk.CTkLabel(hl, text="VERDEX", font=("Segoe UI", 18, "bold"), text_color=C["pl"]).pack(side="left", padx=2)
        ctk.CTkLabel(hl, text="MINER", font=("Segoe UI", 18, "bold"), text_color=C["t"]).pack(side="left")
        self.dash_email = ctk.CTkLabel(hdr, text="", font=("Segoe UI", 8), text_color=C["td"])
        self.dash_email.pack(side="right")

        # Status bar
        sb = ctk.CTkFrame(d, fg_color=C["surface"], corner_radius=10, height=32)
        sb.pack(fill="x", padx=20, pady=(0, 8))
        self.sb_dot = ctk.CTkLabel(sb, text="\u25cf", font=("Segoe UI", 10), text_color=C["td"])
        self.sb_dot.pack(side="left", padx=(12, 4))
        self.sb_txt = ctk.CTkLabel(sb, text="Signed in", font=("Segoe UI", 10), text_color=C["tm"])
        self.sb_txt.pack(side="left")
        self.sb_mode = ctk.CTkLabel(sb, text="Normal", font=("Segoe UI", 9), text_color=C["td"])
        self.sb_mode.pack(side="right", padx=12)

        # Scrollable
        sf = ctk.CTkScrollableFrame(d, fg_color="transparent")
        sf.pack(fill="both", expand=True, padx=20, pady=0)

        # VP Card
        vc = ctk.CTkFrame(sf, fg_color=C["surface"], corner_radius=18, border_width=1, border_color=C["s2"])
        vc.pack(fill="x", pady=(0, 10))
        vi = ctk.CTkFrame(vc, fg_color="transparent")
        vi.pack(padx=24, pady=20)
        ctk.CTkLabel(vi, text="WALLET BALANCE", font=("Segoe UI", 8, "bold"), text_color=C["td"]).pack(anchor="w")
        vr = ctk.CTkFrame(vi, fg_color="transparent")
        vr.pack(fill="x", pady=(4, 0))
        self.vp_lbl = ctk.CTkLabel(vr, text="0", font=("Segoe UI", 40, "bold"), text_color=C["pl"])
        self.vp_lbl.pack(side="left")
        ctk.CTkLabel(vr, text="VP", font=("Segoe UI", 14, "bold"), text_color=C["p"]).pack(side="left", padx=6, pady=(10, 0))
        self.ph_lbl = ctk.CTkLabel(vr, text="Phase 1 - Light",
            font=("Segoe UI", 9, "bold"), text_color="#000", fg_color=C["p"],
            corner_radius=6, padx=12)
        self.ph_lbl.pack(side="right")

        vm = ctk.CTkFrame(vi, fg_color="transparent")
        vm.pack(fill="x", pady=(8, 0))
        self.str_lbl = ctk.CTkLabel(vm, text="Streak: 0d", font=("Segoe UI", 10), text_color=C["tm"])
        self.str_lbl.pack(side="left")
        self.upt_lbl = ctk.CTkLabel(vm, text="Uptime: 0m", font=("Segoe UI", 10), text_color=C["tm"])
        self.upt_lbl.pack(side="right")

        # Hashrate Card
        hc = ctk.CTkFrame(sf, fg_color=C["surface"], corner_radius=18)
        hc.pack(fill="x", pady=(0, 10))
        hi = ctk.CTkFrame(hc, fg_color="transparent")
        hi.pack(padx=24, pady=18)
        ctk.CTkLabel(hi, text="MINING POWER", font=("Segoe UI", 8, "bold"), text_color=C["td"]).pack(anchor="w")
        hr = ctk.CTkFrame(hi, fg_color="transparent")
        hr.pack(fill="x", pady=(4, 0))
        self.hr_lbl = ctk.CTkLabel(hr, text="0", font=("Segoe UI", 30, "bold"), text_color=C["pl"])
        self.hr_lbl.pack(side="left")
        ctk.CTkLabel(hr, text="H/s", font=("Segoe UI", 11), text_color=C["tm"]).pack(side="left", padx=4, pady=(8, 0))
        self.hr_bar = ctk.CTkProgressBar(hi, height=8, corner_radius=4,
                                         fg_color=C["s3"], progress_color=C["p"])
        self.hr_bar.pack(fill="x", pady=(6, 0))
        self.hr_bar.set(0)

        sr = ctk.CTkFrame(hi, fg_color="transparent")
        sr.pack(fill="x", pady=(4, 0))
        self.sol_lbl = ctk.CTkLabel(sr, text="Blocks: 0", font=("Segoe UI", 9), text_color=C["tm"])
        self.sol_lbl.pack(side="left")
        self.dif_lbl = ctk.CTkLabel(sr, text="Diff: 4 zeros", font=("Segoe UI", 9), text_color=C["tm"])
        self.dif_lbl.pack(side="right")

        # Controls
        mc = ctk.CTkFrame(sf, fg_color=C["surface"], corner_radius=18)
        mc.pack(fill="x", pady=(0, 10))
        mi = ctk.CTkFrame(mc, fg_color="transparent")
        mi.pack(padx=24, pady=18)
        ctk.CTkLabel(mi, text="MINING CONTROLS", font=("Segoe UI", 8, "bold"), text_color=C["td"]).pack(anchor="w")
        br = ctk.CTkFrame(mi, fg_color="transparent")
        br.pack(fill="x", pady=(8, 0))
        self.mn_btn = ctk.CTkButton(br, text="\u25b6  Start Mining",
            command=self._toggle_mining, fg_color=C["p"], text_color="#000",
            hover_color=C["pd"], font=("Segoe UI", 14, "bold"), height=44, corner_radius=12)
        self.mn_btn.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.mode_sw = ctk.CTkSwitch(br, text="Pro", command=self._toggle_mode,
            onvalue=True, offvalue=False, progress_color=C["p"], button_color=C["p"])
        self.mode_sw.pack(side="right")

        # Sessions
        sc = ctk.CTkFrame(sf, fg_color=C["surface"], corner_radius=18)
        sc.pack(fill="x", pady=(0, 10))
        si = ctk.CTkFrame(sc, fg_color="transparent")
        si.pack(padx=24, pady=18)
        ctk.CTkLabel(si, text="MINING SESSIONS", font=("Segoe UI", 8, "bold"), text_color=C["td"]).pack(anchor="w")
        self.sf2 = ctk.CTkFrame(si, fg_color="transparent")
        self.sf2.pack(fill="x", pady=(8, 0))

        # Transactions
        tc = ctk.CTkFrame(sf, fg_color=C["surface"], corner_radius=18)
        tc.pack(fill="x", pady=(0, 10))
        ti = ctk.CTkFrame(tc, fg_color="transparent")
        ti.pack(padx=24, pady=18)
        ctk.CTkLabel(ti, text="RECENT TRANSACTIONS", font=("Segoe UI", 8, "bold"), text_color=C["td"]).pack(anchor="w")
        self.txf = ctk.CTkFrame(ti, fg_color="transparent")
        self.txf.pack(fill="x", pady=(8, 0))

        email = self.user.get("email", "") if self.user else ""
        self.dash_email.configure(text=email)

    def _update_dash(self):
        self.vp_lbl.configure(text=f"{self.vp}")
        self.str_lbl.configure(text=f"Streak: {self.streak}d")
        self.upt_lbl.configure(text=f"Uptime: {self.uptime // 60}m")
        self.sol_lbl.configure(text=f"Blocks: {self.solved}")
        self.hr_lbl.configure(text=f"{self.hashrate:.0f}")
        pc = {1: C["p"], 2: C["w"], 3: C["d"]}.get(self.phase_num, C["p"])
        self.ph_lbl.configure(text=f"Phase {self.phase_num} - {self.phase_name}", fg_color=pc)

    def _fetch_data(self):
        if not self.access_token:
            return
        try:
            uid = self.user.get("id", "") if self.user else ""
            if not uid:
                ur = requests.get(f"{SUPABASE_URL}/auth/v1/user", headers={
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {self.access_token}"
                }, timeout=8)
                self.user = ur.json()
                uid = self.user.get("id", "")

            hdrs = {"apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {self.access_token}"}

            wr = requests.get(
                f"{SUPABASE_URL}/rest/v1/wallets?user_id=eq.{uid}&select=*",
                headers=hdrs, timeout=8)
            if wr.status_code == 200 and wr.json():
                w = wr.json()[0]
                self.vp = w.get("vp_balance_cached", 0)
                self.streak = w.get("current_streak", 0)
                self.uptime = w.get("total_uptime_seconds", 0)

            sr = requests.get(
                f"{SUPABASE_URL}/rest/v1/mining_sessions?user_id=eq.{uid}&order=started_at.desc&limit=8",
                headers=hdrs, timeout=8)
            if sr.status_code == 200:
                self.sessions = sr.json() or []

            tr = requests.get(
                f"{SUPABASE_URL}/rest/v1/point_transactions?user_id=eq.{uid}&order=created_at.desc&limit=15",
                headers=hdrs, timeout=8)
            if tr.status_code == 200:
                self.transactions = tr.json() or []

        except Exception as e:
            self.sb_txt.configure(text=f"Data fetch error", text_color=C["d"])

        self._update_dash()
        self._render_sessions()
        self._render_tx()

    def _render_sessions(self):
        for w in self.sf2.winfo_children():
            w.destroy()
        if not self.sessions:
            ctk.CTkLabel(self.sf2, text="No mining sessions yet",
                         font=("Segoe UI", 10), text_color=C["td"]).pack(anchor="w")
            return
        for s in self.sessions[:5]:
            f = ctk.CTkFrame(self.sf2, fg_color=C["s2"], corner_radius=8)
            f.pack(fill="x", pady=2)
            r = ctk.CTkFrame(f, fg_color="transparent")
            r.pack(fill="x", padx=12, pady=8)
            ctk.CTkLabel(r, text=s.get("device_name", "Miner"),
                         font=("Segoe UI", 11, "bold"), text_color=C["t"]).pack(anchor="w")
            mr = ctk.CTkFrame(r, fg_color="transparent")
            mr.pack(fill="x")
            st = s.get("status", "unknown")
            cc = C["p"] if st == "active" else (C["w"] if st == "paused" else C["td"])
            ctk.CTkLabel(mr, text=f"Status: {st}", font=("Segoe UI", 9), text_color=cc).pack(side="left")
            ut = s.get("total_uptime_seconds", 0) // 60
            ctk.CTkLabel(mr, text=f"Uptime: {ut}m", font=("Segoe UI", 9), text_color=C["tm"]).pack(side="right")

    def _render_tx(self):
        for w in self.txf.winfo_children():
            w.destroy()
        if not self.transactions:
            ctk.CTkLabel(self.txf, text="No transactions yet",
                         font=("Segoe UI", 10), text_color=C["td"]).pack(anchor="w")
            return
        for t in self.transactions[:10]:
            f = ctk.CTkFrame(self.txf, fg_color=C["s2"], corner_radius=6)
            f.pack(fill="x", pady=1)
            r = ctk.CTkFrame(f, fg_color="transparent")
            r.pack(fill="x", padx=10, pady=6)
            amt = t.get("amount", 0)
            cc = C["pl"] if amt > 0 else C["d"]
            ctk.CTkLabel(r, text=f"{'+' if amt>0 else ''}{amt} VP",
                         font=("Segoe UI", 11, "bold"), text_color=cc).pack(side="left")
            ctk.CTkLabel(r, text=t.get("type", ""), font=("Segoe UI", 8), text_color=C["tm"]).pack(side="left", padx=8)
            d = t.get("created_at", "")[:10] if t.get("created_at") else ""
            ctk.CTkLabel(r, text=d, font=("Segoe UI", 8), text_color=C["td"]).pack(side="right")

    def _animate_pulse(self):
        self._anim_phase = (self._anim_phase + 0.03) % (2 * math.pi)
        glow = 0.5 + 0.15 * math.sin(self._anim_phase)
        try:
            self._update_dash()
        except:
            pass
        self.after(1500, self._animate_pulse)

    def _toggle_mode(self):
        self.pro_mode = self.mode_sw.get()
        self.sb_mode.configure(text="PRO" if self.pro_mode else "Normal")

    def _toggle_mining(self):
        if self.mining:
            self.mining = False
            self.mn_btn.configure(text="\u25b6  Start Mining", fg_color=C["p"])
            self.sb_txt.configure(text="Mining stopped", text_color=C["tm"])
            self.sb_dot.configure(text_color=C["td"])
        else:
            if not self.api_token:
                messagebox.showwarning("Auth Required", "Please sign in with Google first.")
                return
            self.mining = True
            self.start_time = time.time()
            self.mn_btn.configure(text="\u23f9  Stop Mining", fg_color=C["d"])
            self.sb_txt.configure(text="Starting...", text_color=C["pl"])
            self.sb_dot.configure(text_color=C["p"])
            self.mining_thread = threading.Thread(target=self._mining_loop, daemon=True)
            self.mining_thread.start()

    def _mining_loop(self):
        cores = multiprocessing.cpu_count()
        workers = cores if self.pro_mode else max(1, cores // 2)
        workers = min(workers, 8)

        while self.mining:
            try:
                r = requests.post(f"{API_BASE}/api/mining/challenge", json={
                    "device_fingerprint": self.dfp, "device_os": "windows",
                    "device_arch": "amd64", "cli_version": "2.0"
                }, headers={"X-Device-Token": self.api_token,
                            "Content-Type": "application/json"}, timeout=15)
                if r.status_code != 200:
                    self.sb_txt.configure(text=f"Challenge: {r.status_code}", text_color=C["w"])
                    time.sleep(5)
                    continue

                d = r.json()
                ch = d.get("challenge") or d.get("pow_challenge", "")
                diff = d.get("difficulty", 4)
                rvp = d.get("reward_per_share", 1)
                self.phase_num = d.get("phase", 1)
                self.phase_name = d.get("phase_label", "Light")
                self.dif_lbl.configure(text=f"Diff: {diff} zeros")

                sol = self._solve(ch, diff, workers)
                if not sol:
                    continue

                nonce, hr = sol
                self.hashrate = hr

                sr = requests.post(f"{API_BASE}/api/mining/heartbeat", json={
                    "nonce": nonce, "pow_solution": nonce
                }, headers={"X-Device-Token": self.api_token,
                            "Content-Type": "application/json"}, timeout=15)

                if sr.status_code == 200:
                    res = sr.json()
                    self.vp = res.get("vp_balance", self.vp)
                    self.streak = res.get("streak", self.streak)
                    self.uptime = res.get("uptime_total_seconds", self.uptime)
                    self.solved += 1
                    self.sb_txt.configure(text=f"\u2713 Mined! +{res.get('reward_vp', rvp)} VP", text_color=C["pl"])
                elif sr.status_code == 429:
                    w = sr.json().get("wait_seconds", 10)
                    self.sb_txt.configure(text=f"Cooldown: {w}s", text_color=C["w"])
                    time.sleep(min(w, 30))
                else:
                    self.sb_txt.configure(text=f"Submit: {sr.status_code}", text_color=C["d"])
                    time.sleep(3)

                self._update_dash()

            except requests.exceptions.ConnectionError:
                self.sb_txt.configure(text="Connection error", text_color=C["d"])
                time.sleep(5)
            except Exception as e:
                self.sb_txt.configure(text=f"Error: {str(e)[:25]}", text_color=C["d"])
                time.sleep(5)

        self.sb_txt.configure(text="Stopped", text_color=C["tm"])
        self.sb_dot.configure(text_color=C["td"])

    def _solve(self, challenge, difficulty, workers):
        target = "0" * difficulty
        start = time.time()
        mgr = multiprocessing.Manager()
        result = mgr.dict()
        result["value"] = None
        counter = multiprocessing.RawValue("i", 0)
        stop = multiprocessing.Event()

        def work(ch, tg, res, cnt, st, wid):
            import hashlib, os, time
            lc = 0
            t0 = time.time()
            while not st.is_set() and res.get("value") is None:
                n = os.urandom(8).hex() + str(wid) + str(int(time.time() * 1e9))
                h = hashlib.sha256((ch + n).encode()).hexdigest()
                lc += 1
                if h.startswith(tg):
                    e = time.time() - t0
                    res["value"] = (n, lc / e if e > 0 else 0)
                    st.set()
                    return
                if lc % 10000 == 0:
                    try:
                        cnt.value += 10000
                    except:
                        pass

        procs = []
        for i in range(workers):
            p = multiprocessing.Process(target=work, args=(challenge, target, result, counter, stop, i))
            p.start()
            procs.append(p)

        while result.get("value") is None and (time.time() - start) < 90:
            time.sleep(0.3)
            e = time.time() - start
            if e > 1:
                try:
                    hr = counter.value / e
                    self.hashrate = hr
                    self.hr_lbl.configure(text=f"{hr:.0f}")
                    self.hr_bar.set(min(hr / 500000, 1.0))
                    self._update_dash()
                except:
                    pass

        stop.set()
        for p in procs:
            p.join(timeout=2)
            if p.is_alive():
                p.terminate()

        if result.get("value"):
            return result["value"]

        lc, t0 = 0, time.time()
        while time.time() - start < 120:
            n = str(uuid.uuid4()).replace("-", "") + str(int(time.time() * 1e9))
            h = hashlib.sha256((challenge + n).encode()).hexdigest()
            lc += 1
            if h.startswith(target):
                e = time.time() - t0
                return (n, lc / e if e > 0 else 0)
        return None


if __name__ == "__main__":
    multiprocessing.freeze_support()
    App().mainloop()
'''

def main():
    path = r"C:\Users\kidst\Videos\verdex-website\assets\downloads\verdex-miner.py"
    with open(path, "w", encoding="utf-8") as f:
        f.write(CODE.lstrip("\n"))
    print(f"Written {len(CODE)} bytes to {path}")

if __name__ == "__main__":
    main()
