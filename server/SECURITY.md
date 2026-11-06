# Security policy

Applies to this repository and to the deployment it produces. Upstream Stalwart's policy
and its contacts do not apply here; this fork is maintained by
[devfazla](https://github.com/devfazla) and that is where reports go.

## What is in scope

- `server/`: the mail and collaboration server, exposed to the internet on
  `mail.shopstatesideglobal.com` (SMTP 25, Submission 465, IMAP 993, POP3 995,
  ManageSieve 4190, HTTP 8080 behind a proxy).
- `webui/`: the admin panel at `admin.shopstatesideglobal.com` and the self-service
  portal at `/account`.
- `webmail/`: the Next.js mail client, its server-side routes and its OAuth sign-in flow.

## Reporting

Use a **private** channel, never a public issue:

- [GitHub Security Advisory](https://github.com/devfazla/stalwart/security/advisories/new)
  on this repository, or
- `frchowdhury480@gmail.com` if the advisory form is not usable for you.

Include, as far as you can:

1. which of the three projects and which version, taken from Settings → About or
   `/api/schema`
2. the exact request or protocol exchange, with a reproduction against a test instance
   rather than the production one
3. what you observed and what you believe the impact is
4. any log or metric line that supports it

Do not post proofs of concept, tokens or mailbox contents in a public issue, and do not
test against `mail.shopstatesideglobal.com`. A throwaway instance built from this
repository is enough and is safer for everyone.

## Response

This is a single-maintainer fork of a large codebase, so promise honesty rather than a
service level. You will get an acknowledgement, and a fix or a reasoned decision, as fast
as I can manage. Upstream Stalwart's own security process continues to apply to the code
we inherit: if upstream releases a fix for a vulnerability in this vendored version, it
lands here in the next rebuild of `ghcr.io/devfazla/stalwart:main`.

## Versions

The deployment tracks the `main` branch, built per push. Anything older than the vendored
baseline named in [../README.md](../README.md) is not supported, because it is not what
runs.

## Not vulnerabilities

Known and intentional properties of this fork, listed so they are not reported again:

- Enterprise-only features are absent, not hidden. `/api/live/*` answers nothing in this
  build (`server/crates/http/src/api/mod.rs:326-345`); that is the community edition
  working as licensed, not a bypass.
- `/api/metrics/prometheus` is anonymous unless a Basic secret is configured, and returns
  404 while the exporter is disabled. Set a username and secret if the endpoint should not
  be public; see [../docs/API.md](../docs/API.md).
- The webmail client fences all built-in third-party hosts with
  `NO_THIRD_PARTY_TRAFFIC=true`. Disabling that is a configuration choice by the operator,
  not a defect.
