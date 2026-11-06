# Relay Mail

A self-hosted webmail client for Stalwart Mail Server. It talks to the server
over JMAP and puts mail, calendar, contacts and files behind one login, with one
set of settings and one admin dashboard.

This directory is one of three subprojects in the [monorepo](../README.md); the
deployment guide is [DEPLOY.md](../DEPLOY.md) and the decisions behind the fork
are in [ROADMAP.md](../ROADMAP.md).

## Running it

In the monorepo the client is the `webmail` service of the root
`docker-compose.yml`, which pulls `ghcr.io/devfazla/relay-webmail:main`. To run
it on its own:

```bash
docker compose up -d --build      # this directory
open http://localhost:3000
```

A setup wizard asks for your Stalwart server and an admin password on first
launch. Configuration is environment variables or the admin dashboard; when
both set the same key, the admin value wins and the environment only fills in
what is unset. [`.env.example`](.env.example) documents every variable,
including the ones this deployment pins:

| Variable | Why it is set here |
|---|---|
| `JMAP_SERVER_URL` | The mail server the browser talks to. Must be its public URL, and Stalwart must allow this origin under Settings → HTTP → CORS allowed origins. |
| `NO_THIRD_PARTY_TRAFFIC` | `true`. Fences telemetry, the update check, the push relay, the extension directory and the icon/translation proxies. Pinned in the environment it cannot be re-opened from the admin panel. |
| `BULWARK_TELEMETRY` | `off`. Locks the heartbeat and hides the admin toggle. |
| `BULWARK_UPDATE_CHECK` | `off`. No version probe, no "update available" banner. |
| `SESSION_SECRET` | Deliberately unset: the app generates one on first boot and keeps it in the `relay-admin-state` volume, so no secret sits in the repo. |
| `ADMIN_PASSWORD` | Unset means the webmail's own `/admin` login is disabled; a Stalwart admin account can still reach it. |

## Development

```bash
npm install
cp .env.example .env.local       # or .env.dev.example for the mock JMAP server
npm run dev
```

```bash
npm run typecheck
npm run lint
npx vitest run                   # unit tests
npm run test:integration         # Stalwart in Docker + Playwright
```

The stack is Next.js and React 19, TypeScript, Tailwind CSS v4, Zustand, Tiptap,
next-intl and Tabler Icons, with a JMAP client (RFC 8620) written in this repo.
Tests run on Vitest and Playwright.

## What this fork changed

- Product name and artwork: the client presents itself as **Relay Mail**, with
  its own favicon, logos and PWA icons under `public/branding/`.
- No promotional surfaces: the upstream banner, badges, Discord and live-demo
  links, and the star count on the login page are gone.
- No call-home: the defaults above keep every built-in third-party host
  unreachable, and the push relay has no built-in address.
- Vendored without upstream git history. File-level SPDX headers, `LICENSE` and
  `NOTICE` are unchanged.

## License

[GNU AGPL v3 only](LICENSE), with an additional permission to distribute apps
built from this code through app stores. The permission is provisional until
every earlier contributor has agreed to it; contributions made since 30
September 2026 are already covered. [NOTICE](NOTICE) preserves the original MIT
attribution for the fork lineage.

## Acknowledgments

Based on [root-fr/jmap-webmail](https://github.com/root-fr/jmap-webmail/) by
[@ma2t](https://github.com/ma2t), and on the Bulwark Webmail project it was
forked from.
