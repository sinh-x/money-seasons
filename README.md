# Money Seasons

**Lịch tài chính gia đình · Biết trước những tháng cần nhiều tiền.**

A Vietnamese/VND interactive mockup for reviewing an annual personal/family finance flow. Runs on this machine with a small Node server or Docker Compose. **Accepted by Sinh as a starting foundation, not a finished finance product.**

## Run locally

### Docker (recommended)

```sh
docker compose up -d --build --wait
```

Open **http://localhost:3080**. The published port is bound to this machine's loopback interface, not the LAN or internet.

```sh
docker compose ps                   # health and port
docker compose logs --tail=50 web   # server logs
docker compose down                # stop
```

If 3080 is occupied:

```sh
MONEY_SEASONS_PORT=3081 docker compose up -d --build --wait
```

Use a consistent URL: `localhost:3080`, `127.0.0.1:3080`, and another port have **separate browser storage**. Docker has no finance-data volume; restarting/rebuilding the container does not erase browser data. Export a copy before changing origins.

### Node (22+)

No install or build step is needed to run the app:

```sh
npm start
# or npm run dev
```

Defaults to `127.0.0.1:3080`. Optional environment variables: `HOST`, `PORT`. Do not run Node and Docker on the same port.

## Try the flow

1. Explore the clearly labelled **synthetic sample year**; no sign-in or household setup.
2. Open **tháng 4** to see why its projected balance is negative; **tháng 9** has the largest known outflow.
3. Toggle **Tính cả khoản đang cân nhắc** to include the summer trip in July.
4. Add/edit a one-off or monthly item; a blank amount stays **unknown**, not zero.
5. Open a month and **Ghi thực tế**. The actual replaces that month's planned amount, not both added together.
6. Reload, export, and try importing the copy. Replacement and deletion require explicit confirmation.
7. Choose **Bắt đầu kế hoạch riêng** for short setup and a blank plan. This explicitly replaces the open sample/plan.

The in-app **Về bản thử nghiệm** explains the temporary rules, privacy limits, and sample reset. See [mockup notes and review checklist](docs/mockup.md) for assumptions, the worked synthetic year, verification, and follow-up decisions.

## Data and boundaries

- One plan, Vietnamese interface, whole VND, January–December; no mid-year opening date yet.
- Versioned browser `localStorage` plus JSON export/import. **Not encrypted, synced, or automatically backed up.** Browser clearing, private mode, device loss, or a shared profile can expose or lose data. Export files are also unencrypted.
- The server serves assets and `/healthz` only. It does not receive or store plan payloads. No external fonts, analytics, financial integrations, or runtime package dependencies.
- Approximate month-end cash estimates, **not exact-day cash-safety guarantees or financial advice**. Unknown inputs make the estimate incomplete; non-liquid assets do not become cash.
- Asset/debt inventory, preparation targets, accounting, bank connections, users, and a financial-data API are not implemented.

## Checks

```sh
npm test       # 22 deterministic model/server tests; no install required
npm run check  # JavaScript syntax
```

Optional browser checks, against the running server:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

On systems using an existing browser (including this NixOS machine):

```sh
BROWSER_PATH="$(command -v google-chrome)" npm run test:browser
```

`BASE_URL` overrides the target. Screenshots default to `/tmp/money-seasons-check`; `BROWSER_ARTIFACTS` overrides that directory. The browser runner uses synthetic data in isolated profiles and never opens your normal browser profile. It covers the core flow, storage/import failures, responsive widths and automated accessibility scans. These are **not human acceptance**.

## Files

- `server.mjs` — bounded static HTTP server and health endpoint.
- `public/model.js` — pure monthly calculations, synthetic fixture, version-1 validation.
- `public/app.js`, `public/index.html`, `public/styles.css` — responsive interactive mockup.
- `Dockerfile`, `compose.yaml` — non-root, read-only, health-checked local container.
- `test/`, `scripts/browser-check.mjs` — deterministic and browser checks.
- [Development plan](docs/development-plan.md), [local ticket drafts](docs/tickets.md) — future scope; **no PA tickets created**.

## Planning and discovery

The latest request authorized a mockup plus a local server/Docker foundation **before** agreeing the design/flow and creating further tickets. Vietnamese/VND was explicitly selected for this mockup. This does not approve all MVP finance rules or a production architecture.

Original discovery remains in the sibling learning-management repository:

- [Project overview](../tools/learning-management/projects/money-seasons/README.md)
- [Product brief and idea bank](../tools/learning-management/projects/money-seasons/product-brief.md)
- [Historical roadmap](../tools/learning-management/projects/money-seasons/plan.md)

Those links assume the local workspace layout and do not resolve in an isolated clone. This repository owns the implementation drafts; do not maintain a duplicate backlog there. No remote has been configured.

**Next:** create the requested requirements ticket for Sinh's personal inputs and usage adjustments, including a continuous **November 2026–December 2027** plan. The current implementation remains single-year; this request does not implement the extension or approve every MVP rule. Sinh's foundation acceptance is recorded in [mockup notes](docs/mockup.md#foundation-acceptance), separately from automated verification.
