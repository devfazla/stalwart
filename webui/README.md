# Relay admin panel

A schema-driven single-page app. After sign-in it fetches `/api/schema` from the server and
generates every form, list, navigation entry and layout from that schema, so object types,
field names and permissions are not hardcoded here. All data operations (queries, creates,
updates, deletes, blob uploads) are JMAP per RFC 8620, with method chaining and result
references. Every control respects the signed-in principal's permissions; anything the user
cannot act on is hidden rather than disabled.

This is the vendored source of Stalwart WebUI v2.0.4, rebranded to Relay. What was renamed and
what deliberately was not is in [../README.md](../README.md).

One build serves both surfaces the binary exposes: `/admin` for the console and `/account` for
the self-service portal.

## What is different from upstream

- **Overview replaces Dashboard.** Upstream's live charts read `/api/live/metrics` and
  `/api/live/tracing`, which are enterprise-gated: the routes are inside a `LicenseRef-SEL`
  snippet (`server/crates/http/src/api/mod.rs:326-345`) and answer nothing in a community
  build. `src/features/overview/` is a new page built on `/api/metrics/prometheus`, the text
  export the community edition does serve, with rates computed from successive scrapes.
- **Enterprise-locked UI is hidden centrally**, from the `enterprise` flags the server puts in
  its schema (`src/lib/layout.ts`), rather than patched screen by screen. The upsell dialog and
  the donation, sponsor, forum and blog links are gone.
- Nothing was unlocked. The gated backend is not in this repository, so there is no flag to
  flip; hiding or reimplementing was the only legal and technical option.

## Development

Prerequisites: Node.js 22 (what the image build uses) and a running server for the API calls.

```sh
npm ci
npm run dev          # Vite with HMR, http://localhost:5173
```

Configuration is through Vite environment variables in `.env.development`:

```
VITE_API_BASE_URL=http://localhost:443
VITE_ACCESS_TOKEN=
VITE_OAUTH_SCOPES=
```

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | URL of the server, used for all API requests during development. Empty or unset in production builds, where requests are relative to the current origin. |
| `VITE_ACCESS_TOKEN` | When set, skips the OAuth flow entirely and uses this token for every request. The quickest way to work on an authenticated screen; a bearer token or an API key both work. |
| `VITE_OAUTH_SCOPES` | Optional OAuth scopes. Omitted from the authorization request when empty. |

The OAuth client ID is not a build-time setting. It is read at runtime from a meta tag in
`index.html`:

```html
<meta name="oauth-client-id" content="" />
```

The server rewrites the `content` attribute when it serves the page, so one build works for any
deployment. When no client ID is configured the attribute is left empty and the panel falls back
to the `stalwart-webui` client.

## Building

```sh
npm run build        # tsc -b then vite build, output in dist/
npm run typecheck    # tsc -p tsconfig.app.json --noEmit
npm run lint
npm run format       # prettier --write src/
./build.sh           # npm ci + vite build, zips dist/ into .ignore/webui.zip
npm run preview      # serve the production build locally
```

`build.sh` produces the artifact the server reads. Locally that needs no configuration: the
server's `dev_mode` default points at `../webui/.ignore/webui.zip`. In a non-dev install, set
the `Application` object's `resource_url` to that `file://` URL.

The root `Dockerfile` does the equivalent for images. It builds this directory, zips `dist/`,
copies the bundle to `/opt/stalwart/webui.zip`, and rewrites the server's compiled default
`resource_url` to that path in a build step that fails if the string it targets ever moves. A
container therefore never downloads an interface from anywhere.

## Tests

Upstream maintains its unit and end-to-end tests in a separate repository and they are not
vendored here. In this fork the checks are `npm run typecheck`, `npm run lint` and the image
build. The Overview page is written against the Prometheus text format, so verifying a change
there means reading a real `/api/metrics/prometheus` response, and that endpoint answers 404
until the exporter is enabled under Settings then Metrics.

## License

Dual-licensed `AGPL-3.0-only OR LicenseRef-SEL`, full text in [LICENSES/](LICENSES/). We operate
under the AGPL branch; the proprietary branch covers features whose code is not in this
repository.

Each file carries an `SPDX-FileCopyrightText` and `SPDX-License-Identifier` header following the
[REUSE](https://reuse.software/) conventions. Those headers, and the `LICENSES/` directory, are
license conditions rather than branding, so they are kept unchanged: copyright in the code stays
with its authors, including Stalwart Labs LLC.
