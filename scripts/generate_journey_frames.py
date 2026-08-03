"""Generate GENTERA journey slide frames (home-page colors)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(r"c:\Mintera\Mintera_repo\frontend\public\video_build\frames")
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1280, 720
BG = (9, 13, 22)
PANEL = (15, 23, 42)
TEAL = (20, 184, 166)
SKY = (56, 189, 248)
WHITE = (248, 250, 252)
MUTED = (148, 163, 184)
LINE = (30, 41, 59)


def font(size: int, bold: bool = False):
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def base():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    # subtle radial glow (top center)
    for i, alpha in enumerate(range(40, 0, -2)):
        r = 180 + i * 18
        color = (6 + i, 40 + i, 55 + i // 2)
        draw.ellipse([W // 2 - r, -r // 2, W // 2 + r, r], outline=color)
    # dotted grid
    for y in range(40, H, 28):
        for x in range(40, W, 28):
            draw.point((x, y), fill=(20, 40, 50))
    # bottom accent line
    draw.rectangle([0, H - 4, W, H], fill=TEAL)
    return img, draw


def center_text(draw, text, y, fnt, fill, max_width=1100):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw = bbox[2] - bbox[0]
    x = (W - tw) // 2
    draw.text((x, y), text, font=fnt, fill=fill)
    return (bbox[3] - bbox[1])


def wrap_lines(draw, text, fnt, max_width):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if draw.textbbox((0, 0), test, font=fnt)[2] <= max_width:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def slide_title(path: Path, title: str, subtitle: str = "", badge: str = ""):
    img, draw = base()
    # card panel
    draw.rounded_rectangle([80, 120, W - 80, H - 100], radius=24, fill=PANEL, outline=(30, 60, 70), width=2)
    y = 180
    if badge:
        center_text(draw, badge, y, font(18, True), TEAL)
        y += 40
    for line in wrap_lines(draw, title, font(42, True), 1000):
        center_text(draw, line, y, font(42, True), SKY)
        y += 54
    if subtitle:
        y += 16
        for line in wrap_lines(draw, subtitle, font(22), 980):
            center_text(draw, line, y, font(22), MUTED)
            y += 34
    img.save(path)


def slide_list(path: Path, badge: str, title: str, items: list[str], accent=TEAL):
    img, draw = base()
    draw.rounded_rectangle([70, 70, W - 70, H - 70], radius=24, fill=PANEL, outline=(30, 60, 70), width=2)
    draw.text((110, 100), badge, font=font(16, True), fill=accent)
    draw.text((110, 128), title, font=font(34, True), fill=WHITE)
    y = 190
    for i, item in enumerate(items, 1):
        # step chip
        draw.rounded_rectangle([110, y, 150, y + 28], radius=8, fill=(20, 40, 45), outline=accent)
        draw.text((122, y + 4), f"{i}", font=font(14, True), fill=accent)
        draw.text((168, y + 3), item, font=font(20), fill=(226, 232, 240))
        y += 42
    img.save(path)


def main():
    slides = []
    # 10 slides x 6 seconds = 60s
    slide_title(
        OUT / "01.png",
        "One Click. Any Cloud. Enterprise AI Instantly",
        "GENTERA — GenAI Terraform Enterprise Resource Automation",
        "FEUJI GENTERA",
    )
    slides.append("01.png")

    slide_title(
        OUT / "02.png",
        "The Enterprise GenAI Journey",
        "Standardize, provision, govern, and scale LLM and RAG ecosystems across hybrid and multi-cloud.",
    )
    slides.append("02.png")

    slide_list(
        OUT / "03.png",
        "PHASE 1 — GENTERA KIT",
        "Architecture Provisioning",
        [
            "Intake Form — capture enterprise GenAI requirements",
            "AI Recommendation — propose multi-cloud architecture",
            "Cost & Review — estimate spend against budget",
        ],
    )
    slides.append("03.png")

    slide_list(
        OUT / "04.png",
        "PHASE 1 — CONTINUED",
        "Build & Deploy",
        [
            "Terraform HCL Generation — production IaC",
            "Execution Engine — ephemeral jump box deploy",
            "Health Dashboard — monitor stack health",
        ],
    )
    slides.append("04.png")

    slide_list(
        OUT / "05.png",
        "PHASE 1 — CONTINUED",
        "Govern & Launch",
        [
            "Audit & Compliance — policy and WORM trail",
            "Testing & QA — isolation and readiness checks",
            "Launch & Ops — canary rollout to production",
        ],
    )
    slides.append("05.png")

    slide_list(
        OUT / "06.png",
        "PHASE 2 — GENTERA FINOPS",
        "Continuous Cost Governance",
        [
            "FinOps Overview — enterprise cost posture",
            "Cost Breakdown — map spend to resources",
            "AI Cost Recommendations — rightsizing",
        ],
        accent=SKY,
    )
    slides.append("06.png")

    slide_list(
        OUT / "07.png",
        "PHASE 2 — CONTINUED",
        "Approve & Realize Savings",
        [
            "Approval Workflow — human-in-the-loop gates",
            "Savings Dashboard — realized vs budgeted",
            "Governed optimization through Terraform",
        ],
        accent=SKY,
    )
    slides.append("07.png")

    slide_title(
        OUT / "08.png",
        "From Intent to Infrastructure",
        "Intake → AI design → Cost gate → Terraform → Deploy → Health → Audit → Test → Launch → FinOps",
        "END-TO-END AUTOMATION",
    )
    slides.append("08.png")

    slide_title(
        OUT / "09.png",
        "Multi-Cloud. Compliant. FinOps-Ready.",
        "AWS and Azure blueprints with OPA, tfsec, Checkov, and continuous savings intelligence.",
    )
    slides.append("09.png")

    slide_title(
        OUT / "10.png",
        "Start Your GENTERA Journey",
        "Deploy your first production-ready GenAI stack in one governed workflow.",
        "READY WHEN YOU ARE",
    )
    slides.append("10.png")

    # concat list for ffmpeg (each image 6 seconds)
    list_path = OUT.parent / "slides.txt"
    with list_path.open("w", encoding="utf-8") as f:
        for name in slides:
            f.write(f"file '{OUT.joinpath(name).as_posix()}'\n")
            f.write("duration 6\n")
        # last frame needs to be repeated for concat demuxer
        f.write(f"file '{OUT.joinpath(slides[-1]).as_posix()}'\n")
    print(f"Wrote {len(slides)} slides to {OUT}")
    print(f"Concat list: {list_path}")


if __name__ == "__main__":
    main()
