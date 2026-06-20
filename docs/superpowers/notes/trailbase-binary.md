# TrailBase `trail` binary — supervisor + migration contract

Phase 0 ground truth for the canvas-comments comment store. All commands below were run for real and verified.

## Version (verified)

```
$ trail --version
trail v0.22.9-0-g3e16021 (2026-01-10)
sqlite: 3.51.1
```

Installed at `~/.local/bin/trail` (on PATH). It is a **user-installed PATH binary**, never an npm dep — core spawns + supervises it like the `claude` harness binary. Reinstall/upgrade is out-of-band (the project does not ship it).

System `sqlite3` CLI is also present (3.51.0) — used by ITs to inspect the db directly.

## How core will spawn it (Phase 4 supervisor contract)

```
trail --data-dir <DATA_DIR> run -a localhost:<PORT> --stderr-logging [--cors-allowed-origins <origin>]
```

- `--data-dir <DATA_DIR>` — runtime root. Created if missing. **The real SQLite db lands at `<DATA_DIR>/data/main.db`** (plus `<DATA_DIR>/data/logs.db`). This is a delta from the spec's `<cwd>/.mandarax/comments.db`: point `DATA_DIR` at `<cwd>/.mandarax/comments/` so the inspectable db is `<cwd>/.mandarax/comments/data/main.db`.
- `-a localhost:<PORT>` — binds loopback only (good: matches the security model; core is the sole client).
- `--stderr-logging` — logs to stderr so the supervisor pipes them into `harness-logger`.
- `--cors-allowed-origins` — **defaults to `*`**. Phase 4 must set it to nothing/loopback (the browser never talks to trail directly; core fronts it), and/or rely on loopback binding. Do not leave `*` exposed.
- On first boot it auto-creates `config.textproto`, a default admin user (printed to the log), and `data/`. The supervisor should capture/suppress the admin-credential log line.

## Migrations (verified — applied on boot)

- `trail --data-dir <DATA_DIR> migration <suffix>` scaffolds `<DATA_DIR>/migrations/main/U<timestamp>__<suffix>.sql` (empty `-- new database migration`).
- Plain SQL migration files in `<DATA_DIR>/migrations/main/` are **applied automatically when `trail run` boots**. No separate "migrate" command needed — boot is the migration step in the cold-start order.
- `STRICT` tables and `fts5` virtual tables both work. Verified: created `comments_smoke` + `comments_smoke_fts`, `MATCH 'anchored'` returned the row.

## Smoke test (reproducible, what was run)

```sql
-- <DATA_DIR>/migrations/main/U<ts>__create_comments_smoke.sql
CREATE TABLE comments_smoke (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL) STRICT;
CREATE VIRTUAL TABLE comments_smoke_fts USING fts5(body, content='comments_smoke', content_rowid='rowid');
INSERT INTO comments_smoke (id, body) VALUES ('smoke-1', 'hello anchored comment');
INSERT INTO comments_smoke_fts (rowid, body) SELECT rowid, body FROM comments_smoke;
```

```
$ trail --data-dir . run -a localhost:4099 --stderr-logging &   # applies migration on boot, creates data/main.db
$ sqlite3 data/main.db "SELECT id FROM comments_smoke WHERE rowid IN
    (SELECT rowid FROM comments_smoke_fts WHERE comments_smoke_fts MATCH 'anchored');"
smoke-1
```

## Phase 4 implications

- Cold-start order (spec): spawn `trail` → wait for the `Listening on http://localhost:<PORT>` log line (readiness signal) → migrations already applied on boot → open core's gated comment endpoint → browser syncs.
- The comment store's real client path is core ↔ trail over HTTP (Record APIs) on loopback; ITs may additionally assert against `data/main.db` via the `sqlite3` CLI for durability checks.
- Supervisor restarts trail on crash; browser stays in degraded local-only mode meanwhile.
