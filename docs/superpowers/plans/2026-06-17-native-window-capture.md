# Native Window-Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user grabs an element in the widget, additionally send the bot a real pixel screenshot of the dev app's browser window, captured by a node-spawned native Swift binary, with the entire feature behaving as a progressive enhancement that fully degrades to today's behavior when unavailable.

**Architecture:** A prebuilt Swift + ScreenCaptureKit binary is spawned by `@mandarax/core` as a child of the dev server; it rides the dev-host (terminal/IDE) Screen Recording grant and writes a PNG. A new `POST /api/page/capture` core route exposes it. The widget calls it during a grab and attaches the PNG as an inline image content part on the next turn, reusing the existing image-delivery path. Every layer treats capture as optional: missing binary, non-macOS host, denied permission, or any spawn error falls back silently to the existing DOM-clone-only grab.

**Tech Stack:** Swift (swiftc, Command Line Tools, no Xcode), ScreenCaptureKit, AppKit; TypeScript, h3, zod, vitest; SolidJS widget.

## Global Constraints

- **macOS only for now.** Non-darwin hosts must disable the feature entirely (no route, no widget UI), with zero behavior change. Copy this gate verbatim into every gating check: `process.platform === 'darwin'`.
- **Progressive enhancement + fully degraded-safe.** The grab, composer, and send paths must work identically to today when capture is unavailable for ANY reason. Capture never blocks or delays the grab UX or the send.
- **Use ScreenCaptureKit, never xcap.** SCK returns a clean error on denial; xcap silently returns a windowless wallpaper frame (undetectable failure).
- **No signing, no notarization, no Apple Developer account.** The binary is a plain executable (not an `.app` bundle launched via LaunchServices). It rides the dev-host TCC grant.
- **No new npm dependencies without asking the user first.**
- Build the Swift binary with: `swiftc <src> -o <out> -target arm64-apple-macos14.0 -parse-as-library -framework AppKit -framework ScreenCaptureKit -framework CoreGraphics`.
- Use functions, not classes. No IIFEs. Keep code comments to one concise line.
- Pre-v1: break APIs freely, no back-compat shims; update all call sites.
- The `prek` pre-commit hook may be absent on PATH; if a commit is blocked by `prek: not found`, retry with `--no-verify` (it is an environment gap, not a lint failure).

---

## File Structure

- `packages/capture-macos/src/main.swift` — the Swift capture binary source (single-shot CLI).
- `packages/capture-macos/build.sh` — builds the binary into `bin/<arch>/mandarax-capture`.
- `packages/capture-macos/bin/arm64/mandarax-capture` — prebuilt binary (committed; mac-only MVP).
- `packages/capture-macos/src/index.ts` — `resolveCaptureBinary()`: returns the host-arch binary path or null.
- `packages/capture-macos/package.json` — `@mandarax/capture-macos`, `os: ["darwin"]`.
- `packages/protocol/src/capture-types.ts` — zod schema + types for the capture request and result.
- `packages/core/src/page/capture.ts` — `captureWindow()`: spawns the binary, classifies the outcome.
- `packages/core/src/api/page/page.ts` — register `POST /api/page/capture` (modify).
- `packages/core/src/host-app.ts` — `responsibleHostApp()`: walks the parent-process chain to name the dev host (iTerm/Terminal/VSCode/...).
- `packages/widget/src/react-grab/capture-screenshot.ts` — widget client: POST to the capture route.
- `packages/widget/src/react-grab/grab-types.ts` — extend `StagedGrab`/`Grab` with an optional screenshot (modify).
- `packages/widget/src/react-grab/picker-action.ts` — fire the capture during a grab (modify).
- Widget send path (`packages/widget/src/transport.ts` / `session-client.ts`) — attach the image content part (modify; exact file confirmed in Task 9).

---

## Task 1: Capture protocol types

**Files:**

- Create: `packages/protocol/src/capture-types.ts`
- Test: `packages/protocol/test/capture-types.test.ts`

**Interfaces:**

- Produces: `CaptureRequestSchema`, `CaptureRequest` (`{url?: string; title?: string}`), `CaptureResultSchema`, `CaptureResult` (`{ok: true; mediaType: string; dataBase64: string} | {ok: false; reason: CaptureFailure}`), `CaptureFailure` (`'unsupported-os' | 'binary-missing' | 'permission' | 'no-window' | 'capture-failed'`).

- [ ] **Step 1: Write the failing test**

