import {createMemo, type Accessor} from 'solid-js'
import {countBy} from 'es-toolkit'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {Turn} from './grouping.js'
import {pairResults} from './grouping.js'
import {toolStatus} from '../tools/primitives/tool-status.js'
import {countLabel, shortToolLabel} from '../tools/primitives/tool-row.js'

export type TurnRollup = {
  files: string[]
  adds: number
  dels: number
  toolCalls: number
  tools: Record<string, number>
  failed: number
  awaitingApproval: boolean
  live: boolean
}

type ApplyPatchInfo = {files: string[]; added: number; removed: number}
type BashOutput = {stdout?: string; stderr?: string; exitCode?: number}

function basename(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}

function patchTextOf(part: ToolCallPart): string {
  try {
    const input = JSON.parse(part.arguments || '{}')
    const value = input.patchText ?? input.patch ?? input.input ?? input.content
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

function applyPatchInfo(part: ToolCallPart): ApplyPatchInfo {
  const patchText = patchTextOf(part)
  if (!patchText) return {files: [], added: 0, removed: 0}
  const files = [
    ...new Set(
      [...patchText.matchAll(/^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)$/gm)].map((match) =>
        basename((match[1] ?? '').trim()),
      ),
    ),
  ].filter(Boolean)
  const added = patchText.split('\n').filter((line) => line.startsWith('+')).length
  const removed = patchText.split('\n').filter((line) => line.startsWith('-')).length
  return {files, added, removed}
}

function bashOutputOf(result: ToolResultPart | undefined): BashOutput {
  if (!result || typeof result.content !== 'string') return {}
  try {
    const parsed = JSON.parse(result.content)
    return parsed && typeof parsed === 'object' ? (parsed as BashOutput) : {}
  } catch {
    return {}
  }
}

function isFailedCall(part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  if (toolStatus(part, result) === 'error') return true
  if (part.name !== 'Bash') return false
  const exitCode = bashOutputOf(result).exitCode
  return exitCode !== undefined && exitCode !== 0
}

export function turnRollup(turn: Turn): TurnRollup {
  const {byCallId} = pairResults(turn.parts)
  const toolCalls = turn.parts.filter((part): part is ToolCallPart => part.type === 'tool-call')
  const patchInfos = toolCalls.filter((call) => call.name === 'apply_patch').map(applyPatchInfo)
  const files = [...new Set(patchInfos.flatMap((info) => info.files))]
  const adds = patchInfos.reduce((sum, info) => sum + info.added, 0)
  const dels = patchInfos.reduce((sum, info) => sum + info.removed, 0)
  const failed = toolCalls.filter((call) => isFailedCall(call, byCallId.get(call.id))).length
  const awaitingApproval = toolCalls.some((call) => toolStatus(call, byCallId.get(call.id)) === 'approval')
  const live = toolCalls.some((call) => toolStatus(call, byCallId.get(call.id)) === 'running')
  const tools = countBy(toolCalls, (call) => shortToolLabel(call.name))
  return {files, adds, dels, toolCalls: toolCalls.length, tools, failed, awaitingApproval, live}
}

export function createTurnRollup(turn: Accessor<Turn>): Accessor<TurnRollup> {
  const rollup = createMemo(() => turnRollup(turn()))
  return rollup
}

function failedFact(failed: number): string[] {
  return failed > 0 ? [`${failed} failed`] : []
}

const SIBILANT_ENDING = /(s|x|z|ch|sh)$/

function pluralOf(label: string): string {
  return SIBILANT_ENDING.test(label) ? `${label}es` : `${label}s`
}

function toolTally(tools: Record<string, number>): string[] {
  return Object.entries(tools).map(([label, count]) => countLabel(count, label, pluralOf(label)))
}

function rollupFacts(rollup: TurnRollup): string[] {
  if (rollup.files.length > 0)
    return [
      countLabel(rollup.files.length, 'file', 'files'),
      `+${rollup.adds} −${rollup.dels}`,
      ...failedFact(rollup.failed),
    ]
  if (rollup.failed > 0) return failedFact(rollup.failed)
  return toolTally(rollup.tools)
}

export function summaryLine(rollup: TurnRollup): string {
  const approval = rollup.awaitingApproval ? ['awaiting approval'] : []
  return [...rollupFacts(rollup), ...approval].join(' · ')
}

export function sessionTotals(
  turnsAccessor: Accessor<ReadonlyArray<Turn>>,
): Accessor<{files: number; adds: number; dels: number}> {
  const totals = createMemo(() => {
    const rollups = turnsAccessor().map(turnRollup)
    const files = new Set(rollups.flatMap((rollup) => rollup.files)).size
    const adds = rollups.reduce((sum, rollup) => sum + rollup.adds, 0)
    const dels = rollups.reduce((sum, rollup) => sum + rollup.dels, 0)
    return {files, adds, dels}
  })
  return totals
}
