# Remex Pro — Monetization Design

**Status:** Approved for implementation planning.
**Date:** 2026-04-19.
**Target release:** Studio v1.3.0 (first commercial release).

## Goal

Turn Remex Studio into a sustainable one-person business by launching a paid "Pro" tier, without compromising the local-first value prop or breaking trust with existing free users. The Python CLI and library stay free and Apache-2.0 forever; only the desktop app becomes commercial.

## Scope

In scope:
- Open-core split: `remex-cli` stays Apache-2.0; `studio/` relicenses to FSL-1.1-MIT going forward.
- Free tier: fully functional, unlimited local ingest and queries — unchanged from v1.2.x.
- Paid "Remex Pro" tier: one-time $49 (founders: $39), lifetime updates on the v1.x line.
- Six Pro features: larger embedding models, advanced exports, watch-folder auto-ingest, unlimited searchable query history, extra themes + Pro badge, priority email support.
- License system: Ed25519-signed keys, offline verification, weekly silent revocation check.
- Commercial backend: single Cloudflare Worker + D1 + R2, integrated with Lemon Squeezy (merchant of record) and Resend (transactional email).
- In-Studio Upgrade UX: feature gating, Upgrade modal, Settings → License card.

Explicitly out of scope at launch:
- Remex Cloud (sync / backup / multi-device) — deferred to a post-v1.3 release once Pro demand is validated.
- Teams / enterprise pricing, bulk licensing dashboard, or admin portal.
- Any in-app telemetry or usage analytics — brand promise is no-telemetry.
- Mobile apps, macOS, Linux builds (Windows-only, as today).
- App Store distribution — stays on GitHub Releases, Tauri auto-updater.
- User accounts, passwords, login flows. Email + receipt are the identifier.

## Non-goals / things we deliberately do not do

- No hardware-bound licenses (no "3 machines max" counter).
- No online activation step. Paste key, verify offline, done.
- No time-limited trial. The free tier is the trial.
- No A/B testing, no in-app funnel tracking.
- No license management dashboard for end users — a static `remex.app/activate` page handles resend-key + purchase.
- No re-gating of features that were free in v1.2.x. Everything currently free stays free.

## Target user

Individual Windows users, mixed technical level:
- **Knowledge workers, researchers, students** (price tolerance: $20–50 one-time, $5–8/mo).
- **Developers / prosumers** (price tolerance: $60–120 one-time, $8–15/mo).

Both segments fit cleanly under one Pro SKU at $49. No seats, no tiers at launch.

## Architecture

Three loosely coupled components.

```
┌─────────────────────┐        ┌──────────────────────────┐        ┌────────────────────┐
│   Lemon Squeezy     │ ─────► │ Cloudflare Worker        │ ─────► │  User's Mailbox    │
│   (checkout +       │  POST  │ `licenses.remex.app`     │  SMTP  │  (license email    │
│    merchant of      │  webhk │  • verifies LS webhook   │  via   │   via Resend)      │
│    record)          │        │  • signs Ed25519 payload │ Resend │                    │
└─────────────────────┘        │  • stores order in D1    │        └────────────────────┘
                               │  • publishes revoked.json│
                               └──────────────────────────┘
                                          ▲
                                          │  GET /revoked.json (weekly, silent)
                                          │
                               ┌──────────────────────────┐
                               │  Remex Studio (desktop)  │
                               │  • paste license key     │
                               │  • verify signature      │
                               │    offline (Rust)        │
                               │  • feature flags unlock  │
                               │  • revocation check      │
                               └──────────────────────────┘
```

Key properties:
- The Worker never sees the user's key after issuance. It signs once, emails, forgets.
- Revocation check is pull-only from the client. The Worker has no idea who is making the request.
- All license state on the user's machine lives in one file: `~/.config/remex/license.json`.
- Every network dependency degrades open: license server down → existing Pro users unaffected; revocation endpoint down → last cached list stays active.

## License key format

Ed25519-signed CBOR payload, base32-encoded, prefixed for version hygiene.

Displayed format (chunked for pasteability, ~70 chars):
```
RMX1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
```

Encoded structure:
- Prefix `RMX1` — identifies format version. A future breaking change ships as `RMX2` with a new public key.
- Middle — base32-encoded CBOR payload.
- Tail — base32-encoded Ed25519 signature (64 bytes).

CBOR payload fields:
| Field | Type | Description |
|:---|:---|:---|
| `k` | bytes(16) | Key ID, UUID v7 |
| `e` | string | Purchaser email (for their records) |
| `t` | string | Tier: `"pro"` at launch; reserved: `"cloud"`, `"team"` |
| `i` | int | `issued_at` (unix seconds) |
| `x` | int or null | `expires_at`; `null` for perpetual Pro |

