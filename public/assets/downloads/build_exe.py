#!/usr/bin/env python3
"""
Build Verdex Miner EXE -- generates icon + runs PyInstaller
Usage: python build_exe.py
"""
import os, sys, struct, zlib, subprocess, shutil, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ICON_PATH = os.path.join(SCRIPT_DIR, "verdex-icon.ico")

def create_icon():
    width, height = 32, 32
    pixels = bytearray()
    cx, cy = width // 2, height // 2
    max_r = cx - 1
    for y in range(height):
        for x in range(width):
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5
            if dist <= max_r:
                factor = 1.0 - (dist / max_r) * 0.5
                r = int(34 * factor)
                g = int(197 * factor)
                b = int(94 * factor)
                a = 255
            else:
                r = g = b = a = 0
            pixels.extend([b, g, r, a])
    
    def create_png(width, height, pixel_data):
        ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
        ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
        raw = b''
        for y in range(height):
            raw += b'\x00'
            row_start = y * width * 4
            raw += bytes(pixel_data[row_start:row_start + width * 4])
        compressed = zlib.compress(raw)
        idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
        iend_crc = zlib.crc32(b'IEND') & 0xffffffff
        png = b'\x89PNG\r\n\x1a\n'
        png += struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
        png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
        png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
        return png
    
    png_data = create_png(width, height, pixels)
    ico = struct.pack('<HHH', 0, 1, 1)
    ico += struct.pack('<BBBBHHII', 32, 32, 0, 0, 1, 32, len(png_data), 22)
    ico += png_data
    
    with open(ICON_PATH, 'wb') as f:
        f.write(ico)
    print(f"  [OK] Icon created: {ICON_PATH}")
    return True

def build():
    print()
    print("  VERDEX MINER -- BUILD EXE")
    print("  " + "="*45)
    print()
    
    if not os.path.exists(ICON_PATH):
        create_icon()
    
    try:
        import PyInstaller
        print(f"  [OK] PyInstaller {PyInstaller.__version__} found")
    except ImportError:
        print("  [..] PyInstaller not found, installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    print("  [..] Building EXE (this may take a few minutes)...")
    print()
    
    # Pack splash MP4 and logo assets into the EXE
    mp4_file = os.path.abspath(os.path.join(SCRIPT_DIR, "../../assets/verdex_logo_cinematic.mp4"))
    logo_file = os.path.abspath(os.path.join(SCRIPT_DIR, "../../assets/verdex-logo-small.png"))
    
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--windowed",
        "--name", "VerdexMiner",
        "--icon", ICON_PATH,
        "--clean",
        "--noconfirm",
    ]
    
    if os.path.exists(mp4_file):
        cmd.extend(["--add-data", f"{mp4_file};assets"])
        print(f"  [OK] Packing splash asset: {mp4_file}")
    if os.path.exists(logo_file):
        cmd.extend(["--add-data", f"{logo_file};assets"])
        print(f"  [OK] Packing logo asset: {logo_file}")
        
    cmd.extend([
        "--hidden-import", "customtkinter",
        "--hidden-import", "tkinter",
        "--hidden-import", "requests",
        "--hidden-import", "hashlib",
        "--hidden-import", "multiprocessing",
        "--hidden-import", "uuid",
        "--hidden-import", "secrets",
        "--hidden-import", "base64",
        "--hidden-import", "webbrowser",
        "--hidden-import", "http.server",
        "--hidden-import", "socketserver",
        "--hidden-import", "urllib.parse",
        "verdex-miner.py",
    ])
    
    result = subprocess.run(cmd, cwd=SCRIPT_DIR, capture_output=True, text=True)
    
    if result.returncode == 0:
        exe_name = "VerdexMiner.exe"
        dist_path = os.path.join(SCRIPT_DIR, "dist", exe_name)
        output_path = os.path.join(SCRIPT_DIR, exe_name)
        if os.path.exists(dist_path):
            shutil.copy2(dist_path, output_path)
            print(f"\n  [OK] BUILD SUCCESSFUL!")
            print(f"  [OK] Output: {output_path}")
            size_mb = os.path.getsize(output_path) / (1024*1024)
            print(f"  [OK] Size: {size_mb:.1f} MB")
        else:
            print(f"\n  [FAIL] EXE not found at {dist_path}")
            if result.stdout: print("  OUT:", result.stdout[-500:])
            if result.stderr: print("  ERR:", result.stderr[-500:])
    else:
        print(f"\n  [FAIL] Build failed!")
        if result.stderr: print("  ERR:", result.stderr[-1000:])
        if result.stdout: print("  OUT:", result.stdout[-500:])

if __name__ == "__main__":
    build()
