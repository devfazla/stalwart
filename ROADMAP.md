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
   clearest example: `/api/metrics/prometheus` is served in the community build, so a dashboard is
   feasible without any enterprise code. (An earlier note here claimed `/api/live/metrics` was
   available; it is not, because that route is inside a `LicenseRef-SEL` snippet at
   `server/crates/http/src/api/mod.rs:326-345` and answers nothing unless
   `is_enterprise_edition()` is true. The dashboard was built on the Prometheus exporter instead.)
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
  and the CNAME, or delete those files if they serve no purpose for us. Done, see the log entry;
  `AGENTS.md`, the CNAME and both nested `.github/` trees were deleted outright.
- For each locked field, decide hide versus reimplement. Nothing gets unlocked.

## Workstream C: webmail rebrand

Same treatment as B once Bulwark is vendored. Needs its own audit of promotional strings, external
links, telemetry beacons, and update-check endpoints before it is safe to ship under our name. Any
call home gets disabled.

## Workstream D: mailbox API on admin.shopstatesideglobal.com

Goal: create, edit, delete mailboxes programmatically.

Open items, all of which need evidence rather than assumption:

- Confirm the exact principal and directory routes the community build exposes, and their methods.
  Done in `docs/API.md`, from source.
- Auth model. Done: HTTP Basic with an API key is the non-interactive path; the OAuth code flow
  needs a browser. The discovery document answers 200 on the live server.
- A new subdomain means DNS, a Coolify domain assignment, and OAuth redirect-origin registration for
  `admin.shopstatesideglobal.com`. The CIMD `sameDomain` policy we patched only accepts the document
  published on the server's own registrable domain, so a second hostname needs checking against it.
  Still operator action; `admin.shopstatesideglobal.com/api/schema` did answer 401, which shows the
  API is reachable there.
- CORS and `X-Forwarded-Proto` behavior on the new hostname. The proto patch already landed. CORS
  matters for the webmail origin, not for a same-origin admin panel.
- A smoke-test script that exercises create, read, update, delete against a throwaway account.
  Written as `scripts/api-smoke.sh`; **not yet run**, it needs an API key.
- Enable the Prometheus exporter, or the Overview page stays on its setup note. See the log entry.

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

## Two dependencies still in the build

The goal was no third-party runtime dependency, and the images meet that. These do not, and
both need an operator decision rather than a blind change.

1. **Cargo git dependencies.** `server/Cargo.toml:137-140` pins `hickory-proto`, `hickory-net`,
   `hickory-resolver` and `librocksdb-sys` to `github.com/stalwartlabs/*` on the
   `stalwart/0.26` and `stalwart/0.25` branches, and `server/Cargo.lock` fixes them to
   `f8b92b17fa6c7d09a6959672592106ca1410937b` and `f6169ca36d74c15637f8c6396c34e82aa73d0d47`.
   These are patched forks the server genuinely needs: the DNS resolver carries Stalwart's
   own fixes and the RocksDB binding its build options. Removing the dependency means
   vendoring both trees into this repo, which is roughly a hundred megabytes of C sources for
   the RocksDB one, and it cannot be verified here at all because this machine has no Rust
   toolchain. Done blind it would break the image build, which is the one failure that takes
   the mail server down. Left as it is, with the pins recorded above.
2. **`Application.resource_url` default.** In a non-dev build the compiled default is
   `https://github.com/stalwartlabs/webui/releases/download/v2/webui.zip`
   (`server/crates/common/src/manager/defaults.rs:65-66`), so a fresh install would download
   the interface from upstream. The root `Dockerfile` rewrites that literal to
   `file:///opt/stalwart/webui.zip` and the build fails if the string it targets moves, so
   the shipped image never reaches out. A locally built `cargo build --release` binary still
   has the upstream default; the `dev_mode` feature is what avoids it locally.

## Decisions still owed

- Whether to vendor the two Rust forks above, mirror them under our own org, or accept the
  pinned dependency.
- Whether the eleven `DOCS_URL` help links in the webmail admin organisation sections, which point
  at `bulwarkmail.org/docs`, should point at our own documentation once it exists. They are the
  only in-product help today.

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