## License verification (Studio)

Lives in `studio/src-tauri/src/license.rs`. One dependency: `ed25519-dalek`. Public key compiled into the binary as `const [u8; 32]`.

```rust
pub fn verify(key: &str) -> Result<License, VerifyError> {
    let (prefix, payload_b32, sig_b32) = split_key(key)?;
    if prefix != "RMX1" { return Err(UnsupportedVersion); }

    let payload = base32::decode(payload_b32)?;
    let sig = Signature::from_bytes(&base32::decode(sig_b32)?)?;

    PUBLIC_KEY.verify(&payload, &sig)?;

    let license: License = ciborium::from_reader(&payload[..])?;
    if let Some(exp) = license.expires_at {
        if exp < now() { return Err(Expired); }
    }
    Ok(license)
}
```

Exposed as Tauri commands:
- `license_activate(key: String) -> Result<LicenseStatus, String>` — verify and persist.
- `license_status() -> LicenseStatus` — read persisted license.
- `license_deactivate() -> ()` — delete local state, revert to free.

## Revocation

A signed revocation list at `https://licenses.remex.app/revoked.json`.

- The Studio runs a background check at startup if `last_check > 7 days ago`.
- Behavior degrades to "keep working with the cached list" on network errors, HTTP 5xx, or invalid signature.
- If a key ID appears in the list, Pro features lock on the next Studio start. User sees a non-scary toast; data is never touched.
- The list itself is Ed25519-signed with the same key Studio already trusts. Protects against MITM tampering.

Revoke triggers:
- Lemon Squeezy `order_refunded` or `subscription_payment_refunded` webhook.
- Manual admin action for fraud or obvious forum leak.

## Feature gating in Studio

Single source of truth: a `license` slice on the existing Zustand store.

