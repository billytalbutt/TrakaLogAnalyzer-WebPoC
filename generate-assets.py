"""
Generate installer assets for Traka Log Analyzer.
Creates:
  - build/icon.ico          (multi-resolution app icon)
  - build/installerSidebar.bmp  (164x314 branded sidebar)
  - build/uninstallerSidebar.bmp
"""

from PIL import Image, ImageDraw, ImageFont
import os

BUILD_DIR = os.path.join(os.path.dirname(__file__), "build")
IMG_DIR = os.path.join(os.path.dirname(__file__), "img")
LOGO_PATH = os.path.join(IMG_DIR, "trakaweb-logo.png")

# Traka brand colours (Midnight Ember palette)
BRAND_ORANGE = (255, 107, 53)
DARK_BG = (13, 15, 18)
DARK_SECONDARY = (21, 24, 32)
TEXT_WHITE = (240, 242, 245)
TEXT_DIM = (154, 161, 176)
BORDER = (42, 48, 60)


def generate_ico():
    """Generate multi-resolution ICO from the PNG logo."""
    print("  [1/3] Generating icon.ico...")
    logo = Image.open(LOGO_PATH).convert("RGBA")

    # Create icons at standard Windows sizes
    sizes = [16, 24, 32, 48, 64, 128, 256]
    icons = []
    for size in sizes:
        resized = logo.resize((size, size), Image.LANCZOS)
        icons.append(resized)

    ico_path = os.path.join(BUILD_DIR, "icon.ico")
    # Save the largest icon with all smaller ones appended
    icons[-1].save(
        ico_path,
        format="ICO",
        append_images=icons[:-1],
        sizes=[(s, s) for s in sizes],
    )
    print(f"         -> {ico_path} ({len(sizes)} sizes)")


def generate_sidebar(filename, title_line2="Setup"):
    """
    Generate a branded NSIS sidebar bitmap (164 x 314 pixels).
    Dark background, Traka logo, app name, and a subtle gradient accent.
    """
    W, H = 164, 314
    img = Image.new("RGB", (W, H), DARK_BG)
    draw = ImageDraw.Draw(img)

    # Gradient accent bar at the top (2px tall, orange)
    for x in range(W):
        r = int(BRAND_ORANGE[0] * (1 - x / W) + BRAND_ORANGE[0] * 0.6 * (x / W))
        g = int(BRAND_ORANGE[1] * (1 - x / W) + BRAND_ORANGE[1] * 0.4 * (x / W))
        b = int(BRAND_ORANGE[2] * (1 - x / W) + 20 * (x / W))
        draw.line([(x, 0), (x, 2)], fill=(r, g, b))

    # Subtle vertical line on the right edge
    draw.line([(W - 1, 0), (W - 1, H)], fill=BORDER)

    # Load and place logo (centred, in upper portion)
    try:
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_size = 72
        logo_resized = logo.resize((logo_size, logo_size), Image.LANCZOS)
        # Composite onto the dark background
        logo_x = (W - logo_size) // 2
        logo_y = 50
        # Create a temp image for compositing
        temp = Image.new("RGBA", (W, H), (*DARK_BG, 255))
        temp.paste(logo_resized, (logo_x, logo_y), logo_resized)
        img = Image.alpha_composite(
            Image.new("RGBA", (W, H), (*DARK_BG, 255)),
            temp
        ).convert("RGB")
        draw = ImageDraw.Draw(img)
    except Exception as e:
        print(f"         Warning: Could not place logo: {e}")

    # App name text
    try:
        # Try to use a nice font
        for font_name in ["segoeui.ttf", "arial.ttf", "tahoma.ttf"]:
            try:
                font_title = ImageFont.truetype(font_name, 14)
                font_sub = ImageFont.truetype(font_name, 11)
                font_small = ImageFont.truetype(font_name, 9)
                break
            except OSError:
                continue
        else:
            font_title = ImageFont.load_default()
            font_sub = font_title
            font_small = font_title
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = font_title
        font_small = font_title

    # "Traka" in orange
    text_y = 140
    bbox = draw.textbbox((0, 0), "Traka", font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, text_y), "Traka", fill=BRAND_ORANGE, font=font_title)

    # "Log Analyzer" in white
    text_y += 20
    bbox = draw.textbbox((0, 0), "Log Analyzer", font=font_title)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, text_y), "Log Analyzer", fill=TEXT_WHITE, font=font_title)

    # Subtitle
    text_y += 24
    bbox = draw.textbbox((0, 0), title_line2, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, text_y), title_line2, fill=TEXT_DIM, font=font_sub)

    # Divider line
    text_y += 24
    draw.line([(30, text_y), (W - 30, text_y)], fill=BORDER)

    # Version info
    text_y += 12
    version_text = "Version 3.0.0"
    bbox = draw.textbbox((0, 0), version_text, font=font_small)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, text_y), version_text, fill=TEXT_DIM, font=font_small)

    # Bottom branding
    bottom_text = "ASSA ABLOY"
    bbox = draw.textbbox((0, 0), bottom_text, font=font_small)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, H - 30), bottom_text, fill=TEXT_DIM, font=font_small)

    # Subtle gradient at bottom
    for y in range(H - 8, H):
        alpha = (y - (H - 8)) / 8
        r = int(BRAND_ORANGE[0] * alpha * 0.4)
        g = int(BRAND_ORANGE[1] * alpha * 0.4)
        b = int(BRAND_ORANGE[2] * alpha * 0.4)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    bmp_path = os.path.join(BUILD_DIR, filename)
    img.save(bmp_path, format="BMP")
    print(f"         -> {bmp_path}")


if __name__ == "__main__":
    os.makedirs(BUILD_DIR, exist_ok=True)
    print()
    print("  Traka Log Analyzer — Installer Asset Generator")
    print("  ===============================================")
    print()

    generate_ico()

    print("  [2/3] Generating installerSidebar.bmp...")
    generate_sidebar("installerSidebar.bmp", title_line2="Setup Wizard")

    print("  [3/3] Generating uninstallerSidebar.bmp...")
    generate_sidebar("uninstallerSidebar.bmp", title_line2="Uninstall")

    print()
    print("  Done! Assets in:", BUILD_DIR)
    print()
