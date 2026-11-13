import type {AnyRoute, Issue, MethodNotAllowed, UnprocessableContent} from '@bomb.sh/router'
import {z} from 'zod'
import type {EnvelopeError} from './failure.js'
import {closest, comparisonKey} from './suggest.js'

type Param = {name: string; label: string; argument: boolean}

const UNEXPECTED = 'unexpected '

const TokenSchema = z.string()

const PathKeySchema = z.union([z.string(), z.object({key: z.string()}).transform((segment) => segment.key)])

export function routeFailure(failure: MethodNotAllowed | UnprocessableContent): EnvelopeError {
  const label = ['conciv', ...failure.path].join(' ')
  if (failure.code === 'method-not-allowed') return methodFailure(failure, label)
  const [first] = failure.issues
  const token = first === undefined ? null : unexpectedToken(first)
  if (token !== null) return unexpectedFailure({token, definition: failure.definition, label})
  return {
    kind: 'user',
    message: failure.issues.map((issue) => issueText(issue, collectParams(failure.definition))).join('; '),
    hint: argumentsHint(label),
  }
}

function methodFailure(failure: MethodNotAllowed, label: string): EnvelopeError {
  if (failure.method === 'execute') {
    return {kind: 'user', message: `No command given for ${label}.`, hint: commandsHint(label)}
  }
  return {kind: 'user', message: `${label} does not support --${failure.method}.`, hint: commandsHint(label)}
}

function unexpectedToken(issue: Issue): string | null {
  if (issue.path !== undefined || !issue.message.startsWith(UNEXPECTED)) return null
  try {
    const parsed = TokenSchema.safeParse(JSON.parse(issue.message.slice(UNEXPECTED.length)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function unexpectedFailure(input: {token: string; definition: AnyRoute; label: string}): EnvelopeError {
  const {token, definition, label} = input
  const params = collectParams(definition)
  if (token.startsWith('-')) return flagFailure({token, params, label})
  const children = definition.phases.flatMap((phase) => phase.routes).map((child) => child.name)
  if (children.length === 0) {
    return {kind: 'user', message: `Unexpected argument '${token}' for ${label}.`, hint: argumentsHint(label)}
  }
  const suggestion = closest(token, children)
  const tail = suggestion === null ? '' : ` Did you mean '${suggestion}'?`
  return {kind: 'user', message: `Unknown command '${token}' for ${label}.${tail}`, hint: commandsHint(label)}
}

function flagFailure(input: {token: string; params: Param[]; label: string}): EnvelopeError {
  const {token, params, label} = input
  const positional = params.find((param) => param.argument && comparisonKey(param.name) === comparisonKey(token))
  if (positional !== undefined) {
    return {
      kind: 'user',
      message: `${positional.name} is a positional argument of ${label}, not a flag.`,
      hint: `pass it as: ${label} ${positional.label}`,
    }
  }
  const flags = params.filter((param) => !param.argument)
  const suggestion = closest(
    token,
    flags.map((param) => param.name),
  )
  const spelled = flags.find((param) => param.name === suggestion)
  const tail = spelled === undefined ? '' : ` Did you mean ${spelled.label}?`
  return {kind: 'user', message: `Unknown flag ${token} for ${label}.${tail}`, hint: argumentsHint(label)}
}

function issueText(issue: Issue, params: Param[]): string {
  const [head] = issue.path ?? []
  const key = PathKeySchema.safeParse(head)
  if (!key.success) return issue.message
  const param = params.find((candidate) => candidate.name === key.data)
  return `${param?.label ?? key.data}: ${issue.message}`
}

function collectParams(definition: AnyRoute): Param[] {
  return definition.phases
    .flatMap((phase) => Object.values(phase.model.params))
    .flatMap((param) => {
      const syntax = param.cli.syntax
      if (syntax === undefined) return []
      const [spelling = param.name] = syntax.label.split(/[ ,]+/)
      return [{name: param.name, label: spelling, argument: syntax.type === 'argument'}]
    })
}

function argumentsHint(label: string): string {
  return `run ${label} --help to see the arguments it accepts`
}

function commandsHint(label: string): string {
  return `run ${label} --help to list its commands`
}
