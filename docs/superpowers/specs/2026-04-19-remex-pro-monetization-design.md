# Remex Pro — Monetization Design

**Status:** Approved for implementation planning.
**Date:** 2026-04-19.
**Target release:** Studio v1.3.0 (first commercial release).

## Goal

Turn Remex Studio into a sustainable one-person business by launching a paid "Pro" tier, without compromising the local-first value prop or breaking trust with existing free users. The Python CLI and library stay free and Apache-2.0 forever; only the desktop app becomes commercial.

The guiding constraint on this design is **do not build infrastructure Remex does not yet need**. We lean on Lemon Squeezy for checkout, emailing license keys, and license-key validation. Studio talks to LS directly. No custom backend, no `remex.app` license endpoints, no signing pipeline, no cron jobs, no secrets to rotate. If scale or pricing ever justifies moving license issuance in-house, that's a future migration — not a launch requirement.

## Scope

In scope:
- Open-core split: `remex-cli` stays Apache-2.0; `studio/` relicenses to FSL-1.1-MIT going forward.
- Free tier: fully functional, unlimited local ingest and queries — unchanged from v1.2.x.
- Paid "Remex Pro" tier: one-time $49 (founders: $39), lifetime updates on the v1.x line.
- Six Pro features: larger embedding models, advanced exports, watch-folder auto-ingest, unlimited searchable query history, extra themes + Pro badge, priority email support.
- License system: Lemon Squeezy license keys, verified via their public `activate`/`validate` endpoints directly from Studio. Local cache for offline tolerance.
- In-Studio Upgrade UX: feature gating, Upgrade modal, Settings → License card.

Explicitly out of scope at launch:
- Any custom license server, signing keys, revocation pipeline, or backend repo. LS is the source of truth.
- A `remex.app` landing page for licensing. A plain README link to the LS checkout URL is enough. (A marketing site is its own future project.)
- Remex Cloud (sync / backup / multi-device) — deferred until Pro demand is validated.
- Teams / enterprise pricing, bulk licensing dashboard, admin portal.
- Any in-app telemetry or usage analytics — brand promise is no-telemetry.
- Mobile apps, macOS, Linux builds (Windows-only, as today).
- App Store distribution — stays on GitHub Releases + Tauri auto-updater.
- User accounts, passwords, login flows. The license key is the identifier.

## Non-goals / things we deliberately do not do

- No hardware-bound licenses. LS's per-product `activation_limit` is set to unlimited (or a generous cap like 10) so users aren't blocked moving between machines.
- No time-limited trial. The free tier is the trial.
- No A/B testing, no in-app funnel tracking.
- No custom Ed25519 signing infrastructure. LS's validate endpoint is the trust anchor.
- No re-gating of features that were free in v1.2.x. Everything currently free stays free.

## Target user

Individual Windows users, mixed technical level:
- **Knowledge workers, researchers, students** (price tolerance: $20–50 one-time, $5–8/mo).
- **Developers / prosumers** (price tolerance: $60–120 one-time, $8–15/mo).

Both segments fit cleanly under one Pro SKU at $49. No seats, no tiers at launch.

## Architecture

Two components. That's it.

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Lemon Squeezy      │ ─────► │  User's mailbox          │
│  (checkout +        │  emails│  (license key delivered  │
│   license key       │  key   │   by LS directly)        │
│   issuance +        │        └──────────────────────────┘
│   validation API)   │ ◄────┐
└─────────────────────┘      │ POST /v1/licenses/{activate,validate,deactivate}
                             │
                 ┌───────────┴──────────────┐
                 │  Remex Studio (desktop)  │
                 │  • paste LS license key  │
                 │  • activate (online)     │
                 │  • cache instance_id +   │
                 │    last-validated-at     │
                 │  • revalidate every 14d  │
                 │    (silent, soft-fail)   │
                 └──────────────────────────┘
