# Relay mailbox API

How to create, read, update and delete mailboxes on `mail.shopstatesideglobal.com`
from a script, and what to configure first.

Every claim below is from the code in this repository, with the file and line so you
can check it. Where something is not available in the community build, it says so.

## 1. Which surface to use

Mailbox CRUD is a JMAP call. There is no REST resource for accounts.

| Need | Endpoint | Verified at |
| --- | --- | --- |
| Session / capability discovery | `GET /jmap/session` | `webui/src/services/jmap/client.ts:310` |
| Everything that reads or writes objects | `POST /jmap` | `server/crates/http/src/request.rs:143-192` |
| Admin UI console permissions | `GET /api/account` | `webui/src/services/jmap/client.ts:323` |
| Schema of every manageable object | `GET /api/schema` | `server/crates/http/src/request.rs` (`api` branch) |
| Prometheus text export | `GET /api/metrics/prometheus` | `server/crates/http/src/request.rs:720-745` |

The JMAP type name for a mailbox is `Account`
(`server/crates/registry/src/schema/properties_impl.rs:271`), so the method names are
`Account/get`, `Account/set`, `Domain/get`, `Domain/set` and so on. The admin panel uses
exactly these; it builds them from the same schema this document describes.

Because the admin UI is served by the same binary that serves `/jmap`, a script aimed at
`https://admin.shopstatesideglobal.com/jmap` is same-origin with the UI and needs no CORS
setup at all.

## 2. Authentication

Both schemes are accepted on the JMAP routes, in this order, by
`Server::authenticate_headers` (`server/crates/http/src/auth/authenticate.rs:35-100`):

- `Authorization: Basic <base64(user:secret)>`
- `Authorization: Bearer <token>`

Anything else is rejected. A successful lookup is cached per token, and every request,
authenticated or not, passes a rate limiter
(`is_http_authenticated_request_allowed`, same file, line 60).

For automation, prefer a dedicated account with an API key rather than your own password:
an API key is a secondary credential on the admin account, it can be rotated and revoked
without locking you out of the UI.

Scopes are checked per call, not per connection. The permission strings for mailboxes are
(`server/crates/registry/src/schema/enums.rs:2014-2022`):

```text
sysAccountQuery        list and search accounts
sysAccountGet          read one account
sysAccountCreate       create
sysAccountUpdate       change properties
sysAccountDestroy      delete
sysAccountPasswordGet  read the current secret
sysAccountPasswordUpdate  set the secret
```

Roles are just a named list of those strings, stored as a `Role` object, and an account
references a role. A scripting account needs at least the six `sysAccount*` entries plus
`sysDomainQuery` if it has to look up domains.

## 3. Requests

One JMAP request per HTTP request. The body is a `methodCalls` array of
`[method, arguments, callId]`:

```jsonc
{
  "using": ["urn:ietf:params:jmap:core"],
  "methodCalls": [
    ["Account/get", { "accountId": "management", "ids": null }, "c0"]
  ]
}
```

`accountId` is required by the protocol. For management objects the server resolves it to
the authenticated principal, so pass the id from your session document.

### Create

```jsonc
{
  "using": ["urn:ietf:params:jmap:core"],
  "methodCalls": [
    ["Account/set", {
      "accountId": "management",
      "create": {
        "new-mailbox": {
          "type": "individual",
          "name": "jane",
          "secrets": ["correct horse battery staple"],
          "emails": ["jane@mail.shopstatesideglobal.com"],
          "quota": 10737418240,
          "roles": ["user"]
        }
      }
    }, "c0"]
  ]
}
```

The property names are whatever the schema reports, not what this file says. Read them
from `GET /api/schema` before you hard-code anything: the set of fields differs between
server versions, and a field that is missing here fails the create with a property error
rather than being ignored.

### Update

`update` maps an existing object id to a patch of changed properties only.

### Delete

`destroy` takes an array of ids. It is not reversible and it removes the mailbox data.

### Reading back

Use `Account/get` with `"ids": null` for everything the token may see, or a specific list.

## 4. Partial failure

A single call can create three mailboxes and fail on the fourth. The response is still
`200 OK`. You must read the result object:

- `created` / `updated` / `destroyed` keyed by the call-local id or object id
- `notCreated` / `notUpdated` / `notDestroyed`, each value a JMAP error object with a
  `type` such as `invalidProperties`, `alreadyExists`, `forbidden`, `notFound`, and a
  `properties` map naming the offending field

Treat `notCreated` on an id you asked for as a hard failure. Never assume a `200` means
the change happened.

## 5. Before a script can reach the API

These are settings on the server, all reachable in the admin UI. They are listed here
because the failure modes are miserable to debug from the client side.

### Client IP source behind the reverse proxy

Set the HTTP client IP source to `xForwardedFor` (leaving `forwardedHops` at 1) and add
the proxy network to the HTTP allowed-IP list.

With the source left at `peer`, every request from outside looks like it comes from the
proxy's container address. The ban logic then bans the proxy itself, and one banned proxy
is a 502 for every user. This already happened in production once. Allowed addresses are
checked before any ban is applied
(`server/crates/common/src/network/security.rs:270-280`).

### Paths that ban instantly