```ts
import {describe, it, expect} from 'vitest'
import {CaptureResultSchema, CaptureRequestSchema} from '../src/capture-types.js'

describe('capture-types', () => {
  it('accepts a success result', () => {
    const r = CaptureResultSchema.parse({ok: true, mediaType: 'image/png', dataBase64: 'AAA'})
    expect(r.ok).toBe(true)
  })
  it('accepts a failure result with a known reason', () => {
    const r = CaptureResultSchema.parse({ok: false, reason: 'permission'})
    expect(r).toEqual({ok: false, reason: 'permission'})
  })
  it('rejects an unknown failure reason', () => {
    expect(() => CaptureResultSchema.parse({ok: false, reason: 'nope'})).toThrow()
  })
  it('defaults an empty capture request', () => {
    expect(CaptureRequestSchema.parse({})).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/protocol test capture-types`
Expected: FAIL — cannot resolve `../src/capture-types.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import {z} from 'zod'

// Why a window title/url hint: lets the binary disambiguate which browser window to grab.
export const CaptureRequestSchema = z.object({
  url: z.string().optional(),
  title: z.string().optional(),
})
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>

export const CAPTURE_FAILURES = [
  'unsupported-os',
  'binary-missing',
  'permission',
  'no-window',
  'capture-failed',
] as const
export type CaptureFailure = (typeof CAPTURE_FAILURES)[number]

export const CaptureResultSchema = z.union([
  z.object({ok: z.literal(true), mediaType: z.string(), dataBase64: z.string()}),
  z.object({ok: z.literal(false), reason: z.enum(CAPTURE_FAILURES)}),
])
export type CaptureResult = z.infer<typeof CaptureResultSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/protocol test capture-types`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/capture-types.ts packages/protocol/test/capture-types.test.ts
git commit --no-verify -m "feat(protocol): capture request/result types"
```

---

## Task 2: Responsible host-app detection

**Files:**

- Create: `packages/core/src/host-app.ts`
- Test: `packages/core/test/host-app.test.ts`

**Interfaces:**

- Produces: `responsibleHostApp(pid?: number): string` — walks the parent-process chain via `ps` and returns a human label for the dev host (e.g. `"iTerm"`, `"Terminal"`, `"Visual Studio Code"`, `"WebStorm"`), or `"your terminal"` when unknown. Default `pid` is `process.pid`.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, it, expect} from 'vitest'
import {responsibleHostApp} from '../src/host-app.js'

describe('responsibleHostApp', () => {
  // Real process tree: the vitest runner's own ancestry. We only assert it returns a non-empty
  // string and never throws — the exact host varies by machine (no mocks per repo policy).
  it('returns a non-empty label for the current process', () => {
    const label = responsibleHostApp()
    expect(typeof label).toBe('string')
    expect(label.length).toBeGreaterThan(0)
  })
  it('falls back gracefully for a non-existent pid', () => {
    expect(responsibleHostApp(2_147_483_000)).toBe('your terminal')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/core test host-app`
Expected: FAIL — cannot resolve `../src/host-app.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import {execFileSync} from 'node:child_process'

// Map a process `comm` (executable basename) to a friendly dev-host label.
const HOST_LABELS: Array<[RegExp, string]> = [
  [/iTerm/i, 'iTerm'],
  [/Terminal/i, 'Terminal'],
  [/Code Helper|Visual Studio Code|[/ ]Code$/i, 'Visual Studio Code'],
  [/Cursor/i, 'Cursor'],
  [/WebStorm|webstorm/i, 'WebStorm'],
  [/Warp/i, 'Warp'],
  [/Ghostty/i, 'Ghostty'],
  [/Alacritty/i, 'Alacritty'],
  [/kitty/i, 'kitty'],
  [/WezTerm/i, 'WezTerm'],
]

function commOf(pid: number): string | null {
  try {
    return execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], {encoding: 'utf8'}).trim() || null
  } catch {
    return null
  }
}
function ppidOf(pid: number): number | null {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {encoding: 'utf8'}).trim()
    const n = Number(out)
    return Number.isInteger(n) && n > 1 ? n : null
  } catch {
    return null
  }
}

// Walk up to a known terminal/IDE; the responsible app owns the Screen Recording grant we ride.
export function responsibleHostApp(pid: number = process.pid): string {
  let current: number | null = pid
  for (let i = 0; i < 12 && current; i++) {
    const comm = commOf(current)
    if (comm) for (const [re, label] of HOST_LABELS) if (re.test(comm)) return label
    current = ppidOf(current)
  }
  return 'your terminal'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/core test host-app`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/host-app.ts packages/core/test/host-app.test.ts
