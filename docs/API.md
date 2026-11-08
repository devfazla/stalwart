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
(`server/crates/registry/src/schema/properties_impl.rs:271`). Management methods carry a
mandatory `x:` prefix: the wire names are `x:Account/get`, `x:Account/set`, `x:Domain/get`,
`x:Domain/set`, `x:ApiKey/set`. The server formats every registry method as `x:{object}/{fn}`
(`server/crates/jmap-proto/src/request/method.rs:250-252`), and the admin UI builds them the
same way (`webui/src/services/jmap/client.ts:189`). A bare `Account/set` without the `x:`
is not a management call and will not do what you want.

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
    ["x:Account/get", { "accountId": "<management account id>", "ids": null }, "c0"]
  ]
}
```

`accountId` is required by the protocol. For management objects the server resolves it to
the authenticated principal, so pass the id from your session document.

### Create

An account is one primary domain plus optional aliases. The discriminator is `@type: "User"`
(the `x:Account` schema has `User` and `Group` variants). `name` is the local part, `domainId`
is the id of an **existing** `x:Domain` object, and the address `name@domain` is derived by the
server (`emailAddress` is `serverSet`, do not send it). The initial password goes in
`credentials` as a `Password` variant. There is no `emails`, `secrets` or `quota` field:
cross-domain addresses are `aliases`, and size limits are `quotas`.

```jsonc
{
  "using": ["urn:ietf:params:jmap:core"],
  "methodCalls": [
    ["x:Account/set", {
      "accountId": "<management account id>",
      "create": {
        "new-mailbox": {
          "@type": "User",
          "name": "jane",
          "domainId": "<id of an existing Domain>",
          "description": "Jane Doe",
          "credentials": [
            { "@type": "Password", "secret": "correct horse battery staple" }
          ],
          "aliases": [
            { "name": "jane", "domainId": "<id of another Domain>", "enable": true }
          ],
          "roles": { "@type": "User" }
        }
      }
    }, "c0"]
  ]
}
```

The domain must exist first: create it with `x:Domain/set` (`create: { "d1": { "name":
"example.com" } }`) and use the returned id as `domainId`. Each alias carries its own
`domainId`, so one account can hold addresses across several domains
(`server/crates/registry/src/schema/structs.rs:3084-3090`, `:6704-6723`).

The property names are whatever the schema reports, not what this file says. Read them
from `GET /api/schema` before you hard-code anything: the set of fields differs between
server versions, and a field that is missing here fails the create with a property error
rather than being ignored.

### Update

`x:Account/set` `update` maps an existing object id to a patch of changed properties only.

### Delete

`x:Account/set` `destroy` takes an array of ids. It is not reversible and it removes the
mailbox data.

### Reading back

Use `x:Account/get` with `"ids": null` for everything the token may see, or a specific list.

## 4. Partial failure

A single call can create three mailboxes and fail on the fourth. The response is still
`200 OK`. You must read the result object:

- `created` / `updated` / `destroyed` keyed by the call-local id or object id
- `notCreated` / `notUpdated` / `notDestroyed`, each value a JMAP error object with a
  `type` and a `properties` map naming the offending field. For accounts the common types
  are `validationFailed` (missing `name` or `domainId`), `invalidForeignKey` (the `domainId`
  does not name an existing Domain), and `primaryKeyViolation` (an account with that
  `name` already exists in that domain). Note it is `primaryKeyViolation` here, not the
  `alreadyExists` you may know from mail JMAP
  (`server/crates/jmap/src/registry/set.rs:1193-1208`).

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
  -d '{"using":["urn:ietf:params:jmap:core"],"methodCalls":[["x:Domain/get",{"accountId":"relay-admin","ids":null},"c0"]]}'
```

`scripts/api-smoke.sh` wraps this sequence (create, read, update, rotate secret, delete)
with assertions and cleanup, and prints one PASS or FAIL line per step.

## 7a. Where to get an API key

API keys are a credential on an account, managed in the admin panel
(`server/resources/schema/schema_oss.json.gz`, list `x:ApiKey`, "Manage API keys for
programmatic access"):

- For the account you are signed in as: the top-level **Account** section, then
  **Credentials**, then **API Keys**, then Create. Siblings are Password, App Passwords and
  Connected Applications.
- For any user as an admin: **Management** then **Directory** then **Accounts**, open the
  user, and in the **Authentication** section use the **Credentials** field. The credential
  variant labelled "API key for programmatic access" is the API key.

On create you set a description, optional expiry, allowed IPs and the permissions the key
carries; the secret is generated by the server and shown once (`secret` is `serverSet`,
`server/crates/jmap/src/registry/mapping/account.rs:490-516`). Grant the key the
`sysAccount*` permissions from section 2 (plus `sysDomainQuery`) so it can manage mailboxes.
The same object is reachable over the wire as `x:ApiKey/set` for programmatic creation.

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
