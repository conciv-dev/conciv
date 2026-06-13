// Debounced editor-opener for /api/open. The launcher is injected by the host (core depends on
// none); the debounce stops the agent spamming editor tabs for the same file:line.

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
