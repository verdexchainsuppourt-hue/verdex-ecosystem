"""
Generate a cinematic Verdex Tokenomics chart image.
Dark theme, green gradient, matching the website's aesthetic.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import numpy as np


def create_donut_chart(output_path):
    """Create a donut/pie chart showing VDX token allocation."""
    # Token allocation data
    labels = [
        "Liquidity Mining\n& Farms",
        "Treasury\n& Ecosystem",
        "Team\n& Advisors",
        "Community\n& Airdrops",
        "Private Sale",
    ]
    sizes = [40, 20, 15, 15, 10]
    # Green palette matching website
    colors = ["#22c55e", "#4ade80", "#16a34a", "#15803d", "#86efac"]

    fig, ax = plt.subplots(figsize=(10, 10), facecolor="#020802")
    ax.set_facecolor("#020802")

    # Donut chart
    wedges, texts, autotexts = ax.pie(
        sizes,
        labels=None,
        autopct="%d%%",
        startangle=90,
        colors=colors,
        pctdistance=0.78,
        wedgeprops=dict(width=0.42, edgecolor="#020802", linewidth=4),
        textprops=dict(color="#000000", fontsize=16, fontweight="bold"),
    )

    # Style the percentage text
    for autotext in autotexts:
        autotext.set_color("#000000")
        autotext.set_fontsize(18)
        autotext.set_fontweight("bold")

    # Center circle text - VDX
    ax.text(
        0,
        0.12,
        "VDX",
        ha="center",
        va="center",
        fontsize=46,
        fontweight="bold",
        color="#4ade80",
    )
    ax.text(
        0,
        -0.06,
        "$",
        ha="center",
        va="center",
        fontsize=30,
        color="#22c55e",
    )
    ax.text(
        0,
        -0.22,
        "1,000,000,000",
        ha="center",
        va="center",
        fontsize=18,
        color="#f0fdf4",
        fontweight="600",
    )
    ax.text(
        0,
        -0.34,
        "Total Supply",
        ha="center",
        va="center",
        fontsize=12,
        color="#86a389",
    )

    # Legend
    legend_labels = [
        f"  Liquidity Mining & Farms  —  40%",
        f"  Treasury & Ecosystem  —  20%",
        f"  Team & Advisors  —  15%",
        f"  Community & Airdrops  —  15%",
        f"  Private Sale  —  10%",
    ]
    legend = ax.legend(
        wedges,
        legend_labels,
        loc="center left",
        bbox_to_anchor=(1.05, 0.5),
        fontsize=13,
        frameon=False,
        labelcolor="#f0fdf4",
    )

    # Title
    ax.set_title(
        "VDX TOKEN ALLOCATION",
        fontsize=20,
        fontweight="bold",
        color="#4ade80",
        pad=24,
        loc="center",
    )

    plt.tight_layout()
    plt.savefig(
        output_path,
        dpi=200,
        bbox_inches="tight",
        facecolor="#020802",
        transparent=False,
    )
    plt.close()
    print(f"Donut chart saved: {output_path}")


def create_emission_chart(output_path):
    """Create a bar chart showing VDX emission decay over quarters."""
    # Quarterly decay: 5M/week start, -10% per quarter
    quarters = list(range(1, 13))
    emissions = [5.0 * (0.90 ** (q - 1)) for q in quarters]

    fig, ax = plt.subplots(figsize=(12, 7), facecolor="#020802")
    ax.set_facecolor("#020802")

    # Bars with green gradient effect
    bar_colors = ["#22c55e", "#2ecb6a", "#4ade80", "#4ade80", "#16a34a", "#16a34a",
                  "#15803d", "#15803d", "#166534", "#14532d", "#14532d", "#0f3d1f"]
    bars = ax.bar(
        [f"Q{q}" for q in quarters],
        emissions,
        color=bar_colors,
        edgecolor="#4ade80",
        linewidth=1.5,
        width=0.65,
    )

    # Add value labels on bars
    for bar, em in zip(bars, emissions):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.12,
            f"{em:.2f}M",
            ha="center",
            va="bottom",
            fontsize=11,
            color="#4ade80",
            fontweight="bold",
        )

    # Styling
    ax.set_xlabel("Quarter", fontsize=14, color="#f0fdf4", labelpad=12, fontweight="600")
    ax.set_ylabel(
        "Weekly VDX Emissions (millions)",
        fontsize=14,
        color="#f0fdf4",
        labelpad=12,
        fontweight="600",
    )
    ax.set_title(
        "VDX FARM EMISSION SCHEDULE — Quarterly Decay (-10%)",
        fontsize=18,
        fontweight="bold",
        color="#4ade80",
        pad=20,
    )

    ax.tick_params(colors="#86a389", labelsize=12)
    for spine in ax.spines.values():
        spine.set_color("#16a34a")
        spine.set_alpha(0.3)
    ax.grid(axis="y", alpha=0.1, color="#22c55e", linestyle="--")

    plt.tight_layout()
    plt.savefig(
        output_path,
        dpi=200,
        bbox_inches="tight",
        facecolor="#020802",
        transparent=False,
    )
    plt.close()
    print(f"Emission chart saved: {output_path}")


def create_combined_chart(output_path):
    """Create a single combined tokenomics infographic."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(20, 10), facecolor="#020802")
    fig.patch.set_facecolor("#020802")

    # === LEFT: Donut chart ===
    ax1.set_facecolor("#020802")
    sizes = [40, 20, 15, 15, 10]
    colors = ["#22c55e", "#4ade80", "#16a34a", "#15803d", "#86efac"]

    wedges, _, autotexts = ax1.pie(
        sizes,
        labels=None,
        autopct="%d%%",
        startangle=90,
        colors=colors,
        pctdistance=0.78,
        wedgeprops=dict(width=0.42, edgecolor="#020802", linewidth=4),
    )
    for autotext in autotexts:
        autotext.set_color("#000000")
        autotext.set_fontsize(17)
        autotext.set_fontweight("bold")

    ax1.text(0, 0.12, "VDX", ha="center", va="center", fontsize=48,
             fontweight="bold", color="#4ade80")
    ax1.text(0, -0.08, "1B", ha="center", va="center", fontsize=28,
             color="#f0fdf4", fontweight="bold")
    ax1.text(0, -0.24, "Total Supply", ha="center", va="center",
             fontsize=13, color="#86a389")
    ax1.set_title("Token Allocation", fontsize=22, fontweight="bold",
                  color="#4ade80", pad=20)

    # Legend for donut
    legend_labels = [
        "Liquidity Mining & Farms — 40%",
        "Treasury & Ecosystem — 20%",
        "Team & Advisors — 15%",
        "Community & Airdrops — 15%",
        "Private Sale — 10%",
    ]
    ax1.legend(wedges, legend_labels, loc="center left",
               bbox_to_anchor=(-0.1, -0.12), fontsize=12, frameon=False,
               labelcolor="#f0fdf4", ncol=1)

    # === RIGHT: Emission decay chart ===
    ax2.set_facecolor("#020802")
    quarters = list(range(1, 13))
    emissions = [5.0 * (0.90 ** (q - 1)) for q in quarters]
    bar_colors = ["#22c55e", "#2ecb6a", "#4ade80", "#4ade80", "#16a34a", "#16a34a",
                   "#15803d", "#15803d", "#166534", "#14532d", "#14532d", "#0f3d1f"]

    bars = ax2.bar([f"Q{q}" for q in quarters], emissions, color=bar_colors,
                   edgecolor="#4ade80", linewidth=1.5, width=0.65)

    for bar, em in zip(bars, emissions):
        ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.12,
                 f"{em:.1f}M", ha="center", va="bottom", fontsize=10,
                 color="#4ade80", fontweight="bold")

    ax2.set_xlabel("Quarter", fontsize=14, color="#f0fdf4",
                   labelpad=12, fontweight="600")
    ax2.set_ylabel("Weekly VDX Emissions (M)", fontsize=14, color="#f0fdf4",
                   labelpad=12, fontweight="600")
    ax2.set_title("Emission Schedule (Quarterly -10% Decay)",
                  fontsize=20, fontweight="bold", color="#4ade80", pad=20)
    ax2.tick_params(colors="#86a389", labelsize=11)
    for spine in ax2.spines.values():
        spine.set_color("#16a34a")
        spine.set_alpha(0.3)
    ax2.grid(axis="y", alpha=0.1, color="#22c55e", linestyle="--")

    plt.tight_layout()
    plt.savefig(output_path, dpi=180, bbox_inches="tight",
                facecolor="#020802", transparent=False)
    plt.close()
    print(f"Combined chart saved: {output_path}")


def main():
    base = r"C:\Users\kidst\Videos\verdex-website\assets"

    create_donut_chart(f"{base}\\verdex-tokenomics-allocation.png")
    create_emission_chart(f"{base}\\verdex-tokenomics-emissions.png")
    create_combined_chart(f"{base}\\verdex-tokenomics-chart.png")


if __name__ == "__main__":
    main()