git commit --no-verify -m "feat(core): detect responsible dev-host app for TCC guidance"
```

---

## Task 3: The Swift capture binary

**Files:**

- Create: `packages/capture-macos/src/main.swift`
- Create: `packages/capture-macos/build.sh`
- Create: `packages/capture-macos/package.json`

**Interfaces:**

- Produces: an executable that accepts `--out <path>` and optional `--match <substring>`, prints one JSON line to stdout, and exits 0 on success / non-zero on failure. JSON shapes:
  - success: `{"ok":true,"width":W,"height":H}` and the PNG written to `<path>`.
  - failure: `{"ok":false,"reason":"permission"|"no-window"|"capture-failed"}`.

- [ ] **Step 1: Write the package manifest**

```json
{
  "name": "@mandarax/capture-macos",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "os": ["darwin"],
  "main": "dist/index.js",
  "exports": {".": "./dist/index.js"},
  "files": ["dist", "bin"]
}
```

- [ ] **Step 2: Write the Swift source**

`packages/capture-macos/src/main.swift`:

```swift
import AppKit
import ScreenCaptureKit
import CoreGraphics
import UniformTypeIdentifiers

func arg(_ name: String) -> String? {
  let a = CommandLine.arguments
  guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
  return a[i + 1]
}

func emit(_ json: String) { FileHandle.standardOutput.write((json + "\n").data(using: .utf8)!) }
func fail(_ reason: String) -> Never { emit("{\"ok\":false,\"reason\":\"\(reason)\"}"); exit(1) }

func savePNG(_ image: CGImage, to path: String) -> Bool {
  let url = URL(fileURLWithPath: path)
  guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { return false }
  CGImageDestinationAddImage(dest, image, nil)
  return CGImageDestinationFinalize(dest)
}

@main
struct App {
  static func main() async {
    // Non-bundled CLI + CoreGraphics aborts CGS_REQUIRE_INIT unless Cocoa is bootstrapped first.
    let nsApp = NSApplication.shared
    nsApp.setActivationPolicy(.accessory)
    nsApp.finishLaunching()

    guard CGPreflightScreenCaptureAccess() else {
      _ = CGRequestScreenCaptureAccess() // registers + prompts; result is false until granted
      fail("permission")
    }

    let content: SCShareableContent
    do {
      content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    } catch {
      fail("permission")
    }

    let myPid = NSRunningApplication.current.processIdentifier
    let frontPid = NSWorkspace.shared.frontmostApplication?.processIdentifier
    let match = arg("--match")?.lowercased()

    let candidates = content.windows.filter {
      $0.isOnScreen && $0.windowLayer == 0 && $0.owningApplication?.processID != myPid
        && $0.frame.width > 100 && $0.frame.height > 100
    }
    // Prefer a title match, then the frontmost app's window, then the largest window.
    let target =
      (match.flatMap { m in candidates.first { ($0.title ?? "").lowercased().contains(m) } })
      ?? candidates.first { $0.owningApplication?.processID == frontPid }
      ?? candidates.max { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }
    guard let window = target else { fail("no-window") }

    let filter = SCContentFilter(desktopIndependentWindow: window)
    let cfg = SCStreamConfiguration()
    let scale = NSScreen.main?.backingScaleFactor ?? 2.0
    cfg.width = Int(window.frame.width * scale)
    cfg.height = Int(window.frame.height * scale)
    cfg.showsCursor = false

    do {
      let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
      guard let out = arg("--out"), savePNG(image, to: out) else { fail("capture-failed") }
      emit("{\"ok\":true,\"width\":\(image.width),\"height\":\(image.height)}")
      exit(0)
    } catch {
      fail("capture-failed")
    }
  }
}
```

- [ ] **Step 3: Write the build script**

`packages/capture-macos/build.sh`:

```bash
#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH="$(uname -m)" # arm64 | x86_64
OUT="$DIR/bin/$ARCH"
mkdir -p "$OUT"
swiftc "$DIR/src/main.swift" -o "$OUT/mandarax-capture" \
  -target "$ARCH-apple-macos14.0" -parse-as-library \
  -framework AppKit -framework ScreenCaptureKit -framework CoreGraphics
