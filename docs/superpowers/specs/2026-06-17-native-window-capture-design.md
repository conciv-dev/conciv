# Native window-capture for the grab pipeline

Date: 2026-06-17
Status: design, spike-validated

## Goal

When a user grabs an element in the widget, also send the bot a true pixel screenshot
of the dev app's browser window, captured by a node-spawned native binary outside the
browser. The existing styled DOM-clone grab stays; the screenshot is additive.

## Why outside-browser

In-browser raster (html2canvas / SVG foreignObject) is lossy for canvas, WebGL, video,
and cross-origin iframes, and `getDisplayMedia` prompts every time. A real OS-level
capture is exact.

## Spike findings (proven 2026-06-17, macOS 26, arm64)

A throwaway spike (`/tmp/mandarax-capture-spike`, Swift + ScreenCaptureKit) established:

- Swift + ScreenCaptureKit captures a real window at retina resolution (2048x1644 @2x). Verified visually.
- A plain binary spawned as a child of the dev host (terminal/IDE) rides that host's
  Screen Recording grant: `CGPreflightScreenCaptureAccess()` returns true once the host
  app is granted. No separate identity needed.
- No restart required: each freshly spawned child picks up the host's grant.
- A non-bundled CLI binary aborts in CoreGraphics with `CGS_REQUIRE_INIT` unless it
  bootstraps Cocoa first via `NSApplication.shared` + `setActivationPolicy(.accessory)`
  - `finishLaunching()`.
- The signed-helper-`.app` path is dead: `open`/LaunchServices rejects an untrusted
  self-signed app (Gatekeeper), and owning a private TCC entry requires Finder/launchd
  launch, which a dev-server plugin cannot arrange.
- `xcap` (Rust) silently returns the wallpaper layer (windows stripped) when permission
  is absent, instead of erroring. Undetectable failure. ScreenCaptureKit returns a clean
  `-3801` on denial. Use SCK, not xcap.

## Architecture

### Components

1. `@mandarax/capture-macos` (new): a prebuilt Swift + ScreenCaptureKit binary, one per arch
   (darwin-arm64, darwin-x64), shipped in the npm package. Single-shot CLI:
   - bootstraps Cocoa (`NSApplication.shared` accessory, `finishLaunching()`)
   - checks `CGPreflightScreenCaptureAccess()`; if false, emits `{error:"permission"}`
   - enumerates on-screen windows via `SCShareableContent`
   - picks the target browser window (see Window targeting)
   - captures via `SCScreenshotManager.captureImage`
   - writes PNG to the `--out` path, prints a JSON result line, exits

2. Core capture verb (`packages/core`, new page-API route): spawns the binary as a child
   of the dev server, reads the PNG, returns it to the widget. Classifies failures:
   `permission` / `no-window` / `binary-missing` / `unsupported-os`.

3. Widget: the grab action requests the screenshot from core, shows it in the composer
   preview beside the existing DOM-clone chip, and attaches the grabbed element's CSS
   rect plus page URL as text metadata. On send, the PNG rides as a `HarnessImage`.

4. Delivery: existing `HarnessImage` path (`packages/harness/src/claude/args.ts` writes
   the image under cwd and appends an `@path` ref). Zero harness changes.

### Data flow

```
user clicks grab, picks element
  -> widget: DOM clone (existing) + getBoundingClientRect + page URL
  -> POST /page/capture
       -> core spawns @mandarax/capture-macos --out /tmp/...png
            -> SCK captures target browser window -> PNG
       -> core reads PNG, returns base64 (or structured error)
  -> widget shows screenshot chip + DOM-clone chip in composer
on send -> PNG attached as HarnessImage -> existing @path delivery -> bot
```

### Permission model

The binary rides the Screen Recording grant of the dev host app (the terminal or IDE
that launched the dev server). Flow:

- First capture, host not granted: binary returns `{error:"permission"}`.
- Core walks the parent-process chain (`ps -o comm=`/`-o ppid=`) to identify the
  responsible host app (iTerm, Terminal, VSCode, WebStorm, ...).
- Widget shows a one-time toast naming that exact app: "Enable <host> under System
  Settings > Screen and System Audio Recording, then grab again." Deep link to the pane.
- No restart needed; the next spawned capture picks up the grant.
- On any error, the grab falls back to DOM-clone-only. Never a broken grab.

### Window targeting

v1: pick the on-screen, normal-layer window owned by a browser whose title matches the
dev server's page `<title>` or URL host; fall back to the frontmost browser window, then
the largest browser window. The widget passes the page URL/title to disambiguate.

## Build and packaging

- `packages/capture-macos/`: Swift source, built with `swiftc` (no Xcode, CLT only),
  `-target arm64-apple-macos14.0 -parse-as-library`, frameworks AppKit + ScreenCaptureKit
  - CoreGraphics. CI builds both arches; binaries published per-arch and selected at
    runtime by `process.platform`/`process.arch`. No signing, no notarization, no Apple
    Developer account.
- Plugin is dev-only (`apply:'serve'`), so the binary never enters a prod bundle.

## Testing

Per repo rules: no jsdom, no mocks, real drivers, no Playwright.

- Swift smoke: a binary run that asserts a PNG of expected window dimensions is produced
  when permission is present; skips with a clear message when `preflight` is false.
- Pipeline IT: real browser positioned via `open` + osascript window bounds (the spike
  pattern), real core, real binary; assert core returns a non-empty PNG of the expected
  window. Inherently headed and permission-gated; skips clearly when the host lacks the
  grant. Plus a manual verification checklist.

## MVP scope

In: macOS only; prebuilt Swift+SCK binary; rides host grant; window capture; PNG plus
element-rect/URL text to the bot; responsible-host detection and toast; graceful
DOM-clone fallback.

Out (later): Windows (Windows Graphics Capture) and Linux (portal/pipewire); element
crop within the window image (needs top-chrome offset + DPR); Accessibility-API text
extraction (the Codex pattern, recovers off-screen text); long-lived helper for latency.

Non-goals: signed/notarized distribution; owning a private TCC identity; capturing the
literal full screen.

## Open risks

- Broad permission: the user grants their terminal/IDE Screen Recording, not mandarax
  specifically. Mitigated by naming the exact host app; inherent to the spawned-child
  model.
- Host detection across the many terminals/IDEs developers use.
- Window targeting picking the wrong browser window when several match.
