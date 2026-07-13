# Plan 020: Per-message image files are written outside the user's project and cleaned up

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 70ab4e57..HEAD -- packages/harness/src/claude/chat.ts`
> If that file changed since this plan was written, compare the "Current state" excerpt against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (also security-hygiene)
- **Planned at**: commit `70ab4e57`, 2026-07-13

## Why this matters

When a user attaches an image to a chat turn, the Claude harness adapter decodes the base64 and writes it to a file **inside the user's project working directory** (`cwd`), then references it to the CLI via `@path`. Nothing ever deletes these files. So every image-bearing turn drops a `.conciv-img-<uuid>.<ext>` file into the repo the developer is working on; they accumulate indefinitely and can be swept into `git add`/commits (they live under `cwd`, not a temp dir). It also writes attacker-influenceable bytes (client-supplied base64) into the source tree. The fix: write these temp files under the OS temp dir with an absolute `@` reference (the Claude CLI accepts absolute `@` paths), and best-effort clean them up after the turn. This removes both the repo-pollution and the untrusted-bytes-in-source-tree problems in one change.

## Current state

- `packages/harness/src/claude/chat.ts:20-29` — `imageRefs`, current code:

```ts
export function imageRefs(images: HarnessImage[], cwd: string): string {
  return images
    .map((img) => {
      const ext = IMAGE_EXT[img.mediaType] ?? 'png'
      const path = join(cwd, `.conciv-img-${randomUUID()}.${ext}`)
      writeFileSync(path, Buffer.from(img.dataBase64, 'base64'))
      return `@${path}`
    })
    .join(' ')
}
```

- It is called from `withImageRefs(messages, cwd)` (`chat.ts:43-55`), which is used in `prepareMessages` of `claudeChatConfig` (`chat.ts:67-68`):

```ts
prepareMessages: (messages) =>
  deps.kind === 'compact' ? withLastUserText(messages, '/compact') : withImageRefs(messages, deps.cwd),
```

- Imports at the top of `chat.ts` currently include `import {writeFileSync} from 'node:fs'` and `import {join} from 'node:path'`. There is **no** `os` import yet.
- The `IMAGE_EXT` map (`chat.ts:13-18`) maps media types to extensions; `HarnessImage` has `{mediaType, dataBase64}`.

Why tmpdir works: the Claude CLI resolves `@<absolute-path>` references regardless of location, and `deps.cwd` already gets `addDirs: [deps.cwd]` — but an absolute temp path is passed by value in the prompt text, so it does not need to be inside an added dir. (If, during testing, the CLI rejects an out-of-cwd `@` path, see STOP conditions — fall back to a gitignored subdir of cwd, e.g. `.conciv/img/`, and add cleanup there instead.)

### Repo conventions to follow

- Functions, not classes. No comments. No `any`/`as`. oxfmt style (no semicolons, single quotes, printWidth 120).
- `@conciv/harness` tests: check `packages/harness/test/` for the existing `claude` tests (e.g. `claude-adapter.test.ts`, `claude-chat-config.test.ts`) and match their layout.

## Commands you will need

| Purpose             | Command                                                     | Expected on success    |
| ------------------- | ----------------------------------------------------------- | ---------------------- |
| Typecheck (harness) | `pnpm exec turbo run typecheck --filter=@conciv/harness`    | exit 0                 |
| Test (harness)      | `pnpm exec turbo run test --filter=@conciv/harness`         | all pass               |
| Lint (harness)      | `pnpm exec turbo run lint --filter=@conciv/harness`         | exit 0                 |
| Fallow              | `pnpm exec fallow audit --changed-since main --format json` | no INTRODUCED findings |

## Scope

**In scope**:

- `packages/harness/src/claude/chat.ts` (`imageRefs`, its imports, and a small cleanup helper)
- A test in `packages/harness/test/` (new file `image-refs.test.ts`, or extend an existing claude test if one already covers `imageRefs`).

**Out of scope**:

- `withImageRefs`/`withLastUserText`/`claudeChatConfig` shape — only the _destination_ of the file and cleanup change; the returned `@ref` string contract stays the same.
- The MCP/executable/system-prompt logic in the same file.
- Any change to how images arrive over the wire (`HarnessImage`, protocol types).
- Other harness adapters (codex/gemini/opencode) — they don't write image files.

## Git workflow

- Branch: `advisor/020-image-temp-files-out-of-cwd`
- Commit style: `fix(harness): write chat image temp files to os tmpdir, not the project cwd`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Write image files under the OS temp dir

Edit `packages/harness/src/claude/chat.ts`:

1. Add `import {tmpdir} from 'node:os'` to the imports.
2. Change `imageRefs` to write to a per-process temp subdir instead of `cwd`. The `cwd` parameter becomes unused for the path — but keep the function signature (`imageRefs(images, cwd)`) unchanged to avoid touching `withImageRefs`, OR drop the `cwd` param if you also update the single call site in `withImageRefs`; prefer dropping it since the value is now unused (a lint/fallow "unused param" finding would otherwise appear). If you drop it, update `withImageRefs` line 46 from `imageRefs(images, cwd)` to `imageRefs(images)`.

Target shape:

```ts
import {tmpdir} from 'node:os'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'

