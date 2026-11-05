import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {codexModels as adapterCodexModels} from '@conciv/ai/server'
import {z} from 'zod'
import {ReasoningEffortSchema, type ReasoningEffort} from '@conciv/protocol/chat-types'
import type {HarnessModel} from '@conciv/protocol/harness-types'

const CONFIG_MODEL = /^model\s*=\s*"([^"]+)"/m

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

export function codexHome(env: Record<string, string | undefined> = process.env): string {
  return env.CODEX_HOME ?? join(homedir(), '.codex')
}

export function codexModels(codexDir: string = codexHome()): HarnessModel[] {
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

export function codexDefaultModel(codexDir: string = codexHome()): string {
  const config = readText(join(codexDir, 'config.toml')) ?? ''
  const headerIndex = config.search(TABLE_HEADER)
  const topLevel = headerIndex === -1 ? config : config.slice(0, headerIndex)
  const configured = topLevel.match(CONFIG_MODEL)?.[1]
  if (configured) return configured
  return codexModels(codexDir)[0]?.id ?? adapterCodexModels[0]
}
