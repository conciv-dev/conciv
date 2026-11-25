export {defineHarness} from './_shared/contract.js'
export type {HarnessAdapter, HarnessChatConfig} from './_shared/contract.js'
import type {ConfigProvider} from 'effect'
import type {HarnessLoginStatus} from '@conciv/types/chat-types'
import type {HarnessModel} from '@conciv/types/harness-types'
import type {HarnessAdapter} from './_shared/contract.js'
import {claude} from './claude/claude.js'
import {codex} from './codex/codex.js'
import {geminiCli} from './gemini-cli/gemini-cli.js'
import {opencode} from './opencode/opencode.js'
import {pi} from './pi/pi.js'

export {lastUserModelText, lastUserImages} from './_shared/text-adapter.js'
export {containedPath, transcriptPathWithin} from './_shared/contained-path.js'
export {foldJsonlFile} from './_shared/fold-jsonl-file.js'
export {onPath} from './_shared/on-path.js'

export type HarnessRegistry = {
  get(id: string): HarnessAdapter | undefined
  list(): HarnessAdapter[]
}

export function harnessRegistry(provider: ConfigProvider.ConfigProvider): HarnessRegistry {
  const adapters: HarnessAdapter[] = [claude(provider), codex(provider), geminiCli, opencode(provider), pi(provider)]
  return {
    get: (id) => adapters.find((adapter) => adapter.id === id),
    list: () => [...adapters],
  }
}

export async function resolveHarnessModels(
  adapter: HarnessAdapter,
  options: {signal: AbortSignal},
): Promise<HarnessModel[]> {
  const models = adapter.models
  if (!models) return []
  return typeof models === 'function' ? models(options) : models
}

export async function resolveHarnessLogin(
  adapter: HarnessAdapter,
  options: {signal: AbortSignal; refresh: boolean; onError: (error: unknown) => void},
): Promise<HarnessLoginStatus> {
  if (!adapter.login) return {loggedIn: true}
  try {
    return await adapter.login({signal: options.signal, refresh: options.refresh})
  } catch (error) {
    options.onError(error)
    return {loggedIn: true}
  }
}
