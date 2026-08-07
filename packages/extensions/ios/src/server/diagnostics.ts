import {z} from 'zod'

export const DiagnosticSchema = z.object({
  file: z.string(),
  line: z.number(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
})

export type Diagnostic = z.infer<typeof DiagnosticSchema>

const DIAGNOSTIC_LINE = /^(.*?):(\d+):(?:\d+): (error|warning): (.*)$/

function parseDiagnosticLine(raw: string): Diagnostic | null {
  const match = DIAGNOSTIC_LINE.exec(raw)
  if (!match) return null
  const [, file, line, severity, message] = match
  if (file === undefined || line === undefined || severity === undefined || message === undefined) return null
  return {file, line: Number(line), message, severity: severity === 'warning' ? 'warning' : 'error'}
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.severity}:${diagnostic.message}`
}

export function parseDiagnostics(output: string): Diagnostic[] {
  const parsed = output.split('\n').flatMap((raw) => parseDiagnosticLine(raw) ?? [])
  return [...new Map(parsed.map((diagnostic) => [diagnosticKey(diagnostic), diagnostic])).values()]
}
