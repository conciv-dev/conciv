import type {AnyRoute, Issue, MethodNotAllowed, Schema, UnprocessableContent} from '@bomb.sh/router'
import {z} from 'zod'
import type {EvlogError} from 'evlog'
import {cliErrors} from '@conciv/errors'
import {diffChars} from 'diff'

const MAX_DISTANCE = 3

function comparisonKey(name: string): string {
  const [head] = name.replace(/^-+/, '').split('=')
  return (head ?? '').replaceAll('-', '').toLowerCase()
}

function distance(one: string, other: string): number {
  return diffChars(one, other)
    .filter((part) => part.added === true || part.removed === true)
    .reduce((total, part) => total + part.value.length, 0)
}

function closest(typed: string, candidates: string[]): string | null {
  const key = comparisonKey(typed)
  const ranked = candidates
    .map((candidate) => ({candidate, score: distance(key, comparisonKey(candidate))}))
    .toSorted((one, other) => one.score - other.score)
  const best = ranked[0]
  if (best === undefined || best.score > MAX_DISTANCE) return null
  return best.candidate
}

type Param = {name: string; label: string; argument: boolean; about: string | undefined; schema: Schema}

const UNEXPECTED = 'unexpected '

const TokenSchema = z.string()

const PathKeySchema = z.union([z.string(), z.object({key: z.string()}).transform((segment) => segment.key)])

export async function routeFailure(failure: MethodNotAllowed | UnprocessableContent): Promise<EvlogError> {
  const label = ['conciv', ...failure.path].join(' ')
  if (failure.code === 'method-not-allowed') return methodFailure(failure, label)
  const [first] = failure.issues
  const token = first === undefined ? null : unexpectedToken(first)
  if (token !== null) return unexpectedFailure({token, definition: failure.definition, label})
  const params = collectParams(failure.definition)
  const errors = await Promise.all(failure.issues.map((issue) => issueFailure(issue, params, label)))
  const [only] = errors
  if (only !== undefined && errors.length === 1) return only
  return cliErrors.ARGUMENTS_INVALID({
    problems: errors.map((error) => error.message).join('; '),
    fix: argumentsHint(label),
  })
}

function methodFailure(failure: MethodNotAllowed, label: string): EvlogError {
  if (failure.method === 'execute') return cliErrors.COMMAND_MISSING({command: label, fix: commandsHint(label)})
  return cliErrors.METHOD_UNSUPPORTED({command: label, method: failure.method, fix: commandsHint(label)})
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

function unexpectedFailure(input: {token: string; definition: AnyRoute; label: string}): EvlogError {
  const {token, definition, label} = input
  const params = collectParams(definition)
  if (token.startsWith('-')) return flagFailure({token, params, label})
  const children = definition.phases.flatMap((phase) => phase.routes).map((child) => child.name)
  if (children.length === 0) return cliErrors.ARGUMENT_UNEXPECTED({command: label, token, fix: argumentsHint(label)})
  const suggestion = closest(token, children)
  return cliErrors.COMMAND_UNKNOWN({
    command: label,
    token,
    suggestion: suggestion === null ? '' : ` Did you mean '${suggestion}'?`,
    fix: commandsHint(label),
  })
}

function flagFailure(input: {token: string; params: Param[]; label: string}): EvlogError {
  const {token, params, label} = input
  const positional = params.find((param) => param.argument && comparisonKey(param.name) === comparisonKey(token))
  if (positional !== undefined) {
    return cliErrors.FLAG_IS_ARGUMENT({
      command: label,
      argument: positional.name,
      fix: `pass it as: ${label} ${positional.label}`,
    })
  }
  const flags = params.filter((param) => !param.argument)
  const suggestion = closest(
    token,
    flags.map((param) => param.name),
  )
  const spelled = flags.find((param) => param.name === suggestion)
  return cliErrors.FLAG_UNKNOWN({
    command: label,
    token,
    suggestion: spelled === undefined ? '' : ` Did you mean ${spelled.label}?`,
    fix: argumentsHint(label),
  })
}

async function issueFailure(issue: Issue, params: Param[], label: string): Promise<EvlogError> {
  const fix = argumentsHint(label)
  const [head] = issue.path ?? []
  const key = PathKeySchema.safeParse(head)
  if (!key.success) return cliErrors.ARGUMENTS_INVALID({problems: issue.message, fix})
  const param = params.find((candidate) => candidate.name === key.data)
  if (param === undefined) return cliErrors.ARGUMENTS_INVALID({problems: `${key.data}: ${issue.message}`, fix})
  const argument = param.argument ? param.name : param.label
  const about = param.about ?? `a value for ${param.label}`
  const [whenMissing, whenWrong] = await Promise.all([messagesFor(param, undefined), messagesFor(param, Symbol())])
  if (!whenMissing.includes(issue.message))
    return cliErrors.ARGUMENT_INVALID({argument, about, why: issue.message, fix})
  if (whenWrong.includes(issue.message)) return cliErrors.ARGUMENT_NEEDED({argument, about, why: issue.message, fix})
  return cliErrors.ARGUMENT_MISSING({argument, about, fix})
}

async function messagesFor(param: Param, value: unknown): Promise<string[]> {
  const result = await param.schema['~standard'].validate(value)
  return (result.issues ?? []).map((issue) => issue.message)
}

function collectParams(definition: AnyRoute): Param[] {
  return definition.phases
    .flatMap((phase) => Object.values(phase.model.params))
    .flatMap((param) => {
      const syntax = param.cli.syntax
      if (syntax === undefined) return []
      const [spelling = param.name] = syntax.label.split(/[ ,]+/)
      return [
        {
          name: param.name,
          label: spelling,
          argument: syntax.type === 'argument',
          about: param.description,
          schema: param.schema,
        },
      ]
    })
}

function argumentsHint(label: string): string {
  return `run ${label} --help to see the arguments it accepts`
}

function commandsHint(label: string): string {
  return `run ${label} --help to list its commands`
}
