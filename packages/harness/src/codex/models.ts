import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {CODEX_MODELS} from '@tanstack/ai-codex'
import {z} from 'zod'
import type {HarnessModel} from '@conciv/protocol/harness-types'

const CONFIG_MODEL = /^model\s*=\s*"([^"]+)"/m

const ModelsCacheSchema = z
  .object({
    models: z.array(
      z.object({slug: z.string(), display_name: z.string(), visibility: z.string(), priority: z.number()}).loose(),
    ),
  })
  .loose()

const fallbackModels = (): HarnessModel[] => CODEX_MODELS.map((id) => ({id, name: id, group: 'Codex'}))

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

export function codexModels(home: string = homedir()): HarnessModel[] {
  const text = readText(join(home, '.codex', 'models_cache.json'))
  const parsed = ModelsCacheSchema.safeParse(text === null ? null : parseJson(text))
  if (!parsed.success) return fallbackModels()
  return parsed.data.models
    .filter((model) => model.visibility === 'list')
    .toSorted((left, right) => left.priority - right.priority)
    .map((model) => ({id: model.slug, name: model.display_name, group: 'Codex'}))
}

export function codexDefaultModel(home: string = homedir()): string {
  const configured = readText(join(home, '.codex', 'config.toml'))?.match(CONFIG_MODEL)?.[1]
  if (configured) return configured
  return codexModels(home)[0]?.id ?? CODEX_MODELS[0]
}
