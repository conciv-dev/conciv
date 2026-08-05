import type {ArgDef, ArgsDef, CommandDef, CommandMeta, SubCommandsDef} from 'citty'
import type {EnvelopeError} from './failure.js'
import {closest, comparisonKey} from './suggest.js'

export type Resolved =
  | {kind: 'leaf'; command: CommandDef; parent: CommandDef | undefined; rest: string[]; label: string}
  | {kind: 'missing'; command: CommandDef; parent: CommandDef | undefined; label: string}
  | {
      kind: 'unknown'
      command: CommandDef
      parent: CommandDef | undefined
      label: string
      token: string
      known: string[]
    }
  | {
      kind: 'arguments'
      command: CommandDef
      parent: CommandDef | undefined
      label: string
      problem: EnvelopeError
    }

const ENVELOPE_FLAGS: ArgsDef = {json: {type: 'boolean'}, help: {type: 'boolean', alias: 'h'}}

async function subCommandsOf(command: CommandDef): Promise<SubCommandsDef> {
  const value = command.subCommands
  if (value === undefined) return {}
  if (typeof value === 'function') return value()
  return value
}

export async function argsOf(command: CommandDef): Promise<ArgsDef> {
  const value = command.args
  if (value === undefined) return {}
  if (typeof value === 'function') return value()
  return value
}

async function metaOf(command: CommandDef): Promise<CommandMeta> {
  const value = command.meta
  if (value === undefined) return {}
  if (typeof value === 'function') return value()
  return value
}

async function subCommandOf(subs: SubCommandsDef, token: string): Promise<CommandDef | null> {
  const value = subs[token]
  if (value === undefined) return null
  if (typeof value === 'function') return value()
  return value
}

export async function resolveLeaf(root: CommandDef, rawArgs: string[]): Promise<Resolved> {
  let command = root
  let parent: CommandDef | undefined
  let rest = rawArgs
  let label = (await metaOf(root)).name ?? 'conciv'
  for (;;) {
    const subs = await subCommandsOf(command)
    const known = Object.keys(subs)
    if (known.length === 0) return {kind: 'leaf', command, parent, rest, label}
    const args = await argsOf(command)
    const index = commandIndex(rest, args)
    const problem = argumentProblem(index < 0 ? rest : rest.slice(0, index), args, label)
    if (problem !== null) return {kind: 'arguments', command, parent, label, problem}
    const token = index < 0 ? undefined : rest[index]
    if (token === undefined) return {kind: 'missing', command, parent, label}
    const next = await subCommandOf(subs, token)
    if (next === null) return {kind: 'unknown', command, parent, label, token, known}
    parent = command
    command = next
    rest = rest.slice(index + 1)
    label = `${label} ${token}`
  }
}

export function commandProblem(resolved: Exclude<Resolved, {kind: 'leaf'}>): EnvelopeError {
  if (resolved.kind === 'arguments') return resolved.problem
  if (resolved.kind === 'missing') {
    return {kind: 'user', message: `No command given for ${resolved.label}.`, hint: commandsHint(resolved.label)}
  }
  const suggestion = closest(resolved.token, resolved.known)
  const tail = suggestion === null ? '' : ` Did you mean '${suggestion}'?`
  return {
    kind: 'user',
    message: `Unknown command '${resolved.token}' for ${resolved.label}.${tail}`,
    hint: commandsHint(resolved.label),
  }
}

export function argumentProblem(rest: string[], declared: ArgsDef, label: string): EnvelopeError | null {
  const args = {...ENVELOPE_FLAGS, ...declared}
  const scanned = scanTokens(rest, args)
  return flagProblem(scanned.flags, args, declared, label) ?? positionalProblem(scanned.positionals, declared, label)
}

function commandIndex(rest: string[], args: ArgsDef): number {
  let index = 0
  while (index < rest.length) {
    const token = rest[index] ?? ''
    if (token === '--') return -1
    if (!token.startsWith('-')) return index
    if (!token.includes('=') && takesValue(token, args)) index += 1
    index += 1
  }
  return -1
}

function scanTokens(rest: string[], args: ArgsDef): {flags: string[]; positionals: string[]} {
  const flags: string[] = []
  const positionals: string[] = []
  let index = 0
  while (index < rest.length) {
    const token = rest[index] ?? ''
    index += 1
    if (token === '--') return {flags, positionals}
    if (!token.startsWith('-')) {
      positionals.push(token)
      continue
    }
    flags.push(token)
    if (!token.includes('=') && takesValue(token, args)) index += 1
  }
  return {flags, positionals}
}

function flagProblem(flags: string[], args: ArgsDef, declared: ArgsDef, label: string): EnvelopeError | null {
  const known = knownFlagKeys(args)
  const positionals = new Map(positionalNames(declared).map((name) => [comparisonKey(name), name]))
  for (const token of flags) {
    const key = comparisonKey(token)
    if (known.has(key)) continue
    const positional = positionals.get(key)
    if (positional !== undefined) return positionalAsFlag(positional, label)
    return unknownFlag(token, flagNames(args), label)
  }
  return null
}

function positionalProblem(seen: string[], declared: ArgsDef, label: string): EnvelopeError | null {
  const extra = seen[positionalNames(declared).length]
  if (extra === undefined) return null
  return {kind: 'user', message: `Unexpected argument '${extra}' for ${label}.`, hint: argumentsHint(label)}
}

function unknownFlag(token: string, names: string[], label: string): EnvelopeError {
  const suggestion = closest(token, names)
  const tail = suggestion === null ? '' : ` Did you mean --${suggestion}?`
  return {kind: 'user', message: `Unknown flag ${token} for ${label}.${tail}`, hint: argumentsHint(label)}
}

function positionalAsFlag(name: string, label: string): EnvelopeError {
  return {
    kind: 'user',
    message: `${name} is a positional argument of ${label}, not a flag.`,
    hint: `pass it as: ${label} <${name.toUpperCase()}>`,
  }
}

function argumentsHint(label: string): string {
  return `run ${label} --help to see the arguments it accepts`
}

function commandsHint(label: string): string {
  return `run ${label} --help to list its commands`
}

function knownFlagKeys(args: ArgsDef): Set<string> {
  const keys = new Set<string>()
  for (const [name, def] of Object.entries(args)) {
    if (def.type === 'positional') continue
    for (const key of [comparisonKey(name), ...aliasesOf(def).map(comparisonKey)]) {
      keys.add(key)
      if (def.type === 'boolean') keys.add(`no${key}`)
    }
  }
  return keys
}

function flagNames(args: ArgsDef): string[] {
  return Object.entries(args)
    .filter(([, def]) => def.type !== 'positional')
    .map(([name]) => name)
}

function positionalNames(args: ArgsDef): string[] {
  return Object.entries(args)
    .filter(([, def]) => def.type === 'positional')
    .map(([name]) => name)
}

function takesValue(token: string, args: ArgsDef): boolean {
  const key = comparisonKey(token)
  return Object.entries(args).some(([name, def]) => valueFlagKeys(name, def).includes(key))
}

function valueFlagKeys(name: string, def: ArgDef): string[] {
  if (def.type !== 'string' && def.type !== 'enum') return []
  return [comparisonKey(name), ...aliasesOf(def).map(comparisonKey)]
}

function aliasesOf(def: ArgDef): string[] {
  if (!('alias' in def) || def.alias === undefined) return []
  if (Array.isArray(def.alias)) return def.alias
  return [def.alias]
}
