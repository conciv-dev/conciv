import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {codexModels as adapterCodexModels} from '@conciv/ai/server'
import {parse} from 'smol-toml'
import {z} from 'zod'
import {ReasoningEffortSchema, type ReasoningEffort} from '@conciv/protocol/chat-types'
import type {HarnessModel} from '@conciv/protocol/harness-types'

const OPENAI_PROVIDER = 'openai'

const CodexConfigSchema = z
  .object({
    model: z.string().optional().catch(undefined),
    model_provider: z.string().optional().catch(undefined),
    model_providers: z
      .record(
        z.string(),
        z
          .object({requires_openai_auth: z.boolean().optional().catch(undefined)})
          .loose()
          .catch({}),
      )
      .optional()
      .catch(undefined),
  })
  .loose()

type CodexConfig = z.infer<typeof CodexConfigSchema>

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

const readText = (path: string): Promise<string | null> => readFile(path, 'utf8').catch(() => null)

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

export async function codexModels(codexDir: string): Promise<HarnessModel[]> {
  const text = await readText(join(codexDir, 'models_cache.json'))
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

const parseToml = (path: string, text: string): unknown => {
  try {
    return parse(text)
  } catch (error) {
    console.warn(`conciv: ignoring unparsable ${path}`, error)
    return {}
  }
}

async function readConfig(codexDir: string): Promise<CodexConfig> {
  const path = join(codexDir, 'config.toml')
  const text = await readText(path)
  const parsed = CodexConfigSchema.safeParse(text === null ? {} : parseToml(path, text))
  return parsed.success ? parsed.data : {}
}

export async function codexUsesOpenaiLogin(codexDir: string): Promise<boolean> {
  const config = await readConfig(codexDir)
  const provider = config.model_provider ?? OPENAI_PROVIDER
  if (provider === OPENAI_PROVIDER) return true
  return config.model_providers?.[provider]?.requires_openai_auth === true
}

export async function codexDefaultModel(codexDir: string): Promise<string> {
  const configured = (await readConfig(codexDir)).model
  if (configured) return configured
  return (await codexModels(codexDir))[0]?.id ?? adapterCodexModels[0]
}