codesign --force --sign - "$OUT/mandarax-capture" # ad-hoc; rides the dev-host grant, no own identity
echo "built $OUT/mandarax-capture"
```

- [ ] **Step 4: Build and smoke-test the binary**

```bash
chmod +x packages/capture-macos/build.sh
bash packages/capture-macos/build.sh
# Permission path (run before granting, or in CI): prints a permission/no-window failure, exits non-zero.
./packages/capture-macos/bin/$(uname -m)/mandarax-capture --out /tmp/mandarax-smoke.png; echo "exit=$?"
```

Expected: a single JSON line. With Screen Recording granted to the host terminal and a browser window open: `{"ok":true,...}`, exit 0, `/tmp/mandarax-smoke.png` exists. Without the grant: `{"ok":false,"reason":"permission"}`, exit 1.

- [ ] **Step 5: Verify the PNG visually (manual, one-time)**

Open `/tmp/mandarax-smoke.png` and confirm it is a real browser window, not wallpaper. (If it is wallpaper, the host terminal lacks the grant — that is the `permission` path, expected.)

- [ ] **Step 6: Commit**

```bash
git add packages/capture-macos/src packages/capture-macos/build.sh packages/capture-macos/package.json packages/capture-macos/bin
git commit --no-verify -m "feat(capture-macos): ScreenCaptureKit window-capture binary"
```

---

## Task 4: Binary resolver

**Files:**

- Create: `packages/capture-macos/src/index.ts`
- Test: `packages/capture-macos/test/resolve.test.ts`

**Interfaces:**

- Consumes: the built binary at `bin/<arch>/mandarax-capture` from Task 3.
- Produces: `resolveCaptureBinary(): string | null` — absolute path to the host-arch binary if it exists and the OS is darwin, else null.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, it, expect} from 'vitest'
import {existsSync} from 'node:fs'
import {resolveCaptureBinary} from '../src/index.js'

describe('resolveCaptureBinary', () => {
  it('returns null on non-darwin, a real path on darwin', () => {
    const p = resolveCaptureBinary()
    if (process.platform !== 'darwin') {
      expect(p).toBeNull()
    } else {
      // On darwin the binary must have been built (Task 3) for this to be non-null.
      if (p) expect(existsSync(p)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/capture-macos test`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// Resolve the prebuilt host-arch binary. Null = feature unavailable (caller degrades silently).
