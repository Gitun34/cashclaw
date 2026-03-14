# Changelog

## [1.2.0] - 2026-03-15

### Added
- **5 New Skills** — Email Outreach ($9-$29), Competitor Analyzer ($19-$49), Landing Page ($15-$39), Data Scraper ($9-$25), Reputation Manager ($19-$49). CashClaw now ships with 12 revenue-generating skills.
- 10 new mission templates for the new skills (basic + pro tiers each).
- Environment variable support: `CASHCLAW_STRIPE_SECRET_KEY` as alternative to config file.
- Corrupted mission file warnings (previously silently skipped).
- Shared version helper (`src/utils/version.js`) for consistent version display.

### Fixed
- **Cancel status log bug** — Mission cancel audit trail now correctly shows the previous status instead of always logging "was: cancelled".
- **Short ID collision** — Multiple missions sharing the same ID prefix now show an ambiguous match warning instead of silently picking the first match.
- **Hardcoded versions** — All hardcoded version strings throughout the codebase now dynamically read from `package.json`.

### Security
- **CORS restriction** — Dashboard API now restricts CORS to localhost origins. Agents and curl still work (no Origin header = no restriction).
- **Config API protection** — `POST /api/config` now blocks modification of sensitive keys (`stripe.secret_key`, `stripe.webhook_secret`).
- **Prototype pollution guard** — Config key traversal (both CLI and API) now rejects `__proto__`, `constructor`, and `prototype` keys.

### Changed
- Default config now includes 10 service types (up from 5).
- Init wizard now offers 10 services for selection.
- Dashboard HTML version updated to v1.2.0 with dynamic version from health API.
- HYRVEai User-Agent header now reads version from package.json.
- Test suite expanded with version, security, and new skill tests.

### Why This Release
CashClaw agents need more ways to earn. Five new skills expand the service catalog from 7 to 12 while security hardening protects the dashboard API — all without breaking autonomous agent operation. Every security change preserves agent bot compatibility.

## [1.1.0] - 2026-03-14

### Added
- **Mission Audit Trail** — Every mission step is now logged with timestamps. What was requested, what was delivered, and the full output trail. No invoice goes out without proof.
- `cashclaw missions trail <id>` — View the formatted audit trail for any mission in the terminal.
- `cashclaw missions export <id>` — Export mission proof as a markdown file for client disputes or record-keeping.
- `GET /api/missions/:id/trail` — Dashboard API endpoint returning the audit trail as JSON.

### Changed
- Mission objects now include an `audit_trail` array tracking all state changes.
- All mission lifecycle functions (create, start, complete, cancel, step update) log trail entries automatically.
- Dashboard health endpoint now reports version `1.1.0`.
- Updated package description to mention audit trails.

### Why This Release
Community feedback was clear: *"Without proof of actual work done, the invoice becomes negotiation."* Mission Audit Trail solves this. Every step is timestamped. Every deliverable is tracked. Dispute resolution and a work proof dashboard are on the roadmap.

## [1.0.2] - 2026-03-10

### Fixed
- CLI minor fixes and dependency updates.

## [1.0.1] - 2026-03-07

### Fixed
- Init wizard improvements and error handling.

## [1.0.0] - 2026-03-01

### Added
- Initial release with 7 built-in skills.
- Stripe payment integration.
- HYRVEai marketplace support.
- Web dashboard on port 3847.
- Mission lifecycle management.