export function imageRefs(images: HarnessImage[]): string {
  if (!images.length) return ''
  const dir = mkdtempSync(join(tmpdir(), 'conciv-img-'))
  return images
    .map((img, index) => {
      const ext = IMAGE_EXT[img.mediaType] ?? 'png'
      const path = join(dir, `${index}.${ext}`)
      writeFileSync(path, Buffer.from(img.dataBase64, 'base64'))
      return `@${path}`
    })
    .join(' ')
}
```

Using one `mkdtempSync` dir per call groups a turn's images and makes cleanup a single `rm -rf` of the dir.

**Verify**: `pnpm exec turbo run typecheck --filter=@conciv/harness` → exit 0.

### Step 2: Confirm the absolute `@ref` reaches the CLI

The file no longer lands in `cwd`, so confirm the prompt still references it correctly. This is verified by the unit test (Step 3) asserting the returned string is `@/…/conciv-img-…/0.png` (absolute, under tmpdir). No runtime CLI change is needed — the `@ref` is passed as text.

If you have a live dev environment: run `pnpm dev`, attach an image in the widget, and confirm (a) the agent sees the image and (b) no `.conciv-img-*` file appears in the repo root (`git status` stays clean of image files). This is the "feel check"; the unit test is the gate.

**Verify**: no `.conciv-img-*` anywhere under the repo after an image turn: `git status --porcelain | grep conciv-img` → empty.

### Step 3: Add a unit test for `imageRefs`

Create `packages/harness/test/image-refs.test.ts` (or extend an existing claude test). Cases:

- Empty input → returns `''`.
- One PNG image → returns a single `@<abs>` ref whose path starts with the OS tmpdir and ends `.png`, and the file exists on disk with the decoded bytes.
- Two images → two space-separated refs under the same temp dir.
- Unknown media type → defaults to `.png` extension (matches `IMAGE_EXT[...] ?? 'png'`).

Read the bytes back (`readFileSync`) and assert they equal `Buffer.from(base64, 'base64')`. Use a tiny known base64 (e.g. a 1×1 PNG or just arbitrary bytes) — do not embed real image files.

**Verify**: `pnpm exec turbo run test --filter=@conciv/harness` → all pass including the new file.

### Step 4: Lint + fallow

**Verify**:

- `pnpm exec turbo run lint --filter=@conciv/harness` → exit 0 (no unused-param finding for the dropped `cwd`)
- `pnpm exec fallow audit --changed-since main --format json` → no INTRODUCED findings

## Test plan

- File: `packages/harness/test/image-refs.test.ts` (new).
- Cases: empty, single PNG (path under tmpdir, correct bytes), two images, unknown-mediaType fallback.
- Structural pattern: model imports/`describe` after an existing `packages/harness/test/claude-*.test.ts`.
- Verification: `pnpm exec turbo run test --filter=@conciv/harness` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm exec turbo run typecheck lint test --filter=@conciv/harness` exits 0
- [ ] `grep -n "join(cwd" packages/harness/src/claude/chat.ts` returns nothing for the image path (it no longer writes under `cwd`)
- [ ] `grep -n "tmpdir" packages/harness/src/claude/chat.ts` shows the temp-dir write
- [ ] The `imageRefs` test asserts the returned ref is absolute and under the OS temp dir, and the file bytes round-trip
- [ ] `pnpm exec fallow audit --changed-since main --format json` reports no INTRODUCED findings
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `imageRefs`/`withImageRefs` don't match the "Current state" excerpts (drift).
- In a live test the Claude CLI refuses an out-of-cwd `@` path (agent says it can't find/read the image). In that case, fall back to writing under a **gitignored** subdir of `cwd` (e.g. `join(cwd, '.conciv', 'img')`) AND add that path to the repo's ignore handling — but report this outcome first, because the "pollution" concern then shifts to "ensure it's ignored + cleaned", which is a design decision for the maintainer.
- Dropping the `cwd` param cascades into more call sites than the single one in `withImageRefs` — report the extra callers rather than editing widely.

## Maintenance notes

- Cleanup: this plan writes to `mkdtempSync` dirs under the OS temp root, which the OS reclaims, so an explicit unlink is optional. If turn-scoped cleanup is later wanted, the hook is `startRun`'s `finally` in `packages/core/src/chat/run.ts:167-173` (which already runs `deps.onRunEnd`) — but the harness adapter, not core, owns the temp path, so passing the paths up would require a contract change. Deferred intentionally; OS temp reclamation is sufficient for the pollution fix.
- A reviewer should confirm no code path writes image bytes under the project `cwd` anymore, and that `HarnessImage` payload size isn't trusted unbounded (a separate hardening item — not in this plan).
- If a future harness also accepts images, it must follow this same tmpdir pattern rather than writing to `cwd`.
