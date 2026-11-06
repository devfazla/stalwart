# Contributing to Relay Mail

This directory is a vendored subproject of the [monorepo](../README.md), so
changes land through the repository root, not here. See
[ROADMAP.md](../ROADMAP.md) for what the fork is and why, and
[DEPLOY.md](../DEPLOY.md) for how it ships.

## Development setup

```bash
git clone https://github.com/devfazla/stalwart.git
cd stalwart/webmail
npm install
cp .env.dev.example .env.local   # built-in mock JMAP server, no mail server needed
npm run dev
```

Before opening a pull request, run:

```bash
npm run typecheck && npm run lint && npx vitest run
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:` and so on).

## Ground rules inherited from the codebase

These are technical constraints that are expensive to discover by hand, not
policy:

- The client is built for Stalwart. Changes for other JMAP servers are welcome
  when they cost Stalwart users nothing.
- New behaviour gets one good default. If deployments need different behaviour,
  add an admin setting rather than a per-user toggle.
- Features must work in the Lite build too, or be hidden there, and UI changes
  must work at phone width.
- Anything touching sign-in, sessions, the HTML sanitizer, the plugin sandbox,
  the outgoing-request guards or admin routes needs a review from someone who
  knows that area, and a test that fails without the change.
- The "no third-party traffic" fence (`lib/outgoing-hosts.ts`,
  `lib/admin/third-party-mode.ts`) is a privacy boundary. New outbound hosts
  have to be registered there and respect the mode, not bypass it.
- Locale files are generated and checked by `npm run test:translations`; a
  missing key in `en` fails the build.

By contributing, you agree that your contributions are licensed under the terms
in [LICENSE](LICENSE): AGPL-3.0-only, with the additional permission for app
store distribution. That permission is still provisional for older code but
applies in full to contributions made since 30 September 2026.

## Security issues

Do not open a public issue. Report privately through a
[GitHub security advisory](https://github.com/devfazla/stalwart/security/advisories/new)
on the repository root.
