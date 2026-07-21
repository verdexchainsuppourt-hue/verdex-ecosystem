"""
Verdex Cinematic Logo Animation v3 - Enhanced with particles, glow, and effects.
"""
from PIL import Image, ImageDraw, ImageFilter
import math
import random


def rotate_y(point, angle):
    x, y, z = point
    c = math.cos(angle)
    s = math.sin(angle)
    return (x * c - z * s, y, x * s + z * c)


def rotate_x(point, angle):
    x, y, z = point
    c = math.cos(angle)
    s = math.sin(angle)
    return (x, y * c - z * s, y * s + z * c)


def rotate_z(point, angle):
    x, y, z = point
    c = math.cos(angle)
    s = math.sin(angle)
    return (x * c - y * s, x * s + y * c, z)


def project(point, width, height, fov=450):
    x, y, z = point
    factor = fov / (fov + z)
    return (width / 2 + x * factor, height / 2 - y * factor)


def normal(p1, p2, p3):
    ax, ay, az = (p2[i] - p1[i] for i in range(3))
    bx, by, bz = (p3[i] - p1[i] for i in range(3))
    nx = ay * bz - az * by
    ny = az * bx - ax * bz
    nz = ax * by - ay * bx
    length = math.sqrt(nx * nx + ny * ny + nz * nz)
    if length == 0:
        return (0, 0, 0)
    return (nx / length, ny / length, nz / length)


def shade_color(hex_color, intensity):
    r = min(255, int(((hex_color >> 16) & 0xFF) * intensity))
    g = min(255, int(((hex_color >> 8) & 0xFF) * intensity))
    b = min(255, int((hex_color & 0xFF) * intensity))
    return (r, g, b)


def create_particles(num_particles, frame_index, total_frames, center_x, center_y):
    """Create orbiting particles around the logo."""
    particles = []
    t = frame_index / total_frames
    for i in range(num_particles):
        angle = (2 * math.pi * i / num_particles) + t * 2 * math.pi
        radius = 220 + 30 * math.sin(t * 4 * math.pi + i * 0.5)
        x = center_x + radius * math.cos(angle)
        y = center_y + radius * math.sin(angle) * 0.6  # elliptical orbit
        size = 2 + (1.5 * math.sin(t * 2 * math.pi + i))
        opacity = int(150 + 100 * math.sin(t * 2 * math.pi + i * 0.3))
        particles.append((x, y, size, opacity))
    return particles


