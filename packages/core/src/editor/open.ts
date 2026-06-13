// The agnostic editor-opener used by /__pw/tools/open. The actual launch (e.g. via
// `launch-editor`) is injected by the host — core never depends on a specific launcher — and
// this wrapper debounces repeat opens of the same file:line within windowMs so the agent
// can't spam editor tabs. (Extracted from the old vite-coupled tools-layer; this part is
// bundler-agnostic.)

export type LaunchFn = (file: string, line: number) => void

export type OpenInEditor = (file: string, line?: number) => void

export function makeEditorOpener(launch: LaunchFn, windowMs: number, now: () => number): OpenInEditor {
  const seen = new Map<string, number>()
  return (file: string, line = 1): void => {
    const key = `${file}:${line}`
    const last = seen.get(key) ?? -Infinity
    if (now() - last < windowMs) return
    seen.set(key, now())
    launch(file, line)
  }
}
