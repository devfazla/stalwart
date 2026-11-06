# Roadmap: three-project monorepo, rebrand, and API

Status doc for the work requested on 2026-11-07. Update the progress table as items land.

## Goal

The repo currently vendors two upstreams (`server/` Stalwart v1.0.2, `webui/` Stalwart WebUI v2.0.4).
Target is three vendored projects with no runtime dependency on any third party, rebranded to our
own name, promotional and ownership UI stripped, and a working mailbox-management API on
`admin.shopstatesideglobal.com`.

---

## Read this first: licensing

This is not a formality, it decides what is possible.

`server/` and `webui/` are dual-licensed `AGPL-3.0-only OR LicenseRef-SEL`. We operate under the
AGPL branch. `LicenseRef-SEL` is the Stalwart Enterprise License 2.0, a paid subscription whose key
is bound to a domain plus all its subdomains (SELv2 1.5).

What AGPL does allow us, and what we will do:

- modify everything, rebrand it, and ship our own build
- remove marketing UI: upsell dialogs, donation and sponsor prompts, "powered by" branding
- keep our own commit authorship, which is already done

What AGPL requires us to keep, so we will not touch it:

- `LICENSES/` directories in both projects, including `AGPL-3.0-only.txt` and `LicenseRef-SEL.txt`
- file-level `SPDX-FileCopyrightText` and `SPDX-License-Identifier` headers
- complete corresponding source published under AGPL to anyone who interacts with the service over
  the network (AGPL 13). Publishing our modifications to this repo satisfies this.

The hard limit, and the answer to "can we unlock the locked features":

- Enterprise features are gated by `#[cfg(feature = "enterprise")]` across 151 Rust files. The code
  is **not in this repository at all**. It is not a flag to flip, there is nothing to unlock.
- The WebUI lock is a display layer over that: `isEnterpriseLockedIn()` returns true when the field
  is marked `enterprise` and the server reports community edition
  (`webui/src/components/forms/formContext.ts:49`). The menu lock is the same story, driven by
  `enterprise` flags in the schema the server emits (`webui/src/lib/layout.ts:73`).
- Removing a license gate to use SEL-licensed functionality without a subscription is not something
  we will do, and technically it would not work anyway because the backend is absent.

Two legitimate routes, and we will use both:

1. **Reimplement.** Writing our own version of a feature is fully permitted. AGPL protects code, not
   ideas. Where the community build already exposes the data, this is cheap. The dashboard is the
   clearest example: `/api/live/metrics` exists in the community build
   (`server/crates/http/src/api/mod.rs:333`), so a dashboard is feasible without any enterprise code.
2. **Hide.** Where a feature needs absent enterprise backend, we remove the menu entry and the upsell
   instead of leaving a locked dead end. This is the fallback for anything too expensive to build.

`SPDX-SnippetBegin` / `SPDX-SnippetEnd` blocks marked `LicenseRef-SEL` sit inside otherwise-AGPL
files, 5 files in `webui/src` plus more in `server/`. Anything we want to keep and build on should
not depend on those snippets. Treat them as remove-or-replace, not as ours to use.

---

## Workstream A: vendor Bulwark as `webmail/`

Bulwark (github.com/bulwarkmail/webmail) is a JMAP webmail client for Stalwart, TypeScript, AGPL-3.0,
1.4k stars, active. Two editions: full (Node.js server, port 3000, admin dashboard, OAuth, plugins)
and Lite (same client as static files, servable by Stalwart itself).

Decisions inside this workstream:

- **Lite or full.** Lite fits the existing model: build to static, bundle into the image like
  `webui.zip` is bundled today, no new container. Full adds a second service to
  `docker-compose.yml`, a Node runtime, and its own state.
- Import with a squashed initial commit, then rewrite authorship, same as the `gitikram` cleanup.
  File-level copyright headers stay.
- Verify Bulwark's actual `LICENSE` file before importing. The badge says AGPL v3 with app store
  distribution permissions, which needs reading rather than assuming.

## Workstream B: admin UI rebrand and strip

- Replace the product name and logo throughout `webui/src`, plus the `Stalwart` wordmark in the
  login, bootstrap wizard, and page titles.