```

Key properties:
- Lemon Squeezy owns: checkout, license-key generation, refund-triggered revocation (flips `status` to `inactive`), the email to the customer, and the validation endpoint.
- Remex owns: pasting the key, caching the response locally, showing/hiding Pro features, and periodically re-checking with LS.
- The only network dependency is LS itself. No `remex.app` endpoint needs to be up for licensing to work.
- All license state on the user's machine lives in one file: `%APPDATA%\remex\license.json` (Windows; resolved via Tauri's `app_data_dir`).
- Degrades open: LS down → cached license still works, background re-validation retries. Only a conclusive `{ active: false, status: "inactive" }` from LS flips Pro off.

## License key format

Whatever LS issues. At time of writing, that's a UUID v4 string (e.g., `38b1460a-5104-4067-a91d-77b872934d51`), delivered in the purchase confirmation email.

We do not wrap, re-encode, or re-sign it. Studio passes it verbatim to the LS API.

Advantage: if LS ever changes their key format, we inherit the change for free — no migration needed.

## License verification (Studio)

Lives in `studio/src-tauri/src/license.rs`. Two dependencies: `reqwest` (already transitively available) and `serde`.

### API surface

Three Tauri commands:
- `license_activate(key: String) -> Result<LicenseStatus, String>` — calls LS `/v1/licenses/activate` with `instance_name = hostname || "remex-studio"`. On success, persists `{ key, instance_id, status, customer_email, activated_at, last_validated_at }` atomically to `license.json`. Rejects on `activated: false`.
- `license_status() -> LicenseStatus` — reads the persisted file. Returns `{ tier: "free" | "pro", email, activated_at, last_validated_at }`. Does not hit the network.
- `license_deactivate() -> ()` — calls LS `/v1/licenses/deactivate` with cached `instance_id`, then deletes the local file. Swallows network errors (we still want the local file gone).
- `license_revalidate() -> Result<LicenseStatus, String>` — calls LS `/v1/licenses/validate`. Runs in the background on a 14-day cadence; see below. Exposed as a Tauri command so the Settings card can offer a manual "Check license now" button.

### Activation call (example)

```rust
pub async fn activate(key: &str) -> Result<Activated, ActivateError> {
    let body = [
        ("license_key", key),
        ("instance_name", &instance_name()),
    ];
    let resp: LsActivateResponse = client()
        .post("https://api.lemonsqueezy.com/v1/licenses/activate")
        .header("Accept", "application/json")
        .form(&body)
        .send().await?
        .json().await?;

    if !resp.activated {
        return Err(ActivateError::Rejected(resp.error.unwrap_or_default()));
    }
    if resp.meta.product_id != EXPECTED_PRODUCT_ID {
        return Err(ActivateError::WrongProduct);
    }

    Ok(Activated {
        instance_id: resp.instance.id,
        email:       resp.meta.customer_email,
        status:      resp.license_key.status,
        expires_at:  resp.license_key.expires_at,
    })
}
```

The `EXPECTED_PRODUCT_ID` constant is compiled into the binary. It ensures a key for a different LS product (ours or someone else's) cannot unlock Remex Pro.

## Re-validation strategy

**Cadence:** on Studio startup, if `last_validated_at > 14 days ago`, kick off a background `license_revalidate()`. Never block the UI on this call.

**Soft failure (stay Pro):**
- Network error / timeout / 5xx.
- Unexpected/malformed response.
- LS returns `valid: true` — obviously.

**Hard failure (flip to free on next startup):**
- LS returns `valid: false` with `license_key.status` ∈ `{ "inactive", "disabled", "expired" }`.

This covers refunds (LS sets status to `inactive` on refund) and manual disables for fraud. The user sees a non-scary toast: "Your Remex Pro license was deactivated by Lemon Squeezy. Contact support@remex.app if this is unexpected." No data is touched.

**Offline tolerance ceiling:** a Pro user who never goes online still works forever — `last_validated_at` simply never advances, and the local cache is trusted. We intentionally do not enforce a max-offline window (e.g., "90 days without validation locks Pro"). Rationale: the local-first audience includes people on planes, ships, and air-gapped networks. Revenue loss from an edge-case offline power user is tiny; brand damage from "Pro locked while I was on a flight" is not.

## Feature gating in Studio

Single source of truth: a `license` slice on the existing Zustand store.

```ts
type LicenseState = {
  tier: "free" | "pro";
  email: string | null;
  activatedAt: number | null;
  lastValidatedAt: number | null;
  activate: (key: string) => Promise<{ ok: boolean; error?: string }>;
  deactivate: () => Promise<void>;
  revalidate: () => Promise<void>;
};

