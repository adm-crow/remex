# Font Swap: Geist → Plus Jakarta Sans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Geist Variable font with Plus Jakarta Sans Variable across Remex Studio.

**Architecture:** The font is loaded once via a CSS `@import` in `index.css` and exposed as the `--font-sans` CSS variable consumed by Tailwind's `font-sans` utility globally. Swapping the import and variable value is sufficient — no component changes required.

**Tech Stack:** `@fontsource-variable/plus-jakarta-sans` (npm), Tailwind CSS v4, `index.css`

---

### Task 1: Swap the font package

**Files:**
- Modify: `studio/package.json` (via npm commands)

> Note: This is a visual/CSS change — there are no unit tests to write. Verification is done by running the dev server and inspecting the rendered font.

- [ ] **Step 1: Uninstall Geist**

```bash
cd studio
npm uninstall @fontsource-variable/geist
```

Expected: `@fontsource-variable/geist` removed from `package.json` dependencies.

- [ ] **Step 2: Install Plus Jakarta Sans**

```bash
npm install @fontsource-variable/plus-jakarta-sans
```

Expected: `@fontsource-variable/plus-jakarta-sans` appears in `package.json` dependencies.

- [ ] **Step 3: Commit**

```bash
git add studio/package.json studio/package-lock.json
git commit -m "chore(studio): swap font package geist → plus-jakarta-sans"
```

---

### Task 2: Update CSS

**Files:**
- Modify: `studio/src/index.css`

- [ ] **Step 1: Replace the import**

In `studio/src/index.css`, replace:
```css
@import "@fontsource-variable/geist";
```
With:
```css
@import "@fontsource-variable/plus-jakarta-sans";
```

- [ ] **Step 2: Update the font variable**

In the same file, inside `@theme inline { … }`, replace:
```css
--font-sans: 'Geist Variable', 'Geist', system-ui, -apple-system, sans-serif;
```
With:
```css
--font-sans: 'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
```

- [ ] **Step 3: Verify visually**

Start the dev server:
```bash
npm run dev
```

Open the app. Check:
- Home page title "Remex Studio" renders in Plus Jakarta Sans (rounder, slightly warmer than Geist)
- Sidebar labels, buttons, and body text all use the new font
- Monospace elements (file paths, code) are unaffected (still use `--font-mono`)

- [ ] **Step 4: Commit**

```bash
git add studio/src/index.css
git commit -m "feat(studio): switch UI font to Plus Jakarta Sans"
```
