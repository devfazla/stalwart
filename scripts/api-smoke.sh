#!/usr/bin/env bash
#
# SPDX-FileCopyrightText: 2026 devfazla <frchowdhury480@gmail.com>
#
# SPDX-License-Identifier: AGPL-3.0-only
#
# Mailbox lifecycle smoke test against a Relay (Stalwart) server.
#
# Validated with `bash -n` and shellcheck. It has not been run against a live
# server, so read the assertions before trusting a PASS.
# See docs/API.md for the API contract this exercises.

set -euo pipefail

PROG="${0##*/}"
BASE_URL="${STALWART_URL:-https://mail.shopstatesideglobal.com}"
ACCOUNT="${STALWART_ACCOUNT:-}"
TOKEN="${STALWART_TOKEN:-}"
USER_NAME="${STALWART_USER:-}"
PASSWORD="${STALWART_PASSWORD:-}"
DOMAIN="${TEST_DOMAIN:-}"
DRY_RUN=0

CREATED_ID=""
DESTROYED_ID=""
BODY_FILE=""
FAILURES=0

usage() {
  cat <<EOF
Usage: $PROG [options]

Exercises mailbox CRUD over JMAP: session, create, read back, update, rotate
secret, delete. Cleans the throwaway account up even when a step fails.

Environment:
  STALWART_URL       API base URL             (default: $BASE_URL)
  STALWART_USER      principal for Basic auth
  STALWART_PASSWORD  secret for Basic auth
  STALWART_TOKEN     bearer token, used instead of user and password
  STALWART_ACCOUNT   accountId for JMAP calls (default: from the session document)
  TEST_DOMAIN        domain to create the mailbox under (default: first on the server)

Options:
  -n, --dry-run  print the requests instead of sending them
  -h, --help     show this help

Pass secrets through the environment only. Arguments land in the process list.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -n | --dry-run) DRY_RUN=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$DRY_RUN" -eq 0 ] && [ -z "$TOKEN" ] && { [ -z "$USER_NAME" ] || [ -z "$PASSWORD" ]; }; then
  printf 'error: no credentials. Set STALWART_TOKEN, or STALWART_USER and STALWART_PASSWORD.\n' >&2
  exit 2
fi

for tool in curl jq base64; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'error: %s is required but not installed.\n' "$tool" >&2
    exit 127
  fi
done

BODY_FILE="$(mktemp)"

cleanup() {
  local rc=$?
  rm -f "$BODY_FILE"
  if [ -n "$CREATED_ID" ] && [ "$DRY_RUN" -eq 0 ]; then
    printf 'cleanup: destroying throwaway account %s\n' "$CREATED_ID" >&2
    jmap "$(printf '["Account/set",{"accountId":"%s","destroy":["%s"]},"c9"]' "$ACCOUNT" "$CREATED_ID")" >/dev/null 2>&1 || true
  fi
  exit "$rc"
}
trap cleanup EXIT

auth_header() {
  if [ -n "$TOKEN" ]; then
    printf 'Authorization: Bearer %s' "$TOKEN"
  else
    printf 'Authorization: Basic %s' "$(printf '%s' "${USER_NAME}:${PASSWORD}" | base64 | tr -d '\n')"
  fi
}

