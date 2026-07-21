"""
Generate a high-quality PNG logo for use in emails and elsewhere.
Email clients (Gmail, Outlook) don't support inline SVG, so we need PNG.
"""
from PIL import Image, ImageDraw, ImageFilter
import math


def create_verdex_logo_png(size=400, output_path="verdex-logo-email.png"):
    """Create the Verdex diamond logo as a transparent PNG."""
    # Create transparent image
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Diamond dimensions (matching the SVG paths)
    # viewBox is 0 0 100 160, so aspect ratio is 100:160
    # Scale to fit in size
    scale_x = size / 100
    scale_y = size / 160
    scale = min(scale_x, scale_y) * 0.8  # padding

    cx = size / 2
    cy = size / 2

    # Logo points (from SVG: 0 0 100 160)
    # Top: M50 0 L95 80 L50 55 L5 80
    # Bottom: M50 105 L95 80 L50 160 L5 80

    def to_px(x, y):
        """Convert SVG coords to pixel coords."""
        px = cx + (x - 50) * scale
        py = cy + (y - 80) * scale
        return (px, py)

    # Top pyramid - left face (lighter green)
    top_left = [to_px(50, 0), to_px(5, 80), to_px(50, 55)]
    draw.polygon(top_left, fill=(74, 222, 128, 255))

    # Top pyramid - right face (darker green)
    top_right = [to_px(50, 0), to_px(95, 80), to_px(50, 55)]
    draw.polygon(top_right, fill=(34, 197, 94, 255))

    # Bottom pyramid - left face (lighter green)
    bot_left = [to_px(50, 105), to_px(5, 80), to_px(50, 160)]
    draw.polygon(bot_left, fill=(74, 222, 128, 255))

    # Bottom pyramid - right face (darker green)
    bot_right = [to_px(50, 105), to_px(95, 80), to_px(50, 160)]
    draw.polygon(bot_right, fill=(34, 197, 94, 255))

    # Add a subtle glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)

    # Draw a larger version for glow
    for offset in range(20, 0, -2):
        alpha = int(8 * (1 - offset / 20))
        glow_top_left = [to_px(50, 0), to_px(5, 80), to_px(50, 55)]
        glow_top_right = [to_px(50, 0), to_px(95, 80), to_px(50, 55)]
        glow_bot_left = [to_px(50, 105), to_px(5, 80), to_px(50, 160)]
        glow_bot_right = [to_px(50, 105), to_px(95, 80), to_px(50, 160)]

        # Scale points outward for glow
        def scale_pt(pt, factor):
            return (cx + (pt[0] - cx) * factor, cy + (pt[1] - cy) * factor)

        f = 1 + offset * 0.01
        for poly in [glow_top_left, glow_top_right, glow_bot_left, glow_bot_right]:
            scaled = [scale_pt(p, f) for p in poly]
            glow_draw.polygon(scaled, fill=(34, 197, 94, alpha))

    glow = glow.filter(ImageFilter.GaussianBlur(radius=8))

    # Composite glow under the logo
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result = Image.alpha_composite(result, glow)
    result = Image.alpha_composite(result, img)

    result.save(output_path, "PNG")
    print(f"Logo saved: {output_path} ({size}x{size})")


def main():
    output_path = r"C:\Users\kidst\Videos\verdex-website\assets\verdex-logo-email.png"
    create_verdex_logo_png(size=400, output_path=output_path)

    # Also create a smaller version for footer
    output_small = r"C:\Users\kidst\Videos\verdex-website\assets\verdex-logo-small.png"
    create_verdex_logo_png(size=160, output_path=output_small)


if __name__ == "__main__":
    main()