```ts
type LicenseState = {
  status: "free" | "pro" | "revoked";
  email: string | null;
  keyId: string | null;
  issuedAt: number | null;
  activate: (key: string) => Promise<{ ok: boolean; error?: string }>;
  deactivate: () => Promise<void>;
  refreshRevocation: () => Promise<void>;
};

export const useIsPro = () => useAppStore((s) => s.license.status === "pro");
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
- `[Buy Pro]` → opens Lemon Squeezy checkout in the default browser.
- `[I already have a key]` → focuses the license-paste field in the Settings card.

No pricing tables, no comparison grids, no tier selector — one SKU.

### Settings → License card

Added to the right column of the Settings pane, below AI Agent and Help & feedback. Two states: free (Upgrade button, "I already have a key" secondary) and Pro (status, email, key preview, Deactivate button).

## Purchase & activation flow

1. User clicks `[Upgrade to Pro]` in the Upgrade modal or Settings card.
2. Studio calls `tauri-plugin-shell::open()` with the Lemon Squeezy checkout URL, passing `checkout[custom][source]=studio-in-app` as a marker. Modal instructs the user to check their email after payment.
3. User completes payment in their browser (card, Apple Pay, Google Pay, PayPal — all handled by LS).
4. LS fires `order_created` webhook to the Cloudflare Worker.
5. Worker verifies the HMAC signature, generates a `key_id`, signs the payload, stores the row in D1 (idempotent on `order_id`), emails the user via Resend.
6. User copies the key from their email into Settings → License → paste → `[Activate]`.
7. Studio verifies the signature offline, writes `~/.config/remex/license.json` atomically, updates the Zustand slice, shows a welcome toast. Pro features come alive.
8. First background revocation check runs on the next Studio start.

### Edge cases (design-level decisions)

| Case | Behavior |
|:---|:---|
| Malformed key pasted | Inline error: "That doesn't look like a valid Remex license key. Keys start with RMX1-." |
| Revoked key at activation | "This key has been revoked. Contact support@remex.app." |
| License email never arrives | `remex.app/activate` has a "Resend my key" form; takes email + LS order number; rate-limited to 3/hour/IP. |
| Studio offline at activation | Activation works anyway (signature is local). Revocation check defers until online. |
| User moves to a new machine | Install Studio, paste the same key, done. No deactivation dance required. |
| Webhook delivery fails at LS | LS auto-retries for 72h. If our Worker is down longer, we manually replay from the LS dashboard. |
| Chargeback / refund 60+ days later | LS notifies us via webhook → add `key_id` to revoked list → user loses Pro on next weekly check. |

## Pro feature bundle (launch)

All six features are new work — none existed in v1.2.x. No regressions for free users.

1. **Pro embedding models** — `bge-large-en-v1.5`, `e5-large-v2`, `nomic-embed-text-v1.5` added to the Settings → Embedding Model dropdown. Free keeps `all-MiniLM-L6-v2` as default; bge-small and e5-small remain free.
2. **Advanced exports** — BibTeX, structured citations (RIS, CSL-JSON), Obsidian-vault folder export. Free keeps JSON, CSV, Markdown.
3. **Watch-folder auto-ingest** — user designates folders; Studio re-ingests changed files on a debounced filesystem-watch trigger. Sidecar endpoint + CLI support already exist for incremental ingest.
4. **Unlimited searchable query history** — free caps at 20 most-recent; Pro stores unlimited and adds a full-text search box over past queries and answers.
5. **Extra themes + Pro badge** — 8 additional accent colors, a `Pro` chip in the sidebar footer.
6. **Priority email support** — `support@remex.app` with a published 48-hour business-day SLA for Pro users; community-only (GitHub Discussions) for free users.

## Backend infra

Single Cloudflare Worker, ~200 lines of TypeScript. Deployed from a new sibling repo `remex-license-server/` (separate from the main `remex` repo because different deploy unit + holds secrets).

### Repo layout

```
remex-license-server/
├── src/
│   ├── index.ts              # Worker entry, routing
│   ├── webhook.ts            # Lemon Squeezy webhook handler
│   ├── sign.ts               # Ed25519 signing + key encoding
│   ├── revocation.ts         # /revoked.json build + refund handler
│   ├── email.ts              # Resend client
│   └── db.ts                 # D1 schema + queries
├── migrations/
│   └── 0001_init.sql
├── test/                     # Vitest: webhook replay fixtures, signing roundtrip
├── wrangler.toml
└── package.json
```

### D1 schema

```sql
CREATE TABLE licenses (
  key_id        TEXT PRIMARY KEY,        -- UUID v7
  email         TEXT NOT NULL,
  order_id      TEXT NOT NULL UNIQUE,    -- idempotency on LS retries
  tier          TEXT NOT NULL,
  issued_at     INTEGER NOT NULL,
  revoked_at    INTEGER,
  revoke_reason TEXT                     -- 'refund' | 'chargeback' | 'fraud' | 'manual'
);
CREATE INDEX idx_email ON licenses(email);
CREATE INDEX idx_revoked ON licenses(revoked_at) WHERE revoked_at IS NOT NULL;
```

### Secrets (Cloudflare Secrets Manager)

| Secret | Purpose | Rotation |
|:---|:---|:---|
| `LS_WEBHOOK_SECRET` | Verify LS webhook HMAC | On LS-side rotation |
| `ED25519_PRIVATE_KEY` | Sign license + revocation list | Never, unless compromised. On compromise, ship Studio 2.0 with `RMX2` prefix + new public key; grandfather `RMX1` for 6 months. |
| `RESEND_API_KEY` | Transactional email | Annual |
| `ADMIN_TOKEN` | Auth on `/admin/*` endpoints | Annual |

### Endpoints

- `POST /webhook/lemon-squeezy` — HMAC-verified. Dispatches on `meta.event_name`:
  - `order_created` (status paid) → issue key, insert D1 row, email user. Idempotent on `order_id`.
  - `order_refunded`, `subscription_payment_refunded` → set `revoked_at`, trigger revocation list rebuild.
  - Returns 200 within 2s (LS timeout: 10s).
- `GET /revoked.json` — public, cached at the edge (1h) and in R2 (24h). Served from a static R2 object; no DB hit.
- `POST /admin/revoke` — `Authorization: Bearer $ADMIN_TOKEN`. Body `{ key_id, reason }`. For manual cases.
- `POST /admin/issue` — `Authorization: Bearer $ADMIN_TOKEN`. Body `{ email, tier, note }`. Issues a free key (beta testers, support make-goods, press). Bypasses LS but still writes a D1 row with a synthetic `order_id` (`manual-<uuid>`) so revocation works identically.
- `GET /resend-key` — static form handler. `{ email, order_id }` → D1 lookup → re-email. Rate-limited 3/hour/IP via Cloudflare Workers RateLimit API.

### Revocation list rebuild

Cron trigger every 30 minutes:
1. `SELECT key_id FROM licenses WHERE revoked_at IS NOT NULL`.
2. Build JSON: `{ key_ids: [...], signed_at: <unix>, signature: "<b64 Ed25519>" }`.
3. Write to R2 public bucket as `revoked.json`.
4. Invalidate Cloudflare edge cache.

### Observability

- Workers logs (24h free tier).
- Uptime ping to `GET /health` from Better Stack (free tier).
- Resend dashboard for email delivery.
- Lemon Squeezy dashboard for purchase metrics.
- No Sentry, Datadog, or PagerDuty at launch.

### Cost model

| Service | Free tier | Pay threshold |
|:---|:---|:---|
| Cloudflare Workers | 100K req/day | >3M req/mo = $5/mo |
| Cloudflare D1 | 5M reads + 100K writes/day | Never at our scale |
| Cloudflare R2 | 10 GB + 1M Class A ops/mo | Never at our scale |
| Resend | 3K emails/mo | >3K orders/mo = $20/mo |
| Lemon Squeezy | 5% + $0.50 per sale | Variable, no fixed |
| **Fixed infra at launch** | **$0/month** | |

At $49/license with 5% LS fee ≈ $45.50 net per sale.

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

Pricing is edited in the Lemon Squeezy dashboard. The in-Studio Upgrade modal fetches the current price from a static `https://remex.app/pricing.json`, with an inlined fallback for the offline case. One file to edit to change prices everywhere.

## Communication plan

v1.3.0 release announcement posts in three places, all saying the same thing:
1. **GitHub release notes** — top section "Remex is now commercial — here's what that means for you."
2. **CHANGELOG.md** — normal entry plus a `Note: Studio license changed` line pointing to `LICENSES.md`.
3. **`remex.app/blog/going-commercial`** — short blog post on Cloudflare Pages. Honest "solo dev, this is how I make the math work" framing. Ends with the founders price.

Explicitly avoided: corporate-speak ("we're going premium 🚀"), urgency countdowns, "only N licenses left" scarcity tactics. The audience is indie-savvy; those patterns repel them.

## Rollout phases

1. **Phase 0 — pre-launch (2–3 weeks).** Build license server and Studio license layer in a `feat/pro` branch. Six Pro features behind a dev-time `VITE_FORCE_PRO=true` flag.
2. **Phase 1 — internal dogfood (1 week).** Deploy license server to production against a test LS store. Wire test license keys to your own Studio build. Use Remex Pro personally; fix what chafes.
3. **Phase 2 — closed beta (2 weeks).** Announce in a GitHub Discussion. Issue 20–50 free Pro keys to volunteers via `/admin/issue`. Iterate on activation flow and Upgrade modal copy. Run one real test refund end-to-end.
4. **Phase 3 — public launch (v1.3.0).** Flip LS store to production prices. Merge `feat/pro` → `main`. Tag `v1.3.0`. Publish blog post, update README. Post once to HN, r/LocalLLaMA, r/ObsidianMD. Watch 48 hours for bugs.
5. **Phase 4 — post-launch (ongoing).** Conversion metrics only at the LS level — no in-app analytics. Weekly solo retro. Raise price from $39 → $49 at the 200-sale or 90-day trigger.

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

- **License server:** Vitest with `@cloudflare/vitest-pool-workers`. Fixtures for LS webhook payloads (`order_created`, `order_refunded`, invalid HMAC, duplicate `order_id`). Ed25519 signing round-trip test. Revocation list build test.
- **Studio license layer:** Rust unit tests in `license.rs` — valid key verifies, invalid prefix rejected, bad signature rejected, expired key rejected, malformed input rejected. Tauri command integration tests in `tauri-driver`.
- **Frontend gating:** Vitest + Testing Library. Render each Pattern-B feature with `isPro=false` and assert locked state; `isPro=true` and assert unlocked. Upgrade modal opens on locked-click.
- **End-to-end activation:** manual for the first release. Automated only if ops pain emerges.

## Open questions (resolved during brainstorming, recorded here for future-me)

- **Do we want a time-limited Pro trial?** No. The free tier serves that role.
- **Do we want per-seat team licensing at launch?** No. Manual 20% bulk discount on request via LS coupon.
- **Do we want in-app analytics for funnel tracking?** No. Conversion metrics come from the LS dashboard only.
- **Do we support hardware-bound licenses?** No. One key works on every machine the purchaser owns.
- **Do we keep a staging environment?** Not at launch. Local dev against a test LS store is enough.

## Appendix — prior art this design draws from

- **Obsidian:** fully-functional free, paid addons (Sync, Publish) for genuine cloud-cost services.
- **Sublime Text:** perpetual license with major-version upgrade fee, offline key verification.
- **1Password 7 (pre-8):** split perpetual + subscription. We deliberately revived this pattern.
- **Sentry:** FSL-1.1-MIT source-available license as the solo-dev-to-sustainable-business precedent.
- **Tailscale:** low-friction checkout, silent background checks, no in-app telemetry. The bar.