## Webmail call-home audit

`lib/admin/third-party-mode.ts:26-28` shows the upstream default is **off**, meaning every built-in
outside host is reachable unless the deployment pins it. So `NO_THIRD_PARTY_TRAFFIC=true` in
`docker-compose.yml` is what closes these, and it cannot be re-opened from the admin panel once set
in the environment (`third-party-mode.ts:9-11`).

| Outbound host | Feature | State in our deploy |
|---|---|---|
| `telemetry.bulwarkmail.org` | instance heartbeat and crash reports | double-closed: `BULWARK_TELEMETRY=off` locks it, and the mode blocks the host anyway |
| `version.telemetry.bulwarkmail.org` | "update available" banner | `BULWARK_UPDATE_CHECK=off` disables the check outright (`lib/version-check/state.ts:79`); the mode refuses it too |
| `notifications.relay.bulwarkmail.org` | web push relay | blocked by the mode, which drops the built-in relay from the list the user can pick (`lib/push-relays.ts`); push works only with a relay an admin adds |
| `extensions.bulwarkmail.org` | admin marketplace directory | blocked by the mode; still the value of `OFFICIAL_DIRECTORY` (`lib/admin/directory-keys.ts:19`) because that string also validates signed plugin statements, and inventing our own would break verification without a directory we run |
| `connector.bulwarkmail.org` | connector docs and extension links | blocked by the mode |
| `icons.duckduckgo.com` | sender favicon fallback | blocked by the mode |
| `api.mymemory.translated.net` | message translation | blocked by the mode; point `LIBRETRANSLATE_URL` at our own instance to re-enable |
| `www.google.com` | map link on a calendar event | blocked by the mode |
| `randomuser.me`, `img.freepik.com` | demo mode fixtures | unreachable: `DEMO_MODE` is unset |
| `bulwarkmail.org` | docs links in admin sections | left as text. Dead links are a honesty problem, not a privacy one; rewriting them to our own domain would point at pages that do not exist |

The two volume names that used to back these (`relay-telemetry`, `relay-version-check`) are kept
mounted but stay empty: the app writes consent state and the last check result there, and dropping
the mounts would make the container fail on a read-only filesystem instead of simply having nothing
to say.

## What still reads "Bulwark", and why

Display text is all Relay. What is left is load-bearing, in the same category as the
`urn:stalwart:*` tokens on the server side:

- **HTTP header names** `X-Bulwark-Policy-Scope`, `X-Bulwark-Policy-Domains`,
  `X-Bulwark-Label`, `x-bulwark-reload-probe`: request/response wire fields whose peers
  are not all in this repo.
- **Service Worker storage keys and cache prefixes** in `public/sw.js`
  (`bulwark-shell-*`, `bulwark-sw-state-v1`, `/__bulwark/*`, `bulwark-mail:` notification
  tags). These persist in every user's browser; renaming orphans the old entries instead of
  migrating them. The one header rename that was safe, `X-Bulwark-Build` → `X-Relay-Build`,
  was made because the emitter and its only reader are both in this repo.
- **Method and type names** (`getBulwarkMetadata`, `BulwarkDesktopBridge`, `isBulwarkRule`)
  and the JMAP metadata extension they map onto.
- **Windows/macOS policy identifiers** in `desktop-policies/` and
  `lib/desktop/policy-templates.ts` (`Software\Policies\Bulwark\Desktop`, ADMX category
  names). The user-visible `displayName` in those files is already "Relay".
- **Env var names** `BULWARK_TELEMETRY`, `BULWARK_UPDATE_CHECK`, `BULWARK_BASE_PATH` and the
  rest, because operators, docs and CI already speak them.
- **`extensions.bulwarkmail.org`** as a signed-statement type URI (`lib/admin/directory-keys.ts`).
  It is a verification identifier, not a link we ask anyone to visit.

**Help links kept deliberately.** Eleven admin sections and the monitoring page carry a
`DOCS_URL` pointing at upstream documentation, rendered as inline text like "How labels work".
These are functional references to the only documentation that describes the features we ship;
deleting them would leave the admin UI with no reference at all, and pointing them at our repo
would 404 because we have not written those pages. They are not promotional surfaces and render
no upstream branding. Revisit if we ever write our own docs.

