import {EvlogError} from 'evlog'

export function formatCliError(error: unknown): string {
  if (!EvlogError.isEvlogError(error)) return error instanceof Error ? error.message : String(error)
  const lines = [`${error.code}: ${error.message}`]
  if (error.why) lines.push(`why: ${error.why}`)
  if (error.fix) lines.push(`fix: ${error.fix}`)
  return lines.join('\n')
}