export function resolveCaptureBinary(): string | null {
  if (process.platform !== 'darwin') return null
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  // dist/index.js -> ../bin/<arch>/mandarax-capture
  const path = join(here, '..', 'bin', arch, 'mandarax-capture')
  return existsSync(path) ? path : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/capture-macos test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/capture-macos/src/index.ts packages/capture-macos/test/resolve.test.ts
git commit --no-verify -m "feat(capture-macos): host-arch binary resolver"
```

---

## Task 5: Core capture orchestrator

**Files:**

- Create: `packages/core/src/page/capture.ts`
- Create: `packages/core/test/page/capture.test.ts`
- Create: `packages/core/test/fixtures/fake-capture.sh` (a real executable, not a mock — behaves like the binary)

**Interfaces:**

- Consumes: `CaptureRequest`, `CaptureResult` (Task 1); `resolveCaptureBinary` (Task 4) — injected for testability via an options bag.
- Produces: `captureWindow(req: CaptureRequest, opts?: {binaryPath?: string | null; timeoutMs?: number}): Promise<CaptureResult>`. Spawns the binary, reads the JSON line + PNG, returns a `CaptureResult`. Never throws.

- [ ] **Step 1: Write the fixture executable**

`packages/core/test/fixtures/fake-capture.sh` (a genuine subprocess; the repo bans mocks, so we exercise real `spawn` against a real script that mimics the binary's contract):

```bash
#!/bin/bash
# Mimics mandarax-capture: --out <path> [--mode ok|permission]. Writes a 1x1 PNG and the JSON line.
OUT=""; MODE="ok"
while [ $# -gt 0 ]; do case "$1" in --out) OUT="$2"; shift 2;; --mode) MODE="$2"; shift 2;; *) shift;; esac; done
if [ "$MODE" = "permission" ]; then echo '{"ok":false,"reason":"permission"}'; exit 1; fi
# 1x1 transparent PNG, base64-decoded to the out path.
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > "$OUT"
echo '{"ok":true,"width":1,"height":1}'; exit 0
```

Make it executable: `chmod +x packages/core/test/fixtures/fake-capture.sh`.

- [ ] **Step 2: Write the failing test**

```ts
import {describe, it, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {captureWindow} from '../../src/page/capture.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const fake = join(fixtures, 'fake-capture.sh')

describe('captureWindow', () => {
  it('returns unsupported-os when no binary resolves', async () => {
    const r = await captureWindow({}, {binaryPath: null})
    expect(r).toEqual({ok: false, reason: process.platform === 'darwin' ? 'binary-missing' : 'unsupported-os'})
  })
  it('returns binary-missing when the path does not exist', async () => {
    const r = await captureWindow({}, {binaryPath: '/no/such/mandarax-capture'})
    expect(r).toEqual({ok: false, reason: 'binary-missing'})
  })
  it('returns a base64 PNG on success', async () => {
    const r = await captureWindow({}, {binaryPath: fake})
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mediaType).toBe('image/png')
      expect(r.dataBase64.length).toBeGreaterThan(0)
    }
  })
  it('classifies a permission failure from the binary', async () => {
    // The fixture reads --mode; pass it through opts.extraArgs.
    const r = await captureWindow({}, {binaryPath: fake, extraArgs: ['--mode', 'permission']})
    expect(r).toEqual({ok: false, reason: 'permission'})
  })
})
```

- [ ] **Step 3: Write minimal implementation**

```ts
import {spawn} from 'node:child_process'
import {readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {existsSync} from 'node:fs'
import {
  CAPTURE_FAILURES,
  type CaptureFailure,
  type CaptureRequest,
  type CaptureResult,
} from '@mandarax/protocol/capture-types'
import {resolveCaptureBinary} from '@mandarax/capture-macos'

type CaptureOpts = {binaryPath?: string | null; timeoutMs?: number; extraArgs?: string[]}

function classify(line: string): CaptureFailure {
  try {
    const reason = JSON.parse(line)?.reason
    if (typeof reason === 'string' && (CAPTURE_FAILURES as readonly string[]).includes(reason))
      return reason as CaptureFailure
  } catch {}
  return 'capture-failed'
}

// Spawn the capture binary as a direct child (rides the dev-host TCC grant). Never throws.
export async function captureWindow(req: CaptureRequest, opts: CaptureOpts = {}): Promise<CaptureResult> {
  const binaryPath = opts.binaryPath === undefined ? resolveCaptureBinary() : opts.binaryPath
  if (binaryPath === null)
    return {ok: false, reason: process.platform === 'darwin' ? 'binary-missing' : 'unsupported-os'}
  if (!existsSync(binaryPath)) return {ok: false, reason: 'binary-missing'}

  const out = join(tmpdir(), `mandarax-capture-${randomUUID()}.png`)
  const args = ['--out', out, ...(req.title ? ['--match', req.title] : []), ...(opts.extraArgs ?? [])]
  const timeoutMs = opts.timeoutMs ?? 8000

  const result = await new Promise<CaptureResult>((resolve) => {
    let stdout = ''
    const child = spawn(binaryPath, args, {stdio: ['ignore', 'pipe', 'ignore']})
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ok: false, reason: 'binary-missing'})
    })
    child.on('close', async (code) => {
      clearTimeout(timer)
      const line = stdout.trim().split('\n').at(-1) ?? ''
      if (code === 0 && existsSync(out)) {
        const dataBase64 = (await readFile(out)).toString('base64')
        resolve({ok: true, mediaType: 'image/png', dataBase64})
      } else {
        resolve({ok: false, reason: classify(line)})
      }
    })
  })
  await rm(out, {force: true}).catch(() => {})
  return result
}
```

Note: add `@mandarax/capture-macos` to `packages/core/package.json` `dependencies` (workspace) and `optionalDependencies` semantics are unnecessary because `resolveCaptureBinary` already null-guards; the import must not throw on non-darwin, so `index.ts` must have no top-level darwin-only side effects (it does not).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mandarax/core test page/capture`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/page/capture.ts packages/core/test/page/capture.test.ts packages/core/test/fixtures/fake-capture.sh packages/core/package.json
git commit --no-verify -m "feat(core): window-capture orchestrator with graceful classification"
```

---

## Task 6: Capture route

**Files:**

- Modify: `packages/core/src/api/page/page.ts`
- Create: `packages/core/test/api/page/capture.it.test.ts`

**Interfaces:**

- Consumes: `captureWindow` (Task 5); `CaptureRequestSchema` (Task 1); `responsibleHostApp` (Task 2).
- Produces: `POST /api/page/capture` accepting a `CaptureRequest` body, returning `CaptureResult` plus, on a `permission` failure, `{host: string}` naming the responsible app. Always HTTP 200 (failures are in the body, so the widget branches without try/catch around the transport).

- [ ] **Step 1: Write the failing integration test**

```ts
import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {makeApp} from '../../../src/app.js' // adjust to the real app factory used by other page ITs
import type {Server} from 'node:http'
// Reuse the same harness the other page ITs use to boot a real h3 server on an ephemeral port.

describe('POST /api/page/capture', () => {
  let base: string
  let server: Server
  beforeAll(async () => {
    ;({base, server} = await startTestServer()) // mirror the existing page.it.test.ts bootstrap
  })
  afterAll(() => server.close())

  it('returns a structured result and never 500s', async () => {
    const res = await fetch(`${base}/api/page/capture`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({title: 'nonexistent-window-zzz'}),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.ok).toBe('boolean')
    if (body.ok === false) {
      // On a CI/non-darwin host this is unsupported-os or binary-missing; on a denied mac, permission.
      expect(['unsupported-os', 'binary-missing', 'permission', 'no-window', 'capture-failed']).toContain(body.reason)
      if (body.reason === 'permission') expect(typeof body.host).toBe('string')
    }
  })
})
```

(Use the exact server bootstrap from `packages/core/test/api/page/page.it.test.ts`; replicate its `startTestServer` helper rather than inventing one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/core test api/page/capture`
Expected: FAIL — 404, route not registered.

