import type {HarnessInitContribution} from '@conciv/protocol/harness-types'
import {claudeInit} from './claude/init.js'
import {codexInit} from './codex.js'
import {geminiCliInit} from './gemini-cli.js'
import {opencodeInit} from './opencode.js'
import {piInit} from './pi.js'

export const INIT_HARNESS_IDS = ['claude', 'codex', 'gemini-cli', 'opencode', 'pi'] as const

export type InitHarnessId = (typeof INIT_HARNESS_IDS)[number]

export const initContributions: {[Id in InitHarnessId]: HarnessInitContribution<Id>} = {
  claude: claudeInit,
  codex: codexInit,
  'gemini-cli': geminiCliInit,
  opencode: opencodeInit,
  pi: piInit,
}
