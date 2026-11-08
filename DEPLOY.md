# Deploying to a VPS with Coolify

The repository holds three subprojects, each with its own CI job and image:

| Subproject | What it is | Image | CI triggers on |
|---|---|---|---|
| `server/` | Stalwart mail server (SMTP/IMAP/JMAP/…) | `ghcr.io/devfazla/stalwart:main` | `server/**`, `webui/**`, `Dockerfile` |
| `webui/` | Admin panel, bundled into the server image | (same image) | same as server |
| `webmail/` | Relay Mail, the user-facing webmail client | `ghcr.io/devfazla/relay-webmail:main` | `webmail/**` |

The workflow is: **push → the matching Actions job builds its image → Coolify
pulls it.** Both jobs are path-filtered and build each architecture natively
(amd64 on x86, arm64 on ARM runners, no QEMU), then merge the two digests into
one multi-arch tag, so a VPS of any architecture only ever pulls a ready-made
image and deploys in about a minute.

Because the triggers are separate, **a commit that only changes `webmail/` does
not rebuild or republish the server image**, and a server change does not pay for
a Next.js build. Coolify will leave the running server container untouched when
only the client changed.

The server image contains:

- the **Stalwart server**, compiled from `server/` (cargo-chef build, upstream's recipe),
- the **WebUI**, built from `webui/` and **bundled into the image** at `/opt/stalwart/webui.zip`.

The server's default UI URL is pinned to the bundled zip (the builder stage rewrites
the upstream GitHub download URL to `file:///opt/stalwart/webui.zip`), so the admin
panel and portal are always **your local build**, nothing is downloaded from GitHub
at runtime, and redeploying ships your latest UI changes automatically.

Compiling Stalwart on a small VPS takes 1–2+ hours and lots of RAM, which is why the
heavy work runs on GitHub's free runners instead of on your box.

## Files

| File | Purpose |
|---|---|
| `.github/workflows/docker-image.yml` | CI: server + WebUI image, path-filtered to `server/` and `webui/` |
| `.github/workflows/docker-image-webmail.yml` | CI: Relay Mail image, path-filtered to `webmail/` |
| `Dockerfile` | Builds server + WebUI into one image |
| `docker-compose.yml` | Coolify resource: one resource, two services, both pull from GHCR |
| `.dockerignore` | Keeps the server build context to what's needed |
| `webmail/Dockerfile` | Multi-stage Next.js build for Relay Mail (standalone output, non-root runtime) |
| `webmail/docker-compose.yml` | Standalone webmail-only deploy; the root file is the source of truth |

## Prerequisites

1. This repo on GitHub (`devfazla/stalwart`), where each job runs on pushes that touch
   its own subdirectory.
2. **VPS sizing**: running both containers is light: Stalwart needs ~0.5–1 GB RAM
   plus mail storage, and Relay Mail a few hundred MB. A 2 GB VPS is comfortable
   because neither image is built there. (Building the *server* on the VPS would
   need 4 GB+ and hours; see the alternative below.)
3. **DNS (before deploy)**: an `A` (and/or `AAAA`) record for your mail hostname,
   e.g. `mail.example.com → VPS IP`, plus one for the webmail hostname, e.g.
   `webmail.example.com → VPS IP`. Mail-specific records (MX, SPF, DKIM, DMARC)
   are covered in *Mail setup* below.