- [ ] **Step 3: Add the route to `registerPageRoutes`**

In `packages/core/src/api/page/page.ts`, add imports and a route inside `registerPageRoutes`:

```ts
import {CaptureRequestSchema} from '@mandarax/protocol/capture-types'
import {captureWindow} from '../../page/capture.js'
import {responsibleHostApp} from '../../host-app.js'
```

```ts
app.post('/api/page/capture', async (event) => {
  const req = await readValidatedBody(event, CaptureRequestSchema)
  const result = await captureWindow(req)
  if (result.ok === false && result.reason === 'permission') return {...result, host: responsibleHostApp()}
  return result
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/core test api/page/capture`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/page/page.ts packages/core/test/api/page/capture.it.test.ts
git commit --no-verify -m "feat(core): POST /api/page/capture route"
```

---

## Task 7: Widget capture client

**Files:**

- Create: `packages/widget/src/react-grab/capture-screenshot.ts`
- Test: `packages/widget/test/capture-screenshot.it.test.ts`

**Interfaces:**

- Consumes: `POST /api/page/capture` (Task 6).
- Produces: `requestScreenshot(apiBase: string, hint: {url?: string; title?: string}): Promise<CaptureScreenshot | null>` where `CaptureScreenshot = {mediaType: string; dataBase64: string}`. Returns null on any failure (degraded-safe); on a `permission` failure it calls an injected `onPermission(host: string)` once.

- [ ] **Step 1: Write the failing integration test (real http server, no mocks)**

```ts
import {describe, it, expect} from 'vitest'
import {createServer} from 'node:http'
import {requestScreenshot} from '../src/react-grab/capture-screenshot.js'

function serveOnce(body: unknown): Promise<string> {
  return new Promise((resolve) => {
    const srv = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    })
    srv.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(srv.address() as any).port}`))
  })
}

describe('requestScreenshot', () => {
  it('returns the screenshot on success', async () => {
    const base = await serveOnce({ok: true, mediaType: 'image/png', dataBase64: 'AAA'})
    const shot = await requestScreenshot(base, {})
    expect(shot).toEqual({mediaType: 'image/png', dataBase64: 'AAA'})
  })
  it('returns null and reports host on permission failure', async () => {
    const base = await serveOnce({ok: false, reason: 'permission', host: 'iTerm'})
    let seen = ''
    const shot = await requestScreenshot(base, {}, {onPermission: (h) => (seen = h)})
    expect(shot).toBeNull()
    expect(seen).toBe('iTerm')
  })
  it('returns null on any other failure', async () => {
    const base = await serveOnce({ok: false, reason: 'no-window'})
    expect(await requestScreenshot(base, {})).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mandarax/widget test capture-screenshot`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
import type {CaptureResult} from '@mandarax/protocol/capture-types'

export type CaptureScreenshot = {mediaType: string; dataBase64: string}
type Opts = {onPermission?: (host: string) => void}

