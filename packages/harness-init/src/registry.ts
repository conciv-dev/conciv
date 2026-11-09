import type {HarnessInitContribution, InitHarnessId} from '@conciv/protocol/harness-types'
import {claudeInit} from './claude/init.js'
import {codexInit} from './codex.js'
import {geminiCliInit} from './gemini-cli.js'
import {opencodeInit} from './opencode.js'
import {piInit} from './pi.js'

export const initContributions: {[Id in InitHarnessId]: HarnessInitContribution<Id>} = {
  claude: claudeInit,
  codex: codexInit,
  'gemini-cli': geminiCliInit,
  opencode: opencodeInit,
  pi: piInit,
}
