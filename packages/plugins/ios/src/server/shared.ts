import {join} from 'node:path'
import {Effect} from 'effect'
import {z} from 'zod'
import {Tool} from '@conciv/plugin/schema/tool'
import {DEFAULT_DEVELOPER_DIR, type IosConfig} from './config.js'
import type {RunResult} from './simctl.js'

export type IosRuntime = {
  readonly config: IosConfig
  readonly cwd: string
  readonly concivUrl: () => string | undefined
}

export const NotConfiguredSchema = z.object({ok: z.literal(false), error: z.string()})

export type NotConfigured = z.infer<typeof NotConfiguredSchema>

const ERROR_TAIL_LINES = 40

export function developerEnv(config: IosConfig): Record<string, string> {
  return {DEVELOPER_DIR: config.developerDir ?? DEFAULT_DEVELOPER_DIR}
}

export function moduleName(config: IosConfig): string {
  if (config.scheme) return config.scheme
  const tail = config.bundleId.split('.').at(-1) ?? config.bundleId
  return tail.replace(/[^A-Za-z0-9_]/g, '')
}

export function projectDir(config: IosConfig, cwd: string): string {
  return config.projectRoot.startsWith('/') ? config.projectRoot : join(cwd, config.projectRoot)
}

export function destination(config: IosConfig): string {
  return `platform=iOS Simulator,name=${config.simulator}`
}

export function stdoutText(result: RunResult): string {
  return result.stdout.toString('utf8')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function commandError(result: RunResult, fallback: string): string {
  const stderr = result.stderr.trim()
  if (stderr.length > 0) return stderr
  const stdout = stdoutText(result).trim()
  return stdout.length > 0 ? stdout : fallback
}

export function boundedCommandError(result: RunResult, fallback: string): string {
  const message = commandError(result, fallback)
  const lines = message.split('\n')
  return lines.length <= ERROR_TAIL_LINES ? message : lines.slice(-ERROR_TAIL_LINES).join('\n')
}

export function fileStep<Value>(message: string, work: () => Value): Effect.Effect<Value, Tool.Error> {
  return Effect.try({try: work, catch: (error) => Tool.toolError({message, error})})
}