def create_frame(frame_index, total_frames, size=700):
    # Create base image with gradient background
    img = Image.new("RGB", (size, size), (3, 8, 3))
    draw = ImageDraw.Draw(img)

    t = frame_index / total_frames
    angle = 2 * math.pi * t
    pulse = 0.85 + 0.15 * math.sin(2 * math.pi * t * 2)

    # Octahedron dimensions
    h = 240 * pulse
    w = 175
    gap = 20

    # Vertices
    top_apex = (0, h + gap, 0)
    bottom_apex = (0, -h - gap, 0)
    base_corners = [(w, 0, w), (w, 0, -w), (-w, 0, -w), (-w, 0, w)]

    # Rotate all vertices
    def rot(p):
        p = rotate_y(p, angle)
        p = rotate_x(p, 0.15)  # slight tilt
        return p

    top_apex_r = rot(top_apex)
    bottom_apex_r = rot(bottom_apex)
    base_r = [rot(p) for p in base_corners]

    # Build faces
    faces = []
    for i in range(4):
        c1 = base_r[i]
        c2 = base_r[(i + 1) % 4]
        # Top pyramid faces
        color = 0x4ade80 if i in (2, 3) else 0x22c55e
        faces.append(([top_apex_r, c1, c2], color, 'top'))
    for i in range(4):
        c1 = base_r[i]
        c2 = base_r[(i + 1) % 4]
        # Bottom pyramid faces
        color = 0x4ade80 if i in (2, 3) else 0x22c55e
        faces.append(([bottom_apex_r, c2, c1], color, 'bottom'))

    # Light direction (dramatic top-left key light)
    light = (0.3, 0.5, 0.8)
    light_len = math.sqrt(sum(c * c for c in light))
    light = tuple(c / light_len for c in light)

    # Secondary fill light
    fill_light = (-0.3, 0.2, 0.5)
    fill_len = math.sqrt(sum(c * c for c in fill_light))
    fill_light = tuple(c / fill_len for c in fill_light)

    # Sort faces by depth
    def avg_z(face):
        return sum(p[2] for p in face[0]) / len(face[0])

    faces.sort(key=avg_z, reverse=True)

    # Layer 1: Outer glow halo
    glow_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    cx, cy = project((0, 0, 0), size, size)
    glow_radius = int(200 + 60 * pulse)
    for r in range(glow_radius, 0, -6):
        alpha = int(20 * (1 - r / glow_radius) * pulse)
        glow_draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                          fill=(34, 197, 94, alpha))
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=8))
    img = Image.alpha_composite(img.convert("RGBA"), glow_img).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Layer 2: Orbiting particles
    particles = create_particles(30, frame_index, total_frames, cx, cy)
    particle_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    particle_draw = ImageDraw.Draw(particle_img)
    for x, y, ps, op in particles:
        # Draw particle with glow
        for r in range(int(ps * 3), 0, -1):
            fade = int(op * (1 - r / (ps * 3)))
            particle_draw.ellipse([x - r, y - r, x + r, y + r],
                                  fill=(74, 222, 128, fade))
    img = Image.alpha_composite(img.convert("RGBA"), particle_img).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Layer 3: Energy rings
    for ring_idx in range(3):
        ring_t = (t * 3 + ring_idx * 0.33) % 1
        ring_radius = 200 + ring_t * 250
        ring_alpha = int(80 * (1 - ring_t))
        if ring_alpha > 0:
            # Draw ellipse for perspective
            for offset in range(3):
                r = ring_radius + offset
                draw.ellipse([cx - r, cy - r * 0.4, cx + r, cy + r * 0.4],
                             outline=(74, 222, 128, ring_alpha), width=1)

    # Layer 4: Logo faces
    for pts, color, _ in faces:
        n = normal(pts[0], pts[1], pts[2])
        if n[2] < 0:
            continue
        # Combine key light and fill light
        key_dot = max(0.0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2])
        fill_dot = max(0.0, n[0] * fill_light[0] + n[1] * fill_light[1] + n[2] * fill_light[2])
        intensity = 0.4 + 0.5 * key_dot + 0.15 * fill_dot
        projected = [project(p, size, size) for p in pts]
        draw.polygon(projected, fill=shade_color(color, intensity), outline=None)

    # Layer 5: Specular highlights on faces
    spec_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    spec_draw = ImageDraw.Draw(spec_img)
    for pts, color, _ in faces:
        n = normal(pts[0], pts[1], pts[2])
        if n[2] < 0:
            continue
        key_dot = max(0.0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2])
        if key_dot > 0.7:
            # Add specular highlight
            projected = [project(p, size, size) for p in pts]
            spec_draw.polygon(projected, fill=(255, 255, 255, int(50 * (key_dot - 0.7) * 3)))
    spec_img = spec_img.filter(ImageFilter.GaussianBlur(radius=3))
    img = Image.alpha_composite(img.convert("RGBA"), spec_img).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Layer 6: Edge glow
    edge_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    edge_draw = ImageDraw.Draw(edge_img)
    for pts, color, _ in faces:
        n = normal(pts[0], pts[1], pts[2])
        if n[2] < 0:
            continue
        projected = [project(p, size, size) for p in pts]
        edge_draw.polygon(projected, outline=(134, 239, 172, 100), width=2)
    edge_img = edge_img.filter(ImageFilter.GaussianBlur(radius=2))
    img = Image.alpha_composite(img.convert("RGBA"), edge_img).convert("RGB")

    return img


def main():
    random.seed(42)
    frames = []
    num_frames = 90  # 90 frames for smooth motion at 30fps = 3 seconds
    for i in range(num_frames):
        frame = create_frame(i, num_frames, size=700)
        frames.append(frame)

    output_path = r"C:\Users\kidst\Videos\verdex-website\assets\verdex_logo_cinematic.gif"
    frames[0].save(
        output_path,
        save_all=True,
        append_images=frames[1:],
        duration=40,
        loop=0,
        optimize=True,
    )
    print(f"Saved cinematic animation: {output_path}")
    print(f"Frames: {num_frames}, Duration: {num_frames * 40 / 1000:.1f}s")


if __name__ == "__main__":
    main()