## Progress

| ID | Item | Status |
|---|---|---|
| A1 | Verify Bulwark license terms | done: AGPL-3.0-only, keep LICENSE and NOTICE |
| A2 | Choose Lite vs full edition | decided: full |
| A3 | Import `webmail/` with clean history | done: vendored, no `.git`, README row, CI job |
| A4 | Add webmail service to root `docker-compose.yml` | done: second service in one resource, pulls `relay-webmail:main`, own `relay-*` volumes, `expose` not `ports`, no `env_file` |
| B1 | Brand name chosen | decided: Relay |
| B2 | Strip upsell and promotional UI | done: SEL-gated UI deleted, every `enterprise`-flagged link hidden centrally in `webui/src/lib/layout.ts` |
| B3 | Rename product and logo | done: client-visible `Stalwart` → `Relay` in webui and server protocol strings; protocol tokens, `urn:stalwart:*`, `vnd.stalwart.*` and API-key prefix left alone |
| B4 | Audit locked fields, hide or plan reimplementation | done: hidden, not unlocked. The backend is absent, so reimplementation was only viable where community data exists |
| B5 | Dashboard, reimplement on community metrics | done: `webui/src/features/overview/` reads `/api/metrics/prometheus`, the only community-legal source |
| C1 | Webmail promotional and call-home audit | done: see the call-home table below |
| C2 | Webmail rename and restyle | done: locales, UI copy, assets, image labels and package metadata. Remaining `Bulwark` strings are wire identifiers and cache keys, listed below |
| D1 | Enumerate mailbox CRUD routes with evidence | done: `docs/API.md`, every claim tied to a file and line |
| D2 | Non-interactive auth for API client | done: HTTP Basic and JMAP auth methods documented, permission list verified from `enums.rs` |
| D3 | DNS plus Coolify domain for admin subdomain | operator action: needs DNS and a Coolify domain assignment, cannot be done from the repo |
| D4 | API smoke test | written: `scripts/api-smoke.sh`, syntax-checked. Not run against a live server |
| D5 | Live read-only probe of the endpoints | done: see the log entry and `docs/API.md` §8; the Prometheus exporter is still off on the server |
| E1 | Strip upstream ownership claims from policy docs | done: `server/AGENTS.md`, `server/CNAME`, `server/.github/`, `webui/.github/`, the security process and template files, and both marketing `img/` trees deleted; server and WebUI README, `server/CONTRIBUTING.md` and `server/SECURITY.md` rewritten for this fork |
| E2 | Report the dependencies the goal does not yet meet | done: two Cargo git forks and the compiled `resource_url` default, both documented with pins |

## Log