export const useIsPro = () => useAppStore((s) => s.license.tier === "pro");
```

Three gating patterns, applied per feature:

**Pattern A — Hard gate (component doesn't render):**
- Advanced exports (BibTeX, Obsidian vault).
- Watch-folder auto-ingest settings card.

**Pattern B — Soft gate (visible but locked, upsell inline):**
- Pro embedding models in the Settings model dropdown. Locked entries show a Pro badge; clicking opens the Upgrade modal.
- Extra themes in Settings → Appearance.

**Pattern C — Limit flag (feature works, with a cap):**
- Query history: free gets `.slice(0, 20)`, Pro gets unlimited + full-text search.

### The Upgrade modal

Single component at `studio/src/components/license/UpgradeModal.tsx`. Triggered from any Pattern B locked surface, or from Settings → License → "Upgrade to Pro" button. Content:
- 3-bullet value prop, contextualized to the surface that triggered it.
- `$49 · one-time · lifetime updates`.
- `[Buy Pro]` → opens the LS checkout URL in the default browser via `tauri-plugin-shell::open()`.
- `[I already have a key]` → focuses the license-paste field in the Settings card.

No pricing tables, no comparison grids, no tier selector — one SKU.

The checkout URL is a hardcoded `const`, e.g. `https://remex.lemonsqueezy.com/buy/<variant-id>?checkout[custom][source]=studio-in-app`. The `source` marker shows up on the order in the LS dashboard and lets us attribute sales to in-app upgrades vs organic.

### Settings → License card

Added to the right column of the Settings pane, below AI Agent and Help & feedback.

Free state:
- Title: "Remex Pro"
- Sub: "Unlock advanced exports, watch-folder auto-ingest, bigger embedding models, and more."
- Primary: `[Upgrade to Pro · $49]`
- Secondary: `[I already have a key]` (reveals an inline paste field + `[Activate]`)

Pro state:
- Title: "Remex Pro" + Pro chip
- Line 1: `Licensed to {email}`
- Line 2: `Activated {relative date} · last checked {relative date}`
- Secondary: `[Check license now]` (manual `license_revalidate` call)
- Tertiary: `[Deactivate this machine]` — confirmation dialog, then runs `license_deactivate`.

## Purchase & activation flow

1. User clicks `[Upgrade to Pro]` in the Upgrade modal or Settings card.
2. Studio opens the LS checkout URL in the default browser. Modal instructs them to check their email after payment.
3. User completes payment in their browser (card, Apple Pay, Google Pay, PayPal — all handled by LS).
4. LS generates a license key and emails it to the customer. **No webhook, no intermediary.**
5. User copies the key from their email, returns to Studio, clicks `[I already have a key]`, pastes, `[Activate]`.
6. Studio calls `/v1/licenses/activate`. On success, `license.json` is written atomically; `useIsPro()` flips to `true`; a welcome toast appears; Pro features come alive.
7. 14 days later, on next startup, a silent `license_revalidate()` runs in the background.

### Edge cases (design-level decisions)

| Case | Behavior |
|:---|:---|
| Malformed key (not a UUID) | Inline validation — don't even call LS. "That doesn't look like a valid Remex license key. Keys arrived in your purchase confirmation email." |
| LS says `activated: false` | Show the error text verbatim ("This license key has reached its activation limit", etc.) with a "Contact support" link. |
| Key is for a different LS product | Our `product_id` check rejects it: "This key isn't for Remex. Check your purchase confirmation email or contact support." |
| User lost their key | Direct them to LS's built-in "resend license key" customer flow (they have one). `support@remex.app` can also re-issue by hand from the LS dashboard. |
| Studio offline at activation | Activation fails cleanly: "Can't reach Lemon Squeezy right now. License activation needs a one-time internet connection. Try again?" |
| User moves to a new machine | Old machine: `[Deactivate this machine]`. New machine: paste the same key, `[Activate]`. Or just paste — the LS `activation_limit` is set high enough (10) that most users never need to deactivate. |
| Chargeback / refund | LS flips the key's `status` to `inactive` automatically. Next `license_revalidate()` gets `valid: false` and Studio flips to free. |
| LS outage during revalidate | Soft fail, stay Pro, retry on next startup. |

## Pro feature bundle (launch)

All six features are new work — none existed in v1.2.x. No regressions for free users.

