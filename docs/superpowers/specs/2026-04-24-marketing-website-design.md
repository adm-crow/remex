# Remex Marketing Website — Design Spec

**Goal:** One-page static marketing site hosted on Hostinger at getremex.com.

**Output:** A single `website/index.html` file (self-contained, no build step).

---

## Visual Style

- **Style:** Clean & Professional — white background, dark text, green accents
- **Primary colour:** `#1CAC78` → `#7EBD01` gradient (matches logo and app)
- **Font:** Plus Jakarta Sans (loaded from Google Fonts)
- **No emojis** — Lucide-style inline SVG icons throughout

## Page Structure (Story-led)

1. **Nav** — logo + "How it works" + "Pricing" anchors + "Buy Pro — 29€" + "Download free" (primary CTA)
2. **Hero** — headline, subheadline, download CTA, app screenshot mockup
3. **Trust strip** — 4 reassurances: offline, no API key, files stay local, pay once
4. **How it works** — 3 steps: Ingest → Search → Answer
5. **Why Remex** — 4 differentiator cards (offline, 12 formats + badges, bring your own AI, CLI+Desktop+API)
6. **Pro pricing** — Free vs Pro table, 29€ buy button (Lemon Squeezy)
7. **Footer** — logo, GitHub · PyPI · Changelog · Licenses links, license note

## Key Decisions

- **Primary CTA:** free download — conversion happens inside the app
- **Hero badge removed** — no "Windows · 100% offline" pill
- **Hero headline:** "Your documents. / Searchable with AI. / Completely private."
- **"View on GitHub" removed** from hero CTAs
- **Format badges** live inside the "12 file formats" Why Remex card (compact, small size)
- **Logo:** real SVG path from `logo.svg`, not a placeholder square

## URLs

- Download: `https://github.com/adm-crow/remex/releases`
- Buy Pro: `https://getremex.lemonsqueezy.com/checkout/buy/6ade10f8-4f82-4f77-b139-c8b798629cae`
- GitHub: `https://github.com/adm-crow/remex`
- PyPI: `https://pypi.org/project/remex-cli`
