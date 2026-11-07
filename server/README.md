# Relay server

The Rust workspace that runs the mail and collaboration service. It is the vendored
source of Stalwart v1.0.2, modified for our deployment; the parent repository
[devfazla/stalwart](https://github.com/devfazla/stalwart) is the only remote and
[../README.md](../README.md) explains what was renamed and what was left alone.

Everything a user sees says Relay. The protocol identifiers, the storage keys and the
metric names still say Stalwart, because those are wire and on-disk formats, not
branding.

## Building

From the repository root, `Dockerfile` builds the server and bundles the WebUI into one
image. Locally:

```sh
cargo build --release                  # workspace
./target/release/stalwart --help
```

The workspace is large; a cold release build takes a long time and needs several GB of
disk. The CI image build is the reliable path.

## Running alongside the other projects

`../docker-compose.yml` is one deployment with two services. This directory's binary is
what the `stalwart` service runs; `../webui/` is the admin panel it serves at `/admin`,
and `../webmail/` is the mail client on its own container. The client reaches JMAP from
the browser, so the server needs `usePermissiveCors` on the `Http` settings object
(see [../DEPLOY.md](../DEPLOY.md) step 10).

[../DEPLOY.md](../DEPLOY.md) has the step-by-step deployment guide and
[../docs/API.md](../docs/API.md) the mailbox management API.

## License

Dual-licensed `AGPL-3.0-only OR LicenseRef-SEL`, both in [LICENSES/](LICENSES/). We
operate under the AGPL branch. The proprietary branch covers the enterprise features,
whose code is not in this repository: `#[cfg(feature = "enterprise")]` gates about 151
files, and the gated implementation ships separately. Nothing in here needs a
subscription to build or run.

File-level `SPDX-FileCopyrightText` and `SPDX-License-Identifier` headers are part of the
license conditions and are kept unchanged, so the code's authorship stays attributed to
its authors, including Stalwart Labs LLC. That is legal attribution, not product
branding, and it is not something a fork may edit away.

The upgrade notes in [UPGRADING/](UPGRADING/) and the release history in
[CHANGELOG.md](CHANGELOG.md) are upstream documentation retained for reference. They
name upstream hosts and upstream support channels; those are not our channels.

## Reporting a vulnerability

See [SECURITY.md](SECURITY.md). Contributing changes: [CONTRIBUTING.md](CONTRIBUTING.md).
