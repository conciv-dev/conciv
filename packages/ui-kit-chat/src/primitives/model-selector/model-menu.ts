import {createStore} from 'solid-js/store'
import {groupBy, partition} from 'es-toolkit'
import {usePopover, type PopoverMachine} from '@conciv/ui-kit-system'
import type {ChatModels, HarnessMenuEntry, HarnessModelInfo, ReasoningEffort} from '@conciv/protocol/chat-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'

const MAIN_ROWS = 4
const CHARACTERS_PER_TOKEN = 4
const MODEL_COUNT = new Intl.NumberFormat(undefined)
const MODEL_PLURAL = new Intl.PluralRules(undefined)
const TOKEN_COUNT = new Intl.NumberFormat(undefined)
const TOKEN_PLURAL = new Intl.PluralRules(undefined)

const EFFORT_ORDER: readonly ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export type ModelMenuRow = {harness: HarnessMenuEntry; model: HarnessModelInfo; value: string; label: string}
export type OlderModelGroup = {key: string; name: string; rows: ModelMenuRow[]}
export type HarnessSection = {
  harness: HarnessMenuEntry
  rows: ModelMenuRow[]
  more: ModelMenuRow[]
  older: OlderModelGroup[]
}
export type ModelSwitchTarget = {harness: HarnessMenuEntry; model: HarnessModelInfo; label: string}

type ModelMenuState = {
  query: string
  expanded: Record<string, boolean>
  confirming: ModelSwitchTarget | null
  asking: boolean
}

export type ModelMenu = {
  popover: PopoverMachine
  state: ModelMenuState
  search: (query: string) => void
  expand: (key: string, open: boolean) => void
  confirm: (target: ModelSwitchTarget) => void
  ask: () => void
  settle: () => void
}

export function rowValue(harnessId: string, modelId: string): string {
  return `${harnessId}:${modelId}`
}

export function modelLabel(model: HarnessModelInfo, harness: HarnessMenuEntry, named: boolean): string {
  return named ? `${model.name} (${harness.name})` : model.name
}

function mainAndMore(
  models: HarnessModelInfo[],
  kept: readonly (string | null)[],
): [HarnessModelInfo[], HarnessModelInfo[]] {
  if (models.length <= MAIN_ROWS) return [models, []]
  const keptCount = models.filter((model) => kept.includes(model.id)).length
  const newest = models.filter((model) => !kept.includes(model.id)).slice(0, MAIN_ROWS - keptCount)
  return partition(models, (model) => kept.includes(model.id) || newest.includes(model))
}

export function moreModelsLabel(count: number): string {
  return `${MODEL_COUNT.format(count)} more ${MODEL_PLURAL.select(count) === 'one' ? 'model' : 'models'}, type to search`
}

export function harnessSection(
  harness: HarnessMenuEntry,
  named: boolean,
  selectedModel: string | null,
): HarnessSection {
  const toRows = (models: HarnessModelInfo[]) =>
    models.map((model) => ({
      harness,
      model,
      value: rowValue(harness.id, model.id),
      label: modelLabel(model, harness, named),
    }))
  const [first, ...later] = Object.entries(groupBy(harness.models, (model) => model.group ?? ''))
  const [main, more] = mainAndMore(first?.[1] ?? [], [harness.defaultModel, selectedModel])
  return {
    harness,
    rows: toRows(main),
    more: toRows(more),
    older: later.map(([name, models]) => ({key: rowValue(harness.id, name), name, rows: toRows(models)})),
  }
}

export function searchedSection(section: HarnessSection, matches: (row: ModelMenuRow) => boolean): HarnessSection {
  const rows = [...section.rows, ...section.more, ...section.older.flatMap((group) => group.rows)]
  return {...section, rows: rows.filter(matches), more: [], older: []}
}

export function loginMessage(harness: HarnessMenuEntry): string | null {
  return harness.login.loggedIn ? null : harness.login.message
}

export function menuEntry(models: ChatModels): HarnessMenuEntry {
  return {
    ...models.harness,
    models: models.models,
    defaultModel: models.defaultModel,
    modelsFailed: false,
    login: models.login,
  }
}

export function withOwnEntry(
  listed: readonly HarnessMenuEntry[],
  mine: HarnessMenuEntry | undefined,
): HarnessMenuEntry[] {
  if (mine === undefined) return [...listed]
  if (!listed.some((entry) => entry.id === mine.id)) return [mine, ...listed]
  return listed.map((entry) => (entry.id === mine.id ? mine : entry))
}

export function promptName(owner: HarnessMenuEntry | undefined, model: string, named: boolean): string {
  if (owner === undefined) return ''
  if (owner.models.length === 0) return owner.name
  return named ? `${model} (${owner.name})` : model
}

export function listedEffort(
  stored: ReasoningEffort | null,
  model: HarnessModelInfo | undefined,
): ReasoningEffort | null {
  return stored !== null && model?.efforts?.includes(stored) ? stored : null
}

export function effortLevels(efforts: readonly ReasoningEffort[]): ReasoningEffort[] {
  return EFFORT_ORDER.filter((level) => efforts.includes(level))
}

function estimatedTokens(messages: readonly ChatMessage[]): number {
  const characters = messages
    .flatMap((message) => message.parts)
    .reduce((total, part) => total + (part.type === 'text' ? part.content.length : 0), 0)
  return Math.ceil(characters / CHARACTERS_PER_TOKEN)
}

export function historyTokensLabel(messages: readonly ChatMessage[]): string {
  const tokens = estimatedTokens(messages)
  return `${TOKEN_COUNT.format(tokens)} ${TOKEN_PLURAL.select(tokens) === 'one' ? 'token' : 'tokens'}`
}

export function useModelMenu(onClose?: () => void): ModelMenu {
  const [state, setState] = createStore<ModelMenuState>({query: '', expanded: {}, confirming: null, asking: false})
  const popover = usePopover({
    positioning: {placement: 'top-start'},
    restoreFocus: onClose === undefined,
    onEscapeKeyDown: (event) => {
      if (state.query === '') return
      event.preventDefault()
      setState('query', '')
    },
    onOpenChange: (details) => {
      if (details.open) return
      setState({query: '', expanded: {}})
      if (state.confirming === null) onClose?.()
    },
  })
  return {
    popover,
    state,
    search: (query) => setState('query', query),
    expand: (key, open) => setState('expanded', key, open),
    confirm: (target) => setState('confirming', target),
    ask: () => setState('asking', state.confirming !== null),
    settle: () => {
      setState({confirming: null, asking: false})
      onClose?.()
    },
  }
}
