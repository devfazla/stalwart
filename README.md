# Monorepo

Three projects, one repo, one deployment. Upstream names are kept in the table
below because they are provenance, not branding.

| Path | What it is | Vendored from |
|---|---|---|
| `server/` | Stalwart mail & collaboration server (Rust workspace, v1.0.2) | [stalwartlabs/stalwart](https://github.com/stalwartlabs/stalwart) |
| `webui/` | admin `/admin` + portal `/account` SPA (v2.0.4) | [stalwartlabs/webui](https://github.com/stalwartlabs/webui) |
| `webmail/` | Relay Mail, a Next.js JMAP mail client (v1.20.0) | [bulwarkmail/webmail](https://github.com/bulwarkmail/webmail) |

All three are vendored with no upstream git history: this repo is the only remote,
and the CI at `.github/workflows/` builds every image. Upstream file-level
copyright headers and each project's `LICENSES/` or `LICENSE` are kept as-is.

## What we ship as

The product is called **Relay**. `Stalwart` and `Bulwark` are replaced in
everything a user sees: page titles, protocol greetings and capability strings,
`Received:` headers, image labels, and the admin and webmail UIs.

What is deliberately **not** renamed, because it would break interoperability or
existing data rather than remove a brand:

- protocol and media tokens: `urn:stalwart:*`, `vnd.stalwart.*`, JMAP capability URIs
- the `sat_` prefix on API keys, and the `stalwart_*` metric names Prometheus exports
- storage and settings keys, log lines, and the `stalwart` CLI name in help output
- `LICENSES/`, `NOTICE`, and file-level SPDX headers, which are license conditions
- upstream documentation URLs left in code comments

`ROADMAP.md` carries the reasoning and the evidence for each of these calls.

Policy files are ours now, not upstream's: [server/SECURITY.md](server/SECURITY.md) is where
vulnerabilities go (a private GitHub advisory on this repo), and each project has a
`README.md` describing its own build. The upstream issue, PR and discussion templates, the
contributor allow-list, the auto-close bots and the AI-agent instructions that were vendored
with `server/` have been deleted.

## Deploying

Docker configuration lives at the repo root: `docker-compose.yml` is one Coolify
resource with two services, and [DEPLOY.md](DEPLOY.md) is the step-by-step guide.

| Service | Image | Built from |
|---|---|---|
| `stalwart` | `ghcr.io/devfazla/stalwart:main` | `Dockerfile`: server + WebUI bundled into one image |
| `webmail` | `ghcr.io/devfazla/relay-webmail:main` | `webmail/Dockerfile`: Next.js standalone output |

Each image has its own path-filtered CI job, so a commit that only touches
`webmail/` never rebuilds the server, and vice versa. Both are multi-arch
(amd64 + arm64), built natively per architecture rather than emulated.

The two services share no volume and webmail publishes no host port, so starting
or restarting the client cannot disturb the mail server's data.

## WebUI build & wiring

The server downloads its web UI at runtime by default. In this layout, the server's
`dev_mode` default points at `file://../webui/.ignore/webui.zip`, so a local build
resolves with no configuration change:

```sh
cd webui
./build.sh        # npm ci + vite build, zips dist/ -> .ignore/webui.zip
```

To serve a local build in a non-dev setup, set the `Application` object's
`resource_url` to a `file://` URL pointing at `webui/.ignore/webui.zip`.

`server/` and `webui/` are dual-licensed AGPL-3.0 / Stalwart Enterprise License.
See `server/LICENSES/` and `webui/LICENSES/`. `webmail/` is AGPL-3.0-only with no
enterprise tier; its own `LICENSE` and `NOTICE` apply. See [ROADMAP.md](ROADMAP.md)
for what each license does and does not allow when you rebrand or extend a fork.

## Webmail build & wiring

`webmail/` is a standalone Next.js app. The browser talks JMAP to the mail server
directly, the webmail container does not proxy it, so Stalwart must send CORS
headers on `/jmap`. The switch is the `Http.usePermissiveCors` boolean, not an
origin list (see [DEPLOY.md](DEPLOY.md) step 10), and `JMAP_SERVER_URL` must be
that same public URL.

```sh
cd webmail
cp .env.example .env.local   # set JMAP_SERVER_URL, SESSION_SECRET, ADMIN_PASSWORD
npm ci && npm run dev        # local dev against a running server
npx vitest run               # unit suite (there is no aggregate `test` script)
```

Production builds, with the commit SHA that Settings → About reports (`.dockerignore`
excludes `.git`, so the image cannot find it on its own):

```sh
GIT_COMMIT=$(git rev-parse HEAD) docker compose build webmail
```

Two things are pinned in the deployment environment and worth knowing before you
change them: `NO_THIRD_PARTY_TRAFFIC=true` fences every built-in outbound host
(telemetry, update check, push relay, extension directory, icon and translation
proxies), and an env value there cannot be switched off from the admin panel.
Those hosts are still the compiled defaults in `webmail/`: the fence, not an
empty constant, is what keeps a Relay install from reaching them, so a deployment
that drops the variable reaches them again. The guarded test suite is the reason
we did not rewrite the defaults, and `webmail/lib/admin/outgoing-hosts-registry.ts`
is the list of what each switch turns off.
`SESSION_SECRET` is left unset on purpose: the app generates one on first boot and
keeps it in the `relay-admin-state` volume, so no secret sits in the repo.

## API

Mailbox management is JMAP, not REST. [docs/API.md](docs/API.md) documents the
authentication methods, the `Account` object, the request shape, how partial
failures are reported, and the pre-flight server settings a script depends on.
`scripts/api-smoke.sh` exercises create, read, update, delete and destroy against
a throwaway account.