- 2026-11-07: The webmail suite measured against the vendor commit, and the 56 regressions the
  rebrand caused are gone. Method: `git worktree add` at `691d1a4` with `node_modules` junctioned
  in, then the same file list on both trees. Of the 34 files failing on `HEAD`, 10 (53 tests) fail
  identically at the vendor commit, so 24 files and 56 tests were ours.
  Cause, for all but two: behaviour, not branding. An earlier pass emptied the compiled defaults of
  every outbound feature (telemetry collector, version-check endpoint, built-in push relay,
  marketplace directory, favicon upstream, BIMI, public translation) and added a consent gate on the
  login ledger plus a mandatory relay URL in the dev JMAP mock. 54 of those tests specify the
  defaults rather than the fence, and `lib/__tests__/outgoing-hosts-mode.test.ts` already proves the
  mode refuses each host one at a time, so the constants bought nothing our compose file does not
  already guarantee. Reverted. What a deployment without `NO_THIRD_PARTY_TRAFFIC=true` does is now
  written down in the README instead of being hidden by an empty string.
  Kept, because it is branding: the three outbound `User-Agent` strings say Relay Mail and carry no
  URL (and the two files they left are dropped from the host allowlist whose job is to notice an
  unregistered literal); the Sieve `managed outside Relay Mail` header, whose round-trip test still
  counted only the old spelling; `Mail` joins the proper nouns in the sentence-case guard, since the
  Settings title is now two words like the `Bulwark Webmail` it replaces; and the settings-search
  check asks that the browser-only push row stay out of the desktop app rather than that "relay"
  match nothing, which it cannot now that the product is called Relay Mail.
  Fixed on top of the baseline, in code rather than by skipping: `desktop-host.test.tsx` mocked
  `@/lib/device-policy` without `canExportAnywhere`, which failed all 39 of its tests on any machine;
  `el` and `nn` were 14 keys short each (`compose_dock.*` and the whole `desktopSaveOpen` block) and
  have them translated; and `.github/workflows/docker-image-webmail.yml` never passed
  `BULWARK_BUILD_SEED`, so our amd64 and arm64 images were built with different build ids, which is
  exactly the load-balancer bug the two tests that read upstream's unvendored `.github/` were
  written to catch. Both tests now read our workflow, and the seed is per run.
  Result: `npx vitest run --silent` on `webmail/` gives 2055 files passed, 5 failed, 2 skipped;
  21828 tests passed, 8 failed, 15 skipped. The 8 all fail at the vendor commit too, so they are
  carried rather than caused: `blob-routing` (3) exports the attachment blob where the test wants the
  raw one, `push-preview-route` (3) times out at 5 s and resolves the primary account where a shared
  one is asked for, `health-route` (1) trips its own wording guard because this machine reports 170%
  of the V8 heap limit, and `telemetry-desktop` (1) looks for a desktop-app collector path on the
  host, which `it.skipIf(process.env.CI)` skips in CI.
