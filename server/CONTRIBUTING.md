# Contributing to this fork

This repository is the source for Relay, our own deployment of the Stalwart server, the
Stalwart WebUI and the Bulwark webmail client. It is not upstream, and upstream's
contribution policies do not apply here; there is no vouching list and no AI-submission
ban. The three directories are separate projects with their own build and test setup:
[README.md](README.md) in each one covers it.

## Working in `server/`

- Rust workspace, `cargo build --release` from this directory. CI builds the container
  image from the repository root `Dockerfile`.
- `cargo clippy` and `cargo test` should stay clean. Long test suites are split per
  crate, so run the crate you touched.
- Anything gated by `#[cfg(feature = "enterprise")]` refers to code that is not in this
  repository. Do not write against those paths, and do not try to route around the gate;
  the [license](LICENSES/) reasoning is in [../ROADMAP.md](../ROADMAP.md).

## Renaming

Client-visible strings say Relay. Wire formats do not: `urn:stalwart:*` capabilities,
`vnd.stalwart:*` media types, `stalwart_*` metric names, `sat_` API key prefixes, storage
and settings keys, and the `stalwart` CLI name stay as they are. Renaming one breaks
interop or existing data for no benefit. The full list and why is in
[../README.md](../README.md).

License headers are not branding. `SPDX-FileCopyrightText`, `SPDX-License-Identifier`,
`LICENSES/` and `NOTICE` stay exactly as they are.

## Before opening a pull request

```sh
cargo fmt --all
cargo clippy --all-targets
cargo test
```

Then build and run the change against a test server. Mail server behaviour is hard to
reason about from unit tests alone, and DNS, TLS and ACME paths need a live check.

Questions about the deployment itself are ours to answer; the operational docs are
[../DEPLOY.md](../DEPLOY.md).
