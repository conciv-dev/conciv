# TrailBase `trail` API contract (characterized against v0.22.9, real binary)

Probed live on 2026-06-21 against `trail v0.22.9-0-g3e16021` (sqlite 3.51.1) at `~/.local/bin/trail`.
Every fact below was observed from the running binary, not docs. Where the docs site disagrees, the
binary wins (the docs track a newer build).

## Spawn + readiness

```
trail --data-dir <DATA_DIR> run -a localhost:<PORT> --stderr-logging --cors-allowed-origins ''
```

- Readiness signal (stderr): `Listening on http://localhost:<PORT> 🚀 (Admin UI …)`. Match `/Listening on/`.
- `--cors-allowed-origins ''` — default is **"allow any origin"** (logged: `CORS: allow any origin`).
  Must be locked; trail binds loopback and core is the sole client, so empty/none is correct.
- On first boot trail creates a default admin user and logs a random password
  (`Created new admin user: email 'admin@localhost' password '<random>'`). Not needed for anon CRUD on
  loopback; the supervisor should capture/suppress that log line. Capture it only if we ever need the
  authenticated subscribe endpoint (we do not — see Realtime).

## Data dir layout

- `<DATA_DIR>/data/main.db` — the real SQLite db (also `data/logs.db`).
- `<DATA_DIR>/migrations/main/U####__<name>.sql` — applied **on boot**, in filename order. No separate
  migrate command. trail's own `V1__initial`/`U2__file_deletions`/`U3__user_id` migrations run first.
- `<DATA_DIR>/config.textproto` — required; if absent trail writes a default and runs with it.

## config.textproto (required skeleton + record_apis)

A bare `record_apis: [...]` alone fails with `Config(Invalid("Missing application name"))`. The full
minimal valid config:

```textproto
email {}
server { application_name: "conciv" logs_retention_sec: 604800 }
auth { auth_token_ttl_sec: 3600 refresh_token_ttl_sec: 2592000 }
jobs {}
record_apis: [
  { name: "<api>" table_name: "<table>" conflict_resolution: REPLACE acl_world: [READ, CREATE, UPDATE, DELETE] }
]
```

- `acl_world: [READ, CREATE, UPDATE, DELETE]` → **anonymous CRUD works on loopback** (no token). Verified.
- `conflict_resolution: REPLACE` → upsert-on-conflict (matches our optimistic upsert-by-pk model).

## Tables backing a Record API — hard requirement

**The PK must be an INTEGER or a UUIDv7 BLOB.** A `TEXT PRIMARY KEY` is rejected:
`Config(Invalid("Table for api '<x>' is missing valid integer/UUID primary key column."))`.

UUID PK pattern (verified working):

```sql
CREATE TABLE <t> (
  id BLOB PRIMARY KEY NOT NULL CHECK (is_uuid_v7(id)) DEFAULT (uuid_v7()),
  ...
) STRICT;
```

- Use **column** PK constraints, not a table constraint (`PRIMARY KEY (id)` logs
  `PK table constraint not implemented. Use column constraints.`).
- `STRICT` tables and `fts5` virtual tables both load fine.

## Record API endpoints (verified shapes)

Base: `/api/records/v1/<name>`.

| Op     | Method + path                        | Request                    | Response (observed)                                        |
| ------ | ------------------------------------ | -------------------------- | ---------------------------------------------------------- |
| Create | `POST /api/records/v1/<name>`        | JSON row                   | `{"ids":["<base64url>"]}` — **the new id(s), NOT the row** |
| List   | `GET /api/records/v1/<name>?…`       | query params               | `{"cursor":"<b64>","records":[{…}]}`                       |
| Read   | `GET /api/records/v1/<name>/<id>`    | —                          | the row object                                             |
| Update | `PATCH /api/records/v1/<name>/<id>`  | JSON patch                 | (success)                                                  |
| Delete | `DELETE /api/records/v1/<name>/<id>` | —                          | (success)                                                  |
| Query  | `POST /api/records/v1/<name>/query`  | `{filter,sort,limit}` JSON | `{records}` (body-based filter alt to query params)        |