# request <METHOD> <PATH> [JSON-body] ; echoes the HTTP status, body into $BODY_FILE
request() {
  local method="$1" path="$2" data="${3:-}"
  local url="${BASE_URL%/}${path}"

  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'DRY-RUN %s %s\n' "$method" "$url"
    [ -n "$data" ] && printf '        %s\n' "$data"
    printf '200'
    return 0
  fi

  local args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$url" -H "$(auth_header)" --max-time 30)
  if [ -n "$data" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$data")
  fi
  curl "${args[@]}"
}

body() {
  cat "$BODY_FILE" 2>/dev/null || true
}

# jmap <methodCalls-array> ; echoes the HTTP status
jmap() {
  request POST /jmap "{\"using\":[\"urn:ietf:params:jmap:core\"],\"methodCalls\":[$1]}"
}

# jmap_result <status> <method-name> -> the arguments object of that method's response
jmap_result() {
  jq -c --arg name "$2" '[.methodResponses[]? | select(.[0] == $name)][0][1] // {}' "$(body)" 2>/dev/null || printf '{}'
}

step() {
  local label="$1" ok="$2" status="$3" detail="${4:-}"
  if [ "$ok" = "1" ]; then
    printf 'PASS  %-24s HTTP %s\n' "$label" "$status"
  else
    printf 'FAIL  %-24s HTTP %s %s\n' "$label" "$status" "$detail"
    FAILURES=$((FAILURES + 1))
  fi
}

fail_out() {
  printf 'response: %s\n' "$(body)" >&2
  exit 1
}

SUFFIX="$(date +%s)$$"
MAILBOX="smoke-${SUFFIX}"
SECRET_A="Sm0ke-${SUFFIX}-aaBbCcDd112233"
SECRET_B="Sm0ke-${SUFFIX}-eeFfGgHh445566"

printf 'target:  %s\n' "$BASE_URL"

# 1. Session document, which is where the accountId for later calls comes from.
status="$(request GET /jmap/session)"
if [ "$DRY_RUN" -eq 0 ]; then
  PRIMARY="$(jq -r '.primaryAccounts["urn:ietf:params:jmap:core"] // (.accounts // {} | keys[0]) // empty' "$(body)" 2>/dev/null || true)"
  if [ -z "$ACCOUNT" ]; then
    ACCOUNT="${PRIMARY:-$USER_NAME}"
  fi
  if [ "$status" != "200" ] || [ -z "$ACCOUNT" ]; then
    step 'session' 0 "$status" 'no accountId resolvable from the session; set STALWART_ACCOUNT'
    fail_out
  fi
fi
step 'session' 1 "${DRY_RUN:+$status}"
printf 'account: %s\n' "$ACCOUNT"

# 2. Domain list, unless a domain was supplied.
if [ -z "$DOMAIN" ]; then
  status="$(jmap "$(printf '["Domain/get",{"accountId":"%s","ids":null},"c1"]' "$ACCOUNT")")"
  if [ "$DRY_RUN" -eq 0 ]; then
    DOMAIN="$(jq -r '[.list[]? | select(.type == "domain") | .name][0] // [.list[]? | if type == "string" then . else .name end][0] // empty' "$(jmap_result "$status" Domain/get)")"
    if [ "$status" != "200" ] || [ -z "$DOMAIN" ]; then
      step 'domain list' 0 "$status" 'no domain on this server; set TEST_DOMAIN'
      fail_out
    fi
    step 'domain list' 1 "$status"
  fi
fi
ADDRESS="${MAILBOX}@${DOMAIN}"
printf 'mailbox: %s\n\n' "$ADDRESS"

# 3. Create. A 200 alone means nothing: JMAP reports per-object failure in notCreated.
status="$(jmap "$(printf '["Account/set",{"accountId":"%s","create":{"new0":{"type":"individual","name":"%s","emails":["%s"],"secrets":["%s"]}}},"c2"]' \
  "$ACCOUNT" "$MAILBOX" "$ADDRESS" "$SECRET_A")")"
if [ "$DRY_RUN" -eq 0 ]; then
  result="$(jmap_result "$status" Account/set)"
  if [ "$status" = "200" ] && [ "$(jq -r '.created // {} | length' <<<"$result")" != "0" ] &&
    [ "$(jq -r '.notCreated // {} | length' <<<"$result")" = "0" ]; then
    step 'create' 1 "$status"
  else
    step 'create' 0 "$status" "$(jq -c '.notCreated // .' <<<"$result")"
    exit 1
  fi
fi

# 4. Read back, and take the id from the listing rather than from the set response,
#    whose shape differs between object types.
status="$(jmap "$(printf '["Account/get",{"accountId":"%s","ids":null,"properties":["name","emails","quota","type"]},"c3"]' "$ACCOUNT")")"
if [ "$DRY_RUN" -eq 0 ]; then
  CREATED_ID="$(jq -r --arg name "$MAILBOX" \
    '[.list[]? | select((.name // .accountName) == $name)][0] | (.id // .name // empty)' \
    "$(jmap_result "$status" Account/get)")"
  if [ "$status" != "200" ] || [ -z "$CREATED_ID" ] || [ "$CREATED_ID" = "null" ]; then
    step 'read back' 0 "$status" "$MAILBOX not present in Account/get after create"
    exit 1
  fi
  step 'read back' 1 "$status"
fi

# 5. Update a property.
target="${CREATED_ID:-$MAILBOX}"
status="$(jmap "$(printf '["Account/set",{"accountId":"%s","update":{"%s":{"quota":1073741824}}},"c4"]' "$ACCOUNT" "$target")")"
if [ "$DRY_RUN" -eq 0 ]; then
  result="$(jmap_result "$status" Account/set)"
  if [ "$status" = "200" ] && [ "$(jq -r '.notUpdated // {} | length' <<<"$result")" = "0" ]; then
    step 'update quota' 1 "$status"
  else
    step 'update quota' 0 "$status" "$(jq -c '.notUpdated // .' <<<"$result")"
    FAILURES=$((FAILURES + 1))
  fi
fi

# 6. Rotate the secret.
status="$(jmap "$(printf '["Account/set",{"accountId":"%s","update":{"%s":{"secrets":["%s"]}}},"c5"]' "$ACCOUNT" "$target" "$SECRET_B")")"
if [ "$DRY_RUN" -eq 0 ]; then
  result="$(jmap_result "$status" Account/set)"
  if [ "$status" = "200" ] && [ "$(jq -r '.notUpdated // {} | length' <<<"$result")" = "0" ]; then
    step 'rotate secret' 1 "$status"
  else
    step 'rotate secret' 0 "$status" "$(jq -c '.notUpdated // .' <<<"$result")"
    FAILURES=$((FAILURES + 1))
  fi
fi

# 7. Delete, then confirm the id really is gone.
DESTROYED_ID="$target"
status="$(jmap "$(printf '["Account/set",{"accountId":"%s","destroy":["%s"]},"c6"]' "$ACCOUNT" "$DESTROYED_ID")")"
if [ "$DRY_RUN" -eq 0 ]; then
  result="$(jmap_result "$status" Account/set)"
  if [ "$status" = "200" ] && [ "$(jq -r '.notDestroyed // {} | length' <<<"$result")" = "0" ]; then
    step 'destroy' 1 "$status"
    CREATED_ID=""
  else
    step 'destroy' 0 "$status" "$(jq -c '.notDestroyed // .' <<<"$result")"
    FAILURES=$((FAILURES + 1))
  fi

  status="$(jmap "$(printf '["Account/get",{"accountId":"%s","ids":["%s"]},"c7"]' "$ACCOUNT" "$DESTROYED_ID")")"
  result="$(jmap_result "$status" Account/get)"
  if [ "$status" = "200" ] && [ "$(jq -r '.notFound // [] | length' <<<"$result")" != "0" ]; then
    step 'gone after destroy' 1 "$status"
  else
    step 'gone after destroy' 0 "$status" "$(jq -c '{list,notFound}' <<<"$result")"
    FAILURES=$((FAILURES + 1))
  fi
fi

if [ "$FAILURES" -gt 0 ]; then
  printf '\n%s step(s) failed.\n' "$FAILURES" >&2
  exit 1
fi
printf '\nall steps passed.\n'
