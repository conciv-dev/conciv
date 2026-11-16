import {keyBy, mapValues} from 'es-toolkit'
import {Operations, PAGE_NAMESPACE, type Operation} from './rpc.js'

const REACT_METHODS: readonly string[] = ['locate', 'tree', 'inspect', 'override', 'find', 'track']
const ASKING_METHODS: readonly string[] = ['eval']
const TERMINAL_LEFT_OUT: readonly string[] = ['tabs.list', 'fill_form']

export const CLI_HIDDEN_FIELDS: readonly string[] = ['tabId']

export type CliEntry = {
  readonly positional: 'selector' | undefined
  readonly category: 'react' | undefined
  readonly asks: boolean
  readonly terminal: boolean
}

export function toolName(operation: Operation) {
  return `${PAGE_NAMESPACE}_${operation.name.replaceAll('.', '_')}`
}

export const CliTools: Readonly<Record<string, CliEntry>> = mapValues(
  keyBy(Operations, toolName),
  (operation): CliEntry => ({
    positional: Object.hasOwn(operation.input.shape, 'selector') ? 'selector' : undefined,
    category: REACT_METHODS.includes(operation.name) ? 'react' : undefined,
    asks: ASKING_METHODS.includes(operation.name),
    terminal: !TERMINAL_LEFT_OUT.includes(operation.name),
  }),
)