### List query params (verified + from docs)

- `limit` (default 50, max 1024), `cursor` (PK cursor), `offset`, `count=true` (adds total), `order=[+-]col,…`.
- `filter[<col>][<op>]=<v>` — ops: `$eq`(default) `$ne` `$gte` `$gt` `$lte` `$lt` `$is` `$like` `$re` `$contains` (+ geo `@within`/`@intersects`).
- **No FTS query param.** `?fts=term` does NOT filter (returned all rows). For text search use
  `filter[<col>][$like]=%term%` or `[$contains]`. A ranked FTS5 search, if needed later, is exposed by
  creating a `VIEW` over the fts table and declaring it as its own Record API.

### UUID representation — IMPORTANT for the commentId join

- UUID columns serialize in JSON as **base64url of the 16 raw bytes** (e.g. `AYkKXayWd0u8zrMCCZqAVw==`),
  not a hex string.
- On **create**, a client-provided id is accepted as either a hex UUID string (`01890a5d-ac96-77…`) or
  presumably base64; it is stored verbatim. Reads accept the hex string in the URL path too.
- **Design resolution:** do NOT make our join key trail's blob PK. Give comment tables a separate
  `cid TEXT NOT NULL UNIQUE` column = the client-generated UUID (hex), and let the uuid_v7 BLOB `id`
  PK be incidental/server-generated. Join the Yjs pin and the row by `cid`; filter by
  `filter[cid][$eq]=<hex>`. No base64 conversion anywhere in our code.

## Realtime — works anon with `enable_subscriptions: true` (no auth)

- The 403 was a **missing config flag**, NOT auth. Add `enable_subscriptions: true` to the record_api.
- With the flag, `GET /api/records/v1/<name>/subscribe/*` returns **200 `text/event-stream`**
  anonymously and opens with `: subscription established`, then streams change events. Verified.
- This unlocks using TanStack DB's **native** `@tanstack/trailbase-db-collection` adapter, which drives
  realtime via this endpoint — so we do NOT hand-roll a custom sync adapter.

## Architecture consequence — native adapter + core as a gated trail proxy

The browser uses `@tanstack/db` + `@tanstack/trailbase-db-collection` + the `trailbase` client
(`initClient(url).records('<name>')`). To keep "browser never talks to trail directly", `url` points at
**core**, which **reverse-proxies trail's Record API + subscribe SSE on loopback**, applying the
`api/cors.ts` gate (Origin allowlist + Host loopback + session token). Core remains the only process
that opens a socket to trail. Two server-side uses of trail, both via core:

1. **Browser sync/optimistic/realtime** → native adapter → core proxy → trail (anon, acl_world + subs).
2. **Agent/tool/CLI writes** → core's own trail Record-API client (server side) → trail.

Both land in the same SQLite db; trail realtime (proxied) fans changes back to every browser
collection. No custom adapter, no core-side fan-out bus needed for comments.

Open item to confirm during the TanStack characterization spike: that the `trailbase` `initClient`
works **anonymously** (no login) against an acl_world API, and that core can proxy its Record API +
subscribe SSE transparently (path shape `/api/records/v1/*`).

## Implications for `mx.db` (core)

- `createLiveDb` emits one migration per collection (UUID-PK + `cid TEXT UNIQUE` + columns + optional
  fts5 + sync triggers) and rewrites `config.textproto` declaring each collection's Record API; the
  supervisor must be started **after** all `collection()` declarations so boot applies them.
- `ServerCollection.insert`: POST the row (with a client `cid`), then either READ-back by `cid` or
  return the input merged with the created id — CREATE only returns `{ids}`.
- `ServerCollection.query({search})` → `filter[<searchCol>][$like]=%search%`; equality filters →
  `filter[col][$eq]=v`; unwrap `{records}`.
- Live fan-out: each mutation method emits `{op, cid, row}` to an in-process per-collection emitter;
  the gated SSE route (Plan: browser layer) broadcasts it. No trail subscribe.
- Cold start: spawn → wait `Listening on` → (migrations already applied on boot) → ready.