1. **Pro embedding models** — `bge-large-en-v1.5`, `e5-large-v2`, `nomic-embed-text-v1.5` added to the Settings → Embedding Model dropdown. Free keeps `all-MiniLM-L6-v2` as default; bge-small and e5-small remain free.
2. **Advanced exports** — BibTeX, structured citations (RIS, CSL-JSON), Obsidian-vault folder export. Free keeps JSON, CSV, Markdown.
3. **Watch-folder auto-ingest** — user designates folders; Studio re-ingests changed files on a debounced filesystem-watch trigger. Sidecar endpoint + CLI support already exist for incremental ingest.
4. **Unlimited searchable query history** — free caps at 20 most-recent; Pro stores unlimited and adds a full-text search box over past queries and answers.
5. **Extra themes + Pro badge** — 8 additional accent colors, a `Pro` chip in the sidebar footer.
6. **Priority email support** — `support@remex.app` with a published 48-hour business-day SLA for Pro users; community-only (GitHub Discussions) for free users.

## Configuration in the Lemon Squeezy dashboard

One-time setup before public launch. Documented here so future-me can reproduce it.

| Setting | Value |
|:---|:---|
| Store | `remex` (existing) |
| Product | "Remex Pro" — Single-payment license |
| Variant | Founders (Default) — $39 |
| Variant | Regular — $49 (hidden until trigger) |
| License keys | Enabled |
| Activation limit | 10 per key (generous; no customer lockout from machine moves) |
| License expiration | None (perpetual) |
| Refund policy | 14-day no-questions-asked |
| Webhooks | None needed at launch |

The `EXPECTED_PRODUCT_ID` constant in Studio comes from this variant's product ID. A staging product with a separate ID is used during dev (see Phase 1 rollout).

## Fixed and marginal costs

At launch, **Remex's fixed monthly licensing cost is $0.** The only cost is LS's 5% + $0.50 Merchant-of-Record fee per sale. A $49 sale nets ~$45.60; a $39 founders sale nets ~$36.55.

No Cloudflare subscription, no Resend account, no custom domain DNS costs, no uptime-monitoring pings — until and unless we later decide to move license issuance in-house.

## Relicensing

Studio needs to leave Apache-2.0 going forward. The solo-dev copyright ownership makes this clean.

Decisions:
- `remex/` Python lib and `remex-cli` on PyPI: **stay Apache-2.0**, indefinitely.
- `studio/` subtree: **relicense to FSL-1.1-MIT** starting with v1.3.0.
- Root `LICENSE` stays Apache-2.0 (covers everything outside `studio/`).
- New `studio/LICENSE` covers that subtree.
- New `LICENSES.md` at repo root explains the split in plain English.
- All pre-v1.3.0 releases remain Apache-2.0 forever; they are not pulled from GitHub Releases or PyPI.

Why FSL-1.1-MIT:
- Anyone, including companies, can use the Studio binary freely.
- Forking to build a commercial competitor is prohibited.
- Each release auto-converts to MIT after 2 years — preserves the "local-first, eventually-open" ethos.
- Matches the license choice of Sentry and a growing cohort of indie/scaleup source-available projects.

## Pricing

- **Launch price: $39 one-time (founders).** Includes lifetime updates on the v1.x line.
- **Regular price: $49 one-time.** Applied after 200 paid licenses sold **or** 90 days post-launch, whichever comes first.
- **Future v2.0 upgrade:** $19–29 for existing v1 Pro holders, $49 clean for new buyers. Released only when materially justified (e.g., Cloud tier, major redesign).

Pricing is edited entirely in the Lemon Squeezy dashboard — there is no `pricing.json` to maintain because there's no custom backend serving it. The Studio Upgrade modal hardcodes the current price string and ships in the next Studio release when we raise it. Cheap to change, and aligned with our "ship infrastructure only when needed" principle.

## Communication plan

v1.3.0 release announcement posts in three places, all saying the same thing:
1. **GitHub release notes** — top section "Remex is now commercial — here's what that means for you."
2. **CHANGELOG.md** — normal entry plus a `Note: Studio license changed` line pointing to `LICENSES.md`.
3. **Blog post** — a GitHub Discussion post under the `Announcements` category at launch (no custom blog platform to maintain). Honest "solo dev, this is how I make the math work" framing. Ends with the founders price.

Explicitly avoided: corporate-speak ("we're going premium 🚀"), urgency countdowns, "only N licenses left" scarcity tactics. The audience is indie-savvy; those patterns repel them.

## Rollout phases