`is_http_banned_path` blocks the source IP with `BlockReason::PortScanning` the first time
it touches a path on the HTTP banned-paths list. It is not a rate limit and there is no
warning. A scanner probing admin paths gets banned outright, and so does a misconfigured
script that hits the same paths.

Practical consequence: point your script at `/jmap`, not at a list of guesses, and if a
run starts failing with 403 after working, check the banned-IP table before you check
your code.

### Rate limits

Authenticated requests go through their own limiter. A polling script that loops over
`Account/get` for every mailbox should batch: one `Account/get` with `ids: null` costs one
request and returns everything, while a loop costs one request per account and will
eventually be throttled.

### If a browser app on another host calls the API

For a server-to-server script, skip this section: there is no origin, so there is no CORS.

For the webmail on a different hostname, the browser needs the API host to send CORS
headers. Stalwart has no allowlist of origins: the setting is the single boolean
`usePermissiveCors` on the `Http` singleton (`server/crates/registry/src/schema/structs.rs:3334`),
and when it is on every response carries `Access-Control-Allow-Origin: *` plus a fixed
header and method list (`server/crates/common/src/config/network.rs:448`). `*` is safe in
this design because the webmail client sends no credentials cross-origin
(`webmail/lib/jmap/client.ts:303`).

The discovery documents are served at `.well-known/oauth-authorization-server` and
`.well-known/openid-configuration`, and those, the OAuth endpoints and the autodiscover
routes answer preflights with permissive CORS even with the global switch off
(`server/crates/http/src/request.rs:460`, `:485`, `:490`, `:855`,
`auth/oauth/auth.rs:514`, `:539`, `openid.rs:142`). That is why `curl -X OPTIONS
https://mail.example.com/jmap` returning no CORS headers does not contradict a
`.well-known` preflight that has them. For the OAuth client itself, register it so its
redirect origins match (`Oauth::Client` objects).

The OAuth endpoints themselves are `authorize`, `token`, `device`, `revoke` and
`registration`, implemented under `server/crates/http/src/auth/oauth/`. The token endpoint
handles refresh tokens and access-token grants
(`server/crates/http/src/auth/oauth/token.rs`). For automation, HTTP Basic with an API key
is a shorter path than the authorization-code flow, which needs a browser.

## 6. Monitoring endpoints

`GET /api/metrics/prometheus` is the community metrics source and the Overview page reads
it. Three things about it surprise people:

- It answers **404 until the exporter is switched on**. The route only exists when the
  `prometheus` field of the `Metrics` settings object is `Enabled`, and that field defaults
  to `Disabled` (`server/crates/http/src/request.rs:721-722`,
  `server/crates/common/src/config/telemetry.rs:729`,
  `server/crates/registry/src/schema/structs_impl.rs:44481`). Switch it on in the admin UI
  under Settings then Metrics, and the endpoint starts serving. The Overview page treats a
  404 as "endpoint is off" and shows that instruction instead of an empty chart
  (`webui/src/features/overview/useOverviewMetrics.ts:40`).
- It does not use the console's bearer token. It is either anonymous, when no username and
  secret are configured, or HTTP Basic
  (`server/crates/http/src/request.rs:720-745`). Setting a Basic secret makes the in-browser
  Overview page unable to read it, by design; the page tells you this instead of logging you
  out.
- The exporter only emits a metric once it has a non-zero value
  (`server/crates/trc/src/ipc/metrics.rs:281-297`). An idle server returns a short document,
  not a document full of zeros.

Live dashboards over `/api/live/*` are enterprise-only and are not in this build
(`server/crates/http/src/api/telemetry.rs:1-9`). The in-app Overview page
(`webui/src/features/overview/`) is a replacement built on the text export.

## 7. Worked session

Placeholders in angle brackets. Never put a real secret in a file or in shell history.

```bash
API=https://admin.shopstatesideglobal.com
AUTH="$(printf '%s' 'relay-admin:<api-key>' | base64 -w0)"

curl -sS -X POST "$API/jmap" \
  -H "Authorization: Basic $AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"using":["urn:ietf:params:jmap:core"],"methodCalls":[["Domain/get",{"accountId":"relay-admin","ids":null},"c0"]]}'
```

`scripts/api-smoke.sh` wraps this sequence (create, read, update, rotate secret, delete)
with assertions and cleanup, and prints one PASS or FAIL line per step.

## 8. What has been checked against the live server

Probed on 2026-11-07 with anonymous `curl`, no credentials, read-only requests.

| Request | Result |
| --- | --- |
| `GET /.well-known/jmap` | 307 to `/jmap/session`, which returns a real capabilities document |
| `GET /jmap` (no auth) | 404, as expected; that route only answers `POST` |
| `GET /.well-known/oauth-authorization-server` | 200 |
| `GET /api/schema` | 401 |
| `GET /api/metrics/prometheus` | 404, the exporter is still `Disabled` |

So the endpoints and the discovery chain are up. What has *not* been exercised is anything
that needs credentials: mailbox create, read, update, secret rotation and delete, plus the
permission checks behind `sysAccount*`. Run `scripts/api-smoke.sh` once with an API key
before relying on it in production; enabling the Prometheus exporter is a one-click change
in the admin UI and is worth doing at the same time, since the Overview page has no data
source until it is on.