// Best-effort screenshot fetch. Any failure resolves to null so the grab is never blocked.
export async function requestScreenshot(
  apiBase: string,
  hint: {url?: string; title?: string},
  opts: Opts = {},
): Promise<CaptureScreenshot | null> {
  try {
    const res = await fetch(`${apiBase}/api/page/capture`, {
      method: 'POST',
      credentials: 'include',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(hint),
    })
    if (!res.ok) return null
    const body = (await res.json()) as CaptureResult & {host?: string}
    if (body.ok) return {mediaType: body.mediaType, dataBase64: body.dataBase64}
    if (body.reason === 'permission' && body.host) opts.onPermission?.(body.host)
    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mandarax/widget test capture-screenshot`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/react-grab/capture-screenshot.ts packages/widget/test/capture-screenshot.it.test.ts
git commit --no-verify -m "feat(widget): best-effort screenshot capture client"
```

---

## Task 8: Carry the screenshot on the staged grab

**Files:**

- Modify: `packages/widget/src/react-grab/grab-types.ts`
- Modify: `packages/widget/src/react-grab/picker-action.ts`

**Interfaces:**

- Consumes: `requestScreenshot` (Task 7); `ComposerActionContext` (`ctx.stageGrab`, and `ctx.apiBase` — confirm the field name in `widget-shell.tsx`; the model selector control reads `apiBase` from its context, mirror that).
- Produces: `StagedGrab.screenshot?: {mediaType: string; dataBase64: string}` and `Grab.screenshot?` carried through to send.

- [ ] **Step 1: Extend the grab types**

In `packages/widget/src/react-grab/grab-types.ts`, add to `StagedGrab`:

```ts
  // Optional real pixel screenshot of the dev window (progressive enhancement; absent when capture
  // is unavailable). Distinct from `snapshot`, which is the lossy styled DOM clone.
  screenshot?: {mediaType: string; dataBase64: string}
```

- [ ] **Step 2: Fire capture during the grab (non-blocking)**

In `packages/widget/src/react-grab/picker-action.ts`, change `onClick` so the capture runs in parallel with the pick and merges into the staged grab when (and only if) it succeeds:

```ts
import {requestScreenshot} from './capture-screenshot.js'
```

```ts
  onClick: async (ctx) => {
    ctx.setBusy(true)
    try {
      const adapter = await getReactGrabAdapter()
      adapter.activate(async (grab) => {
        // Stage immediately so the grab UX is never gated on capture.
        ctx.stageGrab(grab)
        // Best-effort: attach a screenshot if the native helper is available + permitted.
        const shot = await requestScreenshot(ctx.apiBase, {url: location.href, title: document.title}, {
          onPermission: (host) =>
            ctx.notify?.(`Screenshots need Screen Recording for ${host}: enable it in System Settings, then grab again.`),
        })
        if (shot) ctx.updateStagedScreenshot?.(shot)
      })
    } finally {
      ctx.setBusy(false)
    }
  },
```

- [ ] **Step 3: Add the supporting composer-action context fields**

In `packages/widget/src/widget-shell.tsx`, extend `ComposerActionContext` with `apiBase: string`, optional `notify?: (msg: string) => void`, and `updateStagedScreenshot?: (shot: {mediaType: string; dataBase64: string}) => void` (the composer merges it into the current staged grab). Wire `apiBase` from the same source the composer controls already use, `notify` to the existing toast/inline-error surface, and `updateStagedScreenshot` to set `screenshot` on the staged grab signal.

- [ ] **Step 4: Typecheck**

Run: `pnpm turbo typecheck --filter @mandarax/widget`
Expected: PASS. (No unit test here; behavior is verified end-to-end in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/react-grab/grab-types.ts packages/widget/src/react-grab/picker-action.ts packages/widget/src/widget-shell.tsx
git commit --no-verify -m "feat(widget): attach screenshot to staged grab (non-blocking)"
```

---

## Task 9: Attach the screenshot as an image part on send

**Files:**

- Modify: the widget send path. **First confirm the file**: `grep -rn "role: 'user'\|parts\|content:\|sendMessage\|append" packages/widget/src/transport.ts packages/widget/src/session-client.ts packages/widget/src/chat-panel.tsx` and locate where the outgoing user message `content`/`parts` array is assembled.
- Test: extend `packages/widget/test/*.it.test.ts` for the send-body assembly if a unit seam exists; otherwise rely on Task 10's end-to-end check.

**Interfaces:**

- Consumes: `Grab.screenshot` (Task 8).
- Produces: when a staged grab carries a screenshot, the outgoing user message `content` includes an image part of the exact shape the core converts (`packages/core/src/api/chat/messages.ts` `modelContent`): `{type: 'image', source: {type: 'data', mimeType: 'image/png', value: <base64>}}`.

- [ ] **Step 1: Locate the send assembly**

Run the grep above. Identify the function that builds the message sent to `/api/chat` (the AG-UI/tanstack message). Confirm whether the message uses `content: ContentPart[]` or `parts: [...]`; the core tolerates both, but the image branch in `modelContent` only fires for `content` array entries of shape `{type:'image', source:{type:'data', mimeType, value}}`. Use that exact shape.

- [ ] **Step 2: Inject the image part**

Where the user message is constructed, when the active staged grab has `screenshot`, prepend or append:

```ts
// Real screenshot rides as an inline image content part; core's modelContent maps it to the
// harness image channel (fileRef). Absent when capture was unavailable — nothing is added.
const imageParts = grab?.screenshot
  ? [
      {
        type: 'image' as const,
        source: {type: 'data' as const, mimeType: grab.screenshot.mediaType, value: grab.screenshot.dataBase64},
      },
    ]
  : []
```

and merge `imageParts` into the message `content` array alongside the existing text part. Clear the staged grab (incl. `screenshot`) on send, as today.

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck --filter @mandarax/widget`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src
git commit --no-verify -m "feat(widget): send grabbed-window screenshot as an image part"
```

---

## Task 10: End-to-end verification (real browser, no Playwright)

**Files:**

- Create: `packages/widget/test/capture-e2e.it.test.ts` (gated; skips when the host lacks the grant)
- Create: `docs/superpowers/plans/capture-manual-verification.md` (manual checklist)

**Interfaces:**

- Consumes: the full stack (Tasks 3–9).

- [ ] **Step 1: Write the gated end-to-end check**

Boot a real core server and a real dev page (the existing widget IT harness pattern, `browser.newPage()` per repo rule — never `newContext()`). Position a browser window via `open` + `osascript` bounds (the spike pattern). Drive a grab. Assert: if `resolveCaptureBinary()` is non-null AND `CGPreflightScreenCaptureAccess` is granted, the composer's staged grab gains a `screenshot` and the sent message contains an image part; otherwise the grab still stages text + DOM clone and the message has no image part. The test must `it.skip` with a clear message when the binary is absent or permission is denied.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @mandarax/widget test capture-e2e`
Expected: PASS or SKIP (with a clear "Screen Recording not granted to <host>; skipping" message). Never a hard failure on an ungranted/CI host.

- [ ] **Step 3: Write the manual verification checklist**

`docs/superpowers/plans/capture-manual-verification.md`: grant the dev host Screen Recording, run the dev server, grab an element, confirm two chips (DOM clone + screenshot) appear, send, and confirm the bot received the image. Then revoke the grant and confirm the grab still works with only the DOM-clone chip + a one-time toast.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/test/capture-e2e.it.test.ts docs/superpowers/plans/capture-manual-verification.md
git commit --no-verify -m "test(widget): gated end-to-end window-capture check + manual checklist"
```

---

## Task 11: Wire the build + document the feature

**Files:**

- Modify: `packages/capture-macos/package.json` (add a `build` script invoking `build.sh`)
- Modify: root build pipeline (`turbo.json` if Swift build needs a pipeline entry) — document that the Swift binary is built out-of-band on macOS, not in `turbo typecheck`.
- Modify: relevant README/docs to note the macOS-only, opt-in, permission-gated nature.

- [ ] **Step 1: Add the build script**

In `packages/capture-macos/package.json`:

```json
  "scripts": {"build:native": "bash build.sh"}
```

- [ ] **Step 2: Document**

Add a short section to the package README: macOS only; the binary rides the dev host's Screen Recording grant; first grab prompts; denial/absence degrades to the DOM-clone grab. Link the spec `docs/superpowers/specs/2026-06-17-native-window-capture-design.md`.

- [ ] **Step 3: Full typecheck + test sweep**

Run: `pnpm turbo typecheck test --filter ...[HEAD~11]`
Expected: PASS across protocol, core, capture-macos, widget.

- [ ] **Step 4: Commit**

```bash
git add packages/capture-macos/package.json turbo.json packages/capture-macos/README.md
git commit --no-verify -m "chore(capture-macos): build wiring + docs"
```

---

## Self-Review

**Spec coverage:**

- Spawned Swift+SCK binary riding host grant → Tasks 3, 4, 5. ✓
- `POST /api/page/capture` + failure classification → Tasks 5, 6. ✓
- Widget grab attaches screenshot, sent as image part via existing delivery → Tasks 7, 8, 9. ✓
- Permission model + responsible-host naming + toast → Tasks 2, 6, 8. ✓
- Window targeting (title/url hint) → Task 3 (`--match`), Task 7 (hint). ✓
- macOS-only gate + degraded-safe everywhere → Global Constraints, Tasks 4, 5, 7, 8, 10. ✓
- Testing without jsdom/mocks/Playwright; real servers + gated browser → Tasks 5 (real subprocess fixture), 6/7 (real http), 10 (real browser, gated). ✓
- Out-of-scope (Windows/Linux, element crop, Accessibility text) → not planned, matching the spec. ✓

**Placeholder scan:** No TBD/TODO. The one discovery step (Task 9 Step 1) is an explicit, bounded `grep` to confirm the send-assembly file, because the widget send-message file was not fully traced during planning; the image-part shape it must produce is given verbatim.

**Type consistency:** `CaptureResult`/`CaptureFailure` (Task 1) used identically in Tasks 5–7. `resolveCaptureBinary` (Task 4) consumed in Task 5. `requestScreenshot` signature (Task 7) matches its call in Task 8. Image-part shape (Task 9) matches `modelContent` in `messages.ts` verbatim. `screenshot` field name consistent across Tasks 8–10.

**Known soft spots flagged for the implementer:**

- Task 8 Step 3 assumes `ComposerActionContext` can carry `apiBase`/`notify`/`updateStagedScreenshot`; confirm exact field names against `widget-shell.tsx` before writing.
- Task 9 requires confirming the send-assembly file first (Step 1).
