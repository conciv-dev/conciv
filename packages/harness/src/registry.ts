import type {HarnessAdapter, HarnessModel} from '@conciv/protocol/harness-types'
import {claude} from './claude/index.js'
import {codex} from './codex/index.js'
import {geminiCli} from './gemini-cli/index.js'
import {opencode} from './opencode/index.js'
import {pi} from './pi/index.js'

export {harnessText, HarnessTextAdapter, lastUserModelText, lastUserImages} from './_shared/text-adapter.js'

const registry = new Map<string, HarnessAdapter>()

export function registerHarness(adapter: HarnessAdapter): void {
  registry.set(adapter.id, adapter)
}

export function getHarness(id: string): HarnessAdapter | undefined {
  return registry.get(id)
}

export function listHarnesses(): HarnessAdapter[] {
  return [...registry.values()]
}

export async function resolveHarnessModels(adapter: HarnessAdapter): Promise<HarnessModel[]> {
  const models = adapter.models
  if (!models) return []
  return typeof models === 'function' ? models() : models
}

for (const adapter of [claude, codex, geminiCli, opencode, pi]) registerHarness(adapter)