- Remove `EnterpriseUpsell` (`webui/src/components/layout/TopBar.tsx:108`) and every other
  promotional surface: donation, sponsor, forum, blog, and "buy" links.
- Strip the ownership and contact claims in `server/AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  and the CNAME, or delete those files if they serve no purpose for us.
- For each locked field, decide hide versus reimplement. Nothing gets unlocked.

## Workstream C: webmail rebrand

Same treatment as B once Bulwark is vendored. Needs its own audit of promotional strings, external
links, telemetry beacons, and update-check endpoints before it is safe to ship under our name. Any
call home gets disabled.

## Workstream D: mailbox API on admin.shopstatesideglobal.com

Goal: create, edit, delete mailboxes programmatically.

Open items, all of which need evidence rather than assumption:

- Confirm the exact principal and directory routes the community build exposes, and their methods.
- Auth model. The UI uses OAuth; a server-to-server client needs a token flow that does not depend
  on a browser. Needs verifying, not guessing.
- A new subdomain means DNS, a Coolify domain assignment, and OAuth redirect-origin registration for
  `admin.shopstatesideglobal.com`. The CIMD `sameDomain` policy we patched only accepts the document
  published on the server's own registrable domain, so a second hostname needs checking against it.
- CORS and `X-Forwarded-Proto` behavior on the new hostname. The proto patch already landed.
- A smoke-test script that exercises create, read, update, delete against a throwaway account.

---

## Decisions

- **Brand name: `Relay`.** Replaces `Stalwart` in the admin panel, webmail, page titles, container
  image and compose service name. `shopstatesideglobal.com` remains the domain; `mail.` stays the
  server hostname, `admin.` becomes the API and panel host.
- **Bulwark full edition.** A Node.js service, so `webmail/` is vendored source plus a second
  compose service on port 3000, not a static bundle like `webui.zip`. This adds a container, its own
  persistent state, and a second image build to CI.

Naming scope to keep consistent: image `ghcr.io/devfazla/relay`, compose services `relay-server`,
`relay-webmail`, volumes `relay-config` / `relay-data`.

---

## Conflict analysis: adding webmail beside the live server

Audited `webmail/docker-compose.yml` and `webmail/.env.example` against the running deployment on
2026-11-07. Ordered by how badly each would hurt the existing server and its data.

1. **Do not add this as a second Coolify resource.** If another resource points at the same
   `./docker-compose.yml`, Coolify deploys the file twice. A second container would publish
   25/465/993/995/4190 against the live one, and a second container would mount `stalwart-config`
   and `stalwart-data`. Two RocksDB writers on one volume is data loss. Correct shape is one compose
   file, one Coolify resource, two services inside it.
2. **`env_file: .env.local`** is referenced but not committed. Coolify's compose deploy fails on a
   missing env_file. Drop it, supply config through Coolify environment variables.
3. **`ports: "3000:3000"`** publishes to the host, bypassing the Coolify proxy and exposing plain
   HTTP publicly. Use `expose: ["3000"]` plus a Coolify domain, matching the `8080` pattern already
   used for the server.
4. **`image: ghcr.io/bulwarkmail/webmail:latest`** is a runtime dependency on their registry, and
   `:latest` lets upstream push changes into production unnoticed. Build from `webmail/` in our CI
   and reference our own image.
5. **`JMAP_SERVER_URL` is the riskiest integration point.** Their own comment states the webmail
   server validates every sign-in against this URL from inside the container, so it must resolve and
   be trusted from there, not just from the browser. Pointing it at the public hostname needs hairpin
   routing through the proxy plus valid TLS. The internal route `http://stalwart:8080` is cleaner
   because both services share the compose network, but it needs `OAUTH_ALLOW_PRIVATE_ENDPOINTS=true`
   and verification that Stalwart's advertised OAuth URLs still match. Test before switching over.
6. **Telemetry and update-check are call-home.** `bulwark-telemetry` holds an instance id, consent
   state and login HMACs; `bulwark-version-check` stores the last update check. Disable both and drop
   those two volumes under our branding.