- 2026-11-07: Ownership and contact claims removed from the policy docs. Deleted
  `server/AGENTS.md` (it instructed AI agents to route bugs to `support.stalw.art`, refuse
  pull requests and not file advisories, which is upstream's policy applied to our repo),
  `server/CNAME` (`get.stalw.art`), `server/.github/` (issue, discussion and PR templates,
  `allowed-pr-authors.txt` naming upstream contributors, `dependabot.yml` and seven inert
  workflow files including the auto-close bots), `webui/.github/workflows/build.yml` (publishes
  upstream's `webui.zip` releases), `server/SECURITY_PROCESS.md`, `server/SECURITY_TEMPLATE.md`
  and the `img/` logo and demo-gif trees in both `server/` and `webui/`. Rewrote
  `server/README.md`, `server/CONTRIBUTING.md`, `server/SECURITY.md` and `webui/README.md` as
  fork docs: no badges, no social or support portal links, no enterprise or OpenCollective
  pitch, and the real developer content kept (`VITE_*` variables, `build.sh`, the `resource_url`
  wiring, cargo and clippy checks). `server/UPGRADING/` and both `CHANGELOG.md` files stay as
  upstream reference, and are now labelled as such in the READMEs; the code's own SPDX headers
  and `LICENSES/` were not touched, since authorship metadata is a license condition and not
  branding.
  Verified: nothing references a deleted path (grep for `img/`, `server/.github`,
  `allowed-pr-authors`, the deleted files), `webui` typecheck exits 0 after the changes. Not
  verified: no Rust build, so the cargo commands in `server/CONTRIBUTING.md` are transcribed from
  `server/Cargo.toml` rather than executed here.
- 2026-11-07: Live read-only probe of `mail.shopstatesideglobal.com` with anonymous `curl`,
  recorded in `docs/API.md` §8. `/.well-known/jmap` → 307 → `/jmap/session`, which returns a
  real capabilities document; `/jmap` → 404 on GET, correct, that branch only matches POST
  (`server/crates/http/src/request.rs:144-145`); `/.well-known/oauth-authorization-server` → 200;
  `/api/schema` → 401. **`/api/metrics/prometheus` → 404**, so the new Overview page has no data
  source yet: the `prometheus` field of the `Metrics` settings object defaults to `Disabled`
  (`server/crates/registry/src/schema/structs_impl.rs:44481`) and the route is only mounted when it
  is enabled (`server/crates/common/src/config/telemetry.rs:729`, `server/crates/http/src/request.rs:721-722`).
  The page already handles this: a 404 maps to the "Metrics endpoint is off" note, not an error
  (`webui/src/features/overview/useOverviewMetrics.ts:40`). Operator action: Settings → Metrics →
  Prometheus endpoint = Enabled. Nothing credential-based has been exercised; the smoke script is
  still unrun.
- 2026-11-07: Webmail branding finished. New Relay artwork authored and committed:
  `public/branding/Relay_Favicon.svg`, `Relay_Logo_Color.svg`, `Relay_Logo_White.svg`,
  two lettered wordmark SVGs, plus PNGs rasterised from them (`sharp`, which is already a
  dependency) for `icon-192x192`, `icon-512x512`, the four maskable variants,
  `apple-touch-icon` and the three branding PNGs the admin picker and OG image expect.
  All 47 references to `Bulwark_Favicon` / `Bulwark_Logo_*` across 18 files repointed and the
  eight upstream asset files deleted. The mark is a double chevron on a `#1E4FD8` tile; the
  lettered PNGs are pre-rendered rather than SVG-with-`<text>`, because the Alpine runtime
  image has no fonts and `sharp` would rasterise the wordmark blank at request time.
- 2026-11-07: Remaining webmail traces removed. `org.opencontainers.image.vendor` was still
  `rbm.systems` in both Dockerfiles; `package.json` still named Bulwark Mail as author and
  pointed repository, homepage and bugs at `github.com/bulwarkmail/webmail`; Settings → About
  linked its AGPL source at the upstream repo (now ours, and `SOURCE_CODE_URL` overrides it);
  `webmail/deploy/demo-deploy.sh` deployed to upstream's own demo host and was deleted; the
  Kubernetes manifests pulled `ghcr.io/bulwarkmail/webmail`; `README.md` and `CONTRIBUTING.md`
  were rewritten as fork docs without badges, banner, Discord or live-demo links;
  `ACCESSIBILITY.md` links repointed. The login page's GitHub star fetch and the
  `X-Powered-By: bulwarkmail.org` header were already gone, but the header test still asserted
  the removed value and was failing; it now asserts the header is absent.
  Verified: ~~`npx vitest run` in `webmail/` passed 4363 tests with 0 failures~~. That number came
  from a scoped run and was wrong; see the 2026-11-07 suite entry below for what was actually
  measured. Not verified at the time: the Next.js typecheck could not run (it is OOM-killed when
  anything else is on the machine), so the asset renames were covered by tests and grep, not `tsc`.

- 2026-11-07: `docker-compose.yml` gained the `webmail` service, resolving the conflict analysis
  point by point. One resource, two services, so a deploy can never start a second RocksDB writer.
  Webmail uses `expose: ["3000"]` with no host publish, its own six `relay-*` volumes with no path
  or name shared with `stalwart-config` / `stalwart-data`, and no `env_file` (the referenced
  `.env.local` is gitignored and a missing env_file fails a Coolify deploy). It pulls
  `ghcr.io/devfazla/relay-webmail:main` with the local `build:` block kept commented, mirroring the
  server service. `NO_THIRD_PARTY_TRAFFIC=true`, `BULWARK_TELEMETRY=off` and
  `BULWARK_UPDATE_CHECK=off` are pinned in the environment. `SESSION_SECRET` is deliberately unset:
  the app generates one on first boot and stores it in `relay-admin-state`, so no secret sits in the
  repo and it survives upgrades. `webmail/docker-compose.yml` now builds from the local context
  instead of pulling `ghcr.io/bulwarkmail/webmail:latest`.
  Verified: both files parse as YAML, no duplicate keys, no volume name appears in more than one
  service, no port is published by webmail, and no compose file references an upstream image.
  Not verified: `docker compose config` (no Docker on this machine) and any actual deploy.
- 2026-11-07: `DEPLOY.md` rewritten around the per-subproject build matrix, two domains, the CORS
  step the webmail needs, webmail volume backups, and webmail-specific troubleshooting. Corrected
  the earlier claim that `/api/live/metrics` is in the community build.
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
