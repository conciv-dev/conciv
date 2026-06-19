# @mandarax/publish

Internal release tooling for the aidx monorepo. Not published.

Exposes the `mandarax-publish` CLI (citty), invoked by the root release scripts:

| Root script                  | Command                     | What it does                                          |
| ---------------------------- | --------------------------- | ----------------------------------------------------- |
| `pnpm release:version`       | `mandarax-publish version`  | `changeset version` + lockfile resync                 |
| `pnpm release:check`         | `mandarax-publish check`    | `turbo run build publint attw`                        |
| `pnpm release`               | `mandarax-publish release`  | build + validate, then `changeset publish`            |
| `pnpm release:snapshot beta` | `mandarax-publish snapshot` | prerelease under a dist-tag (e.g. `beta`), not latest |

All commands resolve the workspace root and run `changeset`/`turbo` there via execa,
so they work regardless of the caller's directory.

Each package owns its own publish metadata (`keywords`, `repository`, `homepage`,
`publishConfig`) in its `package.json`. This tool does not manage or enforce it.