4. **Firewall**: allow inbound 25, 465, 993, 995, 4190 (80/443 are managed by
   Coolify's proxy). Outbound **port 25 must not be blocked**: many providers
   (Hetzner, DigitalOcean, Oracle…) block it by default; request the block removed
   or your mail can't be delivered.
5. **GHCR package visibility (one-time)**: the first CI run creates each package
   **private**. Either make them public (GitHub repo → Packages → `stalwart` and
   `relay-webmail` → *Package settings* → *Change visibility* → Public; both
   sources are AGPL anyway) or keep them private and add a read-credentials
   registry entry in Coolify (Server → Registries, PAT with `read:packages`).

## Deploy steps

1. Wait for the CI runs to finish: GitHub repo → **Actions** → "Build Docker image"
   and "Build webmail image" green, and both images exist at
   `ghcr.io/devfazla/stalwart:main` and `ghcr.io/devfazla/relay-webmail:main`.
   The webmail job has never run until the first push that touches `webmail/`, so
   on a fresh fork check that tag exists before deploying, or temporarily switch
   the service to the commented `build:` block.
2. Make both GHCR packages public (or set up registry credentials, see Prerequisites).
3. Coolify dashboard → your project → **New Resource → Docker Compose**.
4. Select the repo + branch. Compose file: `./docker-compose.yml`. Coolify shows
   both services; keep both.
5. Assign a **domain to each service**, using the container port as the suffix:
   Coolify's proxy terminates HTTPS on 443 in front of it, and neither port is
   published on the host, so nothing collides:
   - `stalwart` → `https://mail.example.com:8080`
   - `webmail` → `https://webmail.example.com:3000`
6. **Required environment variables** on the `stalwart` service (without these,
   first-boot login fails with "Client metadata document domain is not allowed"
   because the server can't tell which domain it serves):
   - `STALWART_HOSTNAME=mail.example.com`
   - `STALWART_PUBLIC_URL=https://mail.example.com`
7. **Set `JMAP_SERVER_URL` on the `webmail` service** to the same public URL as
   the server (`https://mail.example.com`). It is pre-filled in
   `docker-compose.yml` with the shopstatesideglobal hostnames, so change both
   values together if you use other domains.
8. **Deploy**: Coolify pulls both images and starts them (~1–2 min).
9. Open your mail domain → Stalwart runs its **first-boot setup wizard** (bootstrap
   mode, port 8080). Create the admin account; keep the default local data store
   (SQLite/RocksDB paths inside the `/var/lib/stalwart` volume) for a single node.
10. **Let the webmail talk to the server**: turn on the permissive CORS switch.
    Stalwart has no CORS *allowlist*, only one boolean, `usePermissiveCors`
    (`server/crates/registry/src/schema/structs.rs:3334`). When it is on, every HTTP
    response carries `Access-Control-Allow-Origin: *` with a fixed header/method list
    (`server/crates/common/src/config/network.rs:448`).

    Click path in the admin panel: **Network → HTTP → Security**, then flip
    *Permissive CORS policy* on the right and press **Save**. It is under HTTP Security,
    not the HTTP General page that holds *Client IP source*, and the description reads
    "allow all origins", which is why searching for an origin list finds nothing.

    Verify before signing in. The discovery endpoints (`/.well-known/…` and the
    OAuth routes) send `*` unconditionally, so they pass while `/jmap` still fails:

    ```sh
    curl -si -X OPTIONS https://mail.example.com/jmap \
      -H 'Origin: https://webmail.example.com' | grep -i access-control
    ```

    Three header lines mean it is on; no output means the toggle is still off. Give
    the server a few seconds after Save, it rebuilds its HTTP config on a short
    interval, so an empty result immediately after the flip is not proof it failed.
    (The same value is a settings primitive,
    `{"@type":"update","object":"Http","value":{"usePermissiveCors":true}}`, which
    `stalwart-cli apply --file` accepts the same way
    `webmail/integration/stalwart/plan-accounts.ndjson.tpl` sets it. There is no
    REST route for writing settings; see `server/api/v1/openapi.yml`.)

    `*` is enough here: the webmail client never attaches credentials to a
    cross-origin JMAP call (`webmail/lib/jmap/client.ts:303`), so there is no
    cookie for another site to ride along. Without this switch the browser blocks
    every JMAP call, because the webmail client talks to JMAP directly instead of
    through the webmail container.
11. Open the webmail domain and sign in with a mailbox account.

> The server's healthcheck allows a long start period (300 s) so the container
> isn't marked unhealthy while it waits for you to finish the wizard.

## Alternative: build on the VPS (not recommended)

If you ever want the VPS to build instead of pulling:

1. In `docker-compose.yml` comment the `image:` line and uncomment the `build:` block.
2. Raise Coolify's deployment timeout: Server → Settings → **Advanced → Builds**
   (set e.g. 7200 s), since the default 3600 s *will* kill the first build.
3. On a VPS with < 4 GB RAM also uncomment `BUILD_LTO: "false"` and
   `BUILD_CODEGEN_UNITS: "16"`, and add swap, or the build will thrash/OOM.

Expect 1–2+ hours for the first build and long rebuilds afterwards; the CI route
exists precisely to avoid this.

The `webmail` service has the same commented `build:` block. That one is far
cheaper: a Next.js build takes a few minutes and about 2 GB RAM, so building it
on the VPS is a workable stopgap if the webmail image has not been published yet.

## Mail setup (after the wizard)

1. **DNS records**: create in your DNS provider, values from the admin UI:
   - `MX` → `mail.example.com` (priority 10)
   - `SPF`: TXT `v=spf1 mx -all`
   - `DKIM`: the admin UI generates keys per domain, publish the selector TXT it shows
   - `DMARC`: TXT `_dmarc` → `v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com`
2. **rDNS/PTR**: set the reverse DNS of your VPS IP to `mail.example.com` with your
   provider, since major receivers reject mail without it.
3. **TLS for mail protocols**: Coolify's proxy owns ports 80/443, so Stalwart can't
   do HTTP-01/TLS-ALPN ACME. Use **DNS-01** in the admin UI
   (TLS → certificate authorities → Let's Encrypt → DNS challenge + your DNS
   provider's API credentials). SMTP (465), IMAPS (993), POP3S (995) then get
   proper certificates. Until then they present self-signed certs.
4. **Optional ports**: to offer STARTTLS submission (587) or plain IMAP/POP3 (143/110),
   create the listeners in the admin UI first, then uncomment the matching lines in
   `docker-compose.yml` and redeploy.

## Operations

- **Updates**: `git push` → the CI job whose paths you touched builds a new image
  → Coolify **Redeploy** pulls the `main` tags. A push that only touched
  `webmail/` skips the server build entirely, so the running server is never
  rebuilt or restarted for a client change. To fully automate, enable webhooks
  for the resource in Coolify so pushes trigger redeploy.
- **Backups** (Coolify → service → Backups): schedule backups of the named volumes
  `stalwart-data` (all mail + registry) and `stalwart-config` (bootstrap config).
  On the webmail service, back up `relay-admin` (its own config, themes, branding),
  `relay-admin-state` (audit log, setup token, and the auto-generated
  `SESSION_SECRET`) and `relay-plugin-secrets`. `relay-settings` holds users'
  encrypted client settings. Losing `relay-admin-state` silently rotates the
  session secret, which logs everyone out of "Remember me" and breaks settings
  sync.
- **Version shown in webmail's Settings > About**: CI passes `GIT_COMMIT` as a
  build arg, so the pulled image reports the commit it was built from. `.dockerignore`
  excludes `.git`, so a local `docker compose build webmail` reports `unknown`
  unless you pass it yourself.
- **Logs**: Coolify log viewer, or `docker logs`; the server's health endpoints
  are `/healthz/live` on 8080 (HTTP) and 443 (HTTPS); the webmail's are
  `/api/health/live` and `/api/health/ready` on 3000.
- **Admin UI hardening**: enable 2FA for the admin account; the UI is internet-facing
  through your domain.

## Troubleshooting

- **"Image not found" / pull error on deploy** → the GHCR package is still private
  (make it public, see Prerequisites) or the CI run hasn't finished yet.
- **UI shows a setup wizard after you already configured** → the config volume
  (`stalwart-config`) was lost; check both volumes are attached.
- **Can receive but not send mail** → outbound port 25 blocked by the provider (see
  Prerequisites) or missing PTR/SPF/DKIM.
- **Webmail sign-in fails with a CORS or network error in the browser console** →
  `Http.usePermissiveCors` is off on the server (deploy step 10), or `JMAP_SERVER_URL`
  points at a host the browser cannot reach. The curl in step 10 tells you which.
- **Webmail `ghcr.io/devfazla/relay-webmail:main` does not exist yet** → the
  webmail job only runs on a push that touches `webmail/`. Push, wait for
  "Build webmail image" to go green, or use the commented `build:` block to build
  locally in the meantime.
- **Local webmail build killed on deploy** → the VPS ran out of memory during
  `npm ci` or `next build`. Add swap, raise Coolify's build timeout (Server →
  Settings → Advanced → Builds), or go back to the CI image.
- **Webmail calendar/subscription features say "Not authenticated"** while the
  login page works → the mail server uses a self-signed or private-CA certificate
  and the webmail container cannot verify it server-side; mount the CA and set
  `NODE_EXTRA_CA_CERTS`.
