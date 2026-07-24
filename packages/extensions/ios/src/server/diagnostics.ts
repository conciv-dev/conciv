export type Diagnostic = {file: string; line: number; message: string; severity: 'error' | 'warning'}

const DIAGNOSTIC_LINE = /^(.*?):(\d+):(?:\d+): (error|warning): (.*)$/

export function parseDiagnostics(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const seen = new Set<string>()
  for (const raw of output.split('\n')) {
    const match = DIAGNOSTIC_LINE.exec(raw)
    if (!match) continue
    const [, file, line, severity, message] = match
    if (file === undefined || line === undefined || severity === undefined || message === undefined) continue
    const key = `${file}:${line}:${severity}:${message}`
    if (seen.has(key)) continue
    seen.add(key)
    diagnostics.push({file, line: Number(line), message, severity: severity === 'warning' ? 'warning' : 'error'})
  }
  return diagnostics
}
