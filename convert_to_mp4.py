"""
Convert GIF animations to MP4 videos.
"""
import cv2
import numpy as np
import os
from PIL import Image


def gif_to_mp4(gif_path, mp4_path, fps=30):
    """Convert a GIF file to MP4 using OpenCV."""
    gif = Image.open(gif_path)
    frames = []
    try:
        while True:
            frame = gif.convert('RGB')
            frames.append(frame.copy())
            gif.seek(gif.tell() + 1)
    except EOFError:
        pass

    if not frames:
        print(f"No frames found in {gif_path}")
        return

    width, height = frames[0].size
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video = cv2.VideoWriter(mp4_path, fourcc, fps, (width, height))

    for frame in frames:
        # Convert PIL RGB to numpy array, then to BGR for OpenCV
        rgb = np.array(frame)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        video.write(bgr)

    video.release()
    print(f"Saved: {mp4_path} ({len(frames)} frames at {fps}fps)")


def main():
    assets_dir = r"C:\Users\kidst\Videos\verdex-website\assets"

    gifs_to_convert = [
        ("verdex_logo_cinematic.gif", "verdex_logo_cinematic.mp4", 30),
        ("animation.gif", "animation.mp4", 30),
        ("animation-v2.gif", "animation-v2.mp4", 30),
    ]

    for gif_name, mp4_name, fps in gifs_to_convert:
        gif_path = os.path.join(assets_dir, gif_name)
        mp4_path = os.path.join(assets_dir, mp4_name)

        if os.path.exists(gif_path):
            gif_to_mp4(gif_path, mp4_path, fps)
        else:
            print(f"Skipped (not found): {gif_path}")


if __name__ == "__main__":
    main()
