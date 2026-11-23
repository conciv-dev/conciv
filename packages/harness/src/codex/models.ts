import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {codexModels as adapterCodexModels} from '@conciv/ai/server'
import {z} from 'zod'
import {ReasoningEffortSchema, type ReasoningEffort} from '@conciv/protocol/chat-types'
import type {HarnessModel} from '@conciv/protocol/harness-types'

const CONFIG_MODEL = /^model\s*=\s*"([^"]+)"/m

const CONFIG_PROVIDER = /^model_provider\s*=\s*"([^"]+)"/m

const REQUIRES_OPENAI_AUTH = /^\s*requires_openai_auth\s*=\s*true\b/m

const OPENAI_PROVIDER = 'openai'

const TABLE_HEADER = /^\s*\[/m

const ModelsCacheSchema = z
  .object({
    models: z.array(
      z
        .object({
          slug: z.string(),
          display_name: z.string(),
          visibility: z.string(),
          priority: z.number(),
          supported_reasoning_levels: z
            .array(z.object({effort: z.string()}).loose())
            .catch([])
            .default([]),
        })
        .loose(),
    ),
  })
  .loose()

function listedEfforts(levels: readonly {effort: string}[]): ReasoningEffort[] {
  return levels.flatMap((level) => {
    const parsed = ReasoningEffortSchema.safeParse(level.effort)
    return parsed.success ? [parsed.data] : []
  })
}

const fallbackModels = (): HarnessModel[] => adapterCodexModels.map((id) => ({id, name: id, group: 'Codex'}))

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function codexHome(env: Record<string, string | undefined>): string {
  return env.CODEX_HOME ?? join(homedir(), '.codex')
}

export function codexModels(codexDir: string): HarnessModel[] {
  const text = readText(join(codexDir, 'models_cache.json'))
  const parsed = ModelsCacheSchema.safeParse(text === null ? null : parseJson(text))
  if (!parsed.success) return fallbackModels()
  return parsed.data.models
    .filter((model) => model.visibility === 'list')
    .toSorted((left, right) => left.priority - right.priority)
    .map((model) => {
      const efforts = listedEfforts(model.supported_reasoning_levels)
      return {id: model.slug, name: model.display_name, group: 'Codex', ...(efforts.length > 0 ? {efforts} : {})}
    })
}

const readConfig = (codexDir: string): string => readText(join(codexDir, 'config.toml')) ?? ''

function readTopLevel(config: string): string {
  const headerIndex = config.search(TABLE_HEADER)
  return headerIndex === -1 ? config : config.slice(0, headerIndex)
}

function readProviderTable(config: string, provider: string): string {
  const lines = config.split('\n')
  const headers = [`[model_providers.${provider}]`, `[model_providers."${provider}"]`]
  const start = lines.findIndex((line) => headers.includes(line.trim()))
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => TABLE_HEADER.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

export function codexUsesOpenaiLogin(codexDir: string): boolean {
  const config = readConfig(codexDir)
  const provider = readTopLevel(config).match(CONFIG_PROVIDER)?.[1] ?? OPENAI_PROVIDER
  if (provider === OPENAI_PROVIDER) return true
  return REQUIRES_OPENAI_AUTH.test(readProviderTable(config, provider))
}

export function codexDefaultModel(codexDir: string): string {
  const configured = readTopLevel(readConfig(codexDir)).match(CONFIG_MODEL)?.[1]
  if (configured) return configured
  return codexModels(codexDir)[0]?.id ?? adapterCodexModels[0]
}