1. **Phase 0 — build (1–2 weeks).** Implement the license layer + six Pro features in a `feat/pro` branch. Pro features sit behind a dev-time `VITE_FORCE_PRO=true` flag until activation is wired up.
2. **Phase 1 — dogfood (few days).** Create a **staging** LS product (separate variant ID) with $0 pricing. Issue yourself a test key. Run through activate/revalidate/deactivate/refund end-to-end against it. Fix what chafes.
3. **Phase 2 — closed beta (1 week).** Announce in a GitHub Discussion. Hand out 10–30 free keys from the staging product to volunteers. Iterate on Upgrade modal copy and activation errors.
4. **Phase 3 — public launch (v1.3.0).** Switch `EXPECTED_PRODUCT_ID` to production. Merge `feat/pro` → `main`. Tag `v1.3.0`. Publish release notes + GitHub Discussion announcement. Post once to HN, r/LocalLLaMA, r/ObsidianMD. Watch 48 hours for bugs.
5. **Phase 4 — post-launch (ongoing).** Conversion metrics only at the LS dashboard level — no in-app analytics. Weekly solo retro. Raise price from $39 → $49 at the 200-sale or 90-day trigger.

Compared to the original design, Phase 0 is compressed because we're not building a license server in parallel.

## Success criteria

| Metric | Launch + 3 months | Launch + 12 months |
|:---|:---|:---|
| Paid Pro licenses | 50 | 400 |
| Effective MRR (one-time amortized over 12 months) | $160 | $1,300 |
| Gross margin (after LS 5% + infra) | 94% | 94% |
| Refund rate | < 10% | < 5% |
| Free → Pro conversion (of active weekly users) | 2% | 5% |

If launch+3 lands below half the 3-month target, we pause new features and investigate the funnel. If it meets or exceeds the target, we begin scoping the Cloud tier for 2026-Q4.

## Testing strategy

- **Studio license layer:** Rust unit tests in `license.rs` — malformed input rejected, wrong product ID rejected, network error returns `ActivateError::Network`, persistence round-trip. An integration test with a mock HTTP server (`wiremock`) for the three LS endpoints covers happy and hard-fail paths without hitting the real LS API.
- **Frontend gating:** Vitest + Testing Library. Render each Pattern-B feature with `isPro=false` and assert locked state; `isPro=true` and assert unlocked. Upgrade modal opens on locked-click. Settings → License card renders free and Pro states.
- **End-to-end activation:** manual in Phase 1 dogfood against the staging LS product. Automated E2E only if ops pain emerges.

## Deferred — things we may build later, explicitly not now

These are captured so future-me doesn't have to re-derive them if/when Remex scales past LS's comfort zone:

- **Custom license server.** Cloudflare Worker + D1 + R2, signs Ed25519 license keys, hosts signed `revoked.json`, handles webhook from LS. Justified when: LS pricing changes dramatically, LS has repeated outages, or we need offline-bootstrap activation for enterprise customers. Not now.
- **Multi-machine management UI.** A `remex.app/account` dashboard where users see and deactivate their instances themselves. Justified when: support load from "I need to move to a new PC" exceeds a handful of requests per week. Until then, LS's 10-activation cap handles it organically.
- **Usage analytics for funnel tracking.** We won't do in-app telemetry, but a one-shot "how did you hear about us" on the LS checkout page is fair game later.
- **Remex Cloud.** Sync, backup, cross-device. Wholly separate product with a real backend; only pursued if Pro revenue justifies it.

## Open questions (resolved during brainstorming, recorded here for future-me)

- **Do we want a time-limited Pro trial?** No. The free tier serves that role.
- **Do we want per-seat team licensing at launch?** No. Manual 20% bulk discount on request via LS coupon.
- **Do we want in-app analytics for funnel tracking?** No. Conversion metrics come from the LS dashboard only.
- **Do we support hardware-bound licenses?** No. Activation limit is set generously (10); most users never hit it.
- **Do we sign our own license keys?** Not at launch. LS's validate endpoint is our trust anchor. If LS ever disappears, we migrate — but that's a one-time project, not an ongoing tax on every release.
- **Do we keep a staging environment?** Yes — one staging LS product (separate variant) for local dev and beta keys. No custom staging infra because there's no custom infra.

## Appendix — prior art this design draws from

- **Obsidian:** fully-functional free, paid addons (Sync, Publish) for genuine cloud-cost services.
- **Sublime Text:** perpetual license with major-version upgrade fee, online activation, offline tolerance.
- **Raycast Pro, Linear, Cursor:** all ship with Lemon Squeezy or similar MoR-backed licensing; none roll their own.
- **Sentry:** FSL-1.1-MIT source-available license as the solo-dev-to-sustainable-business precedent.
- **Tailscale:** low-friction checkout, silent background checks, no in-app telemetry. The bar.