7. **`SESSION_SECRET`** is required for server-side settings persistence. Generate a fresh 32+ char
   secret and keep it in Coolify secrets, not the repo.
8. **`ALLOW_CUSTOM_JMAP_ENDPOINT`** must stay unset or false, otherwise the login form lets any user
   point the client at an arbitrary server.
9. **Volume names** `bulwark-*` collide with nothing, since Coolify prefixes per project, but they
   carry the old brand. Rename to `relay-*`.
10. **`HOSTNAME=0.0.0.0`** in their compose is scoped to the webmail service and does not clash with
    the server's `STALWART_HOSTNAME`.
11. **OAuth client** must be registered in Stalwart for the webmail. This is additive, it does not
    modify existing config. The `sameDomain` CIMD policy we patched accepts the registrable domain,
    so `webmail.shopstatesideglobal.com` should be accepted alongside `mail.`; confirm rather than
    assume.

Ordering consequence: the compose change must wait until CI actually builds the webmail image,
otherwise a deploy fails on a missing image and the server is left running the old release.

## Progress

| ID | Item | Status |
|---|---|---|
| A1 | Verify Bulwark license terms | done: AGPL-3.0-only, keep LICENSE and NOTICE |
| A2 | Choose Lite vs full edition | decided: full |
| A3 | Import `webmail/` with clean history | done: vendored, no `.git`, README row, CI job |
| A4 | Add webmail service to root `docker-compose.yml` | blocked by A3 CI run: image must exist first |
| B1 | Brand name chosen | decided: Relay |
| B2 | Strip upsell and promotional UI | not started |
| B3 | Rename product and logo | blocked by B1 |
| B4 | Audit locked fields, hide or plan reimplementation | not started |
| B5 | Dashboard, reimplement on `/api/live/metrics` | not started |
| C1 | Webmail promotional and call-home audit | blocked by A3 |
| C2 | Webmail rename and restyle | blocked by A3, B1 |
| D1 | Enumerate mailbox CRUD routes with evidence | not started |
| D2 | Non-interactive auth for API client | not started |
| D3 | DNS plus Coolify domain for admin subdomain | not started |
| D4 | API smoke test | blocked by D1, D2 |

## Log
- 2026-11-07: `webmail/` vendored. Upstream `.git` (19 MiB of history) and `.github/`
  (10 workflows pointing at `bulwarkmail` runners, secrets and GHCR) deleted; `LICENSE`,
  `NOTICE` and all file-level headers kept. 4281 files staged, no `node_modules` or build
  output. Root README gains the third project row plus a build section. New CI
  `.github/workflows/docker-image-webmail.yml` builds `ghcr.io/devfazla/relay-webmail`
  multi-arch from the `./webmail` context, same digest-merge shape as the server image, and
  only triggers on `webmail/**` so a server-only push does not pay for a Next.js build.
  `webmail/docker-compose.yml` is left in place as reference and is NOT what Coolify deploys;
  the root compose file stays single-service until the image exists.

- 2026-11-07: Licensing constraints established with file and line evidence. Locked enterprise
  features confirmed absent from source, so unlock is off the table and reimplement-or-hide is the
  plan. `/api/live/metrics` confirmed present in the community build, so the dashboard is feasible.
- 2026-11-07: Brand name fixed as **Relay**, Bulwark **full edition** chosen.
- 2026-11-07: Bulwark license read from source. It is `AGPL-3.0-only` with one additional permission
  for app store distribution, which does not apply to us. No dual license, no proprietary snippets,
  no enterprise gating. Cleaner than Stalwart to work with.

### Constraint that limits the "no traces" goal

Bulwark's own `NOTICE` file discloses that it is a fork of `root-fr/jmap-webmail`, MIT-licensed
material in its lineage. Both `LICENSE` and `NOTICE` must be preserved when we redistribute, so
Bulwark's ancestry stays visible in the repo no matter what we do to commit metadata. Same for
Stalwart: file-level SPDX headers naming Stalwart Labs LLC are a license condition, not branding.

What we can legitimately scrub is commit authorship, remote URLs, marketing copy, upsell UI, and
promotional links. That is already how the `gitikram` cleanup worked and it is the boundary here.
