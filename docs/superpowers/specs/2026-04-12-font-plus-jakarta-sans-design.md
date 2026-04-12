# Spec C — Font: Geist → Plus Jakarta Sans

**Date:** 2026-04-12
**Status:** Approved

---

## Summary

Replace the current UI font (Geist Variable) with Plus Jakarta Sans Variable across Remex Studio. The font variable cascades to all components automatically — no component-level changes required.

---

## Motivation

Plus Jakarta Sans was selected over Geist, Inter, and DM Sans for its modern look with slightly more warmth, particularly at heading sizes. It remains clean and legible at small UI sizes.

---

## Changes

### 1. Install new package

```bash
cd studio
npm install @fontsource-variable/plus-jakarta-sans
```

### 2. Remove old package

```bash
npm uninstall @fontsource-variable/geist
```

### 3. `studio/src/index.css`

Replace:
```css
@import "@fontsource-variable/geist";
```
With:
```css
@import "@fontsource-variable/plus-jakarta-sans";
```

Update `--font-sans` in `@theme inline`:
```css
--font-sans: 'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
```

---

## Constraints

- **Offline-first:** font is self-hosted via the npm package — no CDN or network dependency.
- **No component changes:** the `--font-sans` CSS variable is consumed by Tailwind's `font-sans` utility, which is already applied globally. All components inherit the new font automatically.

---

## Out of Scope

- Changing the monospace font (`--font-mono`) — kept as-is.
- Per-component font overrides.
