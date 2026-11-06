# Monorepo

| Path | What it is | Vendored from |
|---|---|---|
| `server/` | Stalwart mail & collaboration server (Rust workspace, v1.0.2) | [stalwartlabs/stalwart](https://github.com/stalwartlabs/stalwart) |
| `webui/` | Stalwart WebUI — admin `/admin` + portal `/account` SPA (v2.0.4) | [stalwartlabs/webui](https://github.com/stalwartlabs/webui) |
| `webmail/` | Bulwark webmail, a Next.js JMAP mail client (v1.20.0) | [bulwarkmail/webmail](https://github.com/bulwarkmail/webmail) |

All three are vendored with no upstream git history: this repo is the only remote,
and the CI at `.github/workflows/` builds every image. Upstream file-level
copyright headers and each project's `LICENSES/` or `LICENSE` are kept as-is.

## Deploying

Docker configuration lives at the repo root: `Dockerfile` (single image with the
server + WebUI bundled from `webui/`), `docker-compose.yml` (Coolify resource),
and a step-by-step guide in [DEPLOY.md](DEPLOY.md).

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

`webmail/` is a standalone Next.js app; it talks to the server over JMAP and
registers as an OAuth client. It builds into its own image, not the server's:

```sh
cd webmail
npm ci && npm run build     # local dev against a running server
docker build -t relay-webmail .   # production image
```
