import type {HarnessAdapter} from '@aidx/protocol/harness-types'
import {claude} from './claude/claude.js'
import {codex} from './codex/codex.js'
import {geminiCli} from './gemini-cli/gemini-cli.js'
import {opencode} from './opencode/opencode.js'
import {pi} from './pi/pi.js'

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

// Bundled adapters self-register on import of the package entry.
for (const adapter of [claude, codex, geminiCli, opencode, pi]) registerHarness(adapter)
