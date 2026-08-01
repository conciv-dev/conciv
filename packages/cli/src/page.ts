import {z} from 'zod'
import {defineCommand, type ArgDef, type ArgsDef, type SubCommandsDef} from 'citty'
import {PAGE_QUERY_KINDS, type PageQueryKind} from '@conciv/protocol/page-types'
import type {PageRunInput} from '@conciv/protocol/page-types'
import {runRpc} from './request.js'

type VerbSpec = {targetsElement: boolean; flags: readonly string[]}

const PAGE_VERBS: Record<PageQueryKind, VerbSpec> = {
  route: {targetsElement: false, flags: []},
  dom: {targetsElement: true, flags: []},
  query: {targetsElement: true, flags: []},
  console: {targetsElement: false, flags: ['since']},
  text: {targetsElement: true, flags: []},
  value: {targetsElement: true, flags: []},
  attr: {targetsElement: true, flags: ['name']},
  exists: {targetsElement: true, flags: []},
  snapshot: {targetsElement: true, flags: []},
  locate: {targetsElement: true, flags: []},
  inspect: {targetsElement: true, flags: ['path']},
  override: {targetsElement: true, flags: ['target', 'path', 'hookId', 'json']},
  tree: {targetsElement: true, flags: []},
  find: {targetsElement: false, flags: ['name']},
  track: {targetsElement: false, flags: ['action', 'name']},
  effect: {targetsElement: false, flags: ['action', 'effect']},
  wait: {targetsElement: true, flags: ['state', 'timeout']},
  click: {targetsElement: true, flags: []},
  hover: {targetsElement: true, flags: []},
  scroll: {targetsElement: true, flags: []},
  submit: {targetsElement: true, flags: []},
  check: {targetsElement: true, flags: []},
  uncheck: {targetsElement: true, flags: []},
  fill: {targetsElement: true, flags: ['value']},
  select: {targetsElement: true, flags: ['value']},
  press: {targetsElement: true, flags: ['key']},
  setattr: {targetsElement: true, flags: ['name', 'value']},
  removeattr: {targetsElement: true, flags: ['name']},
  addclass: {targetsElement: true, flags: ['class']},
  removeclass: {targetsElement: true, flags: ['class']},
  setstyle: {targetsElement: true, flags: ['prop', 'value']},
  settext: {targetsElement: true, flags: ['text']},
  sethtml: {targetsElement: true, flags: ['html']},
  remove: {targetsElement: true, flags: []},
  insert: {targetsElement: true, flags: ['html', 'position']},
  css: {targetsElement: false, flags: ['text']},
  eval: {targetsElement: false, flags: ['code']},
  ext: {targetsElement: false, flags: []},
}

const USER_FACING_VERBS = PAGE_QUERY_KINDS.filter((kind) => kind !== 'ext')

const FIELD = {
  selector: z.string(),
  ref: z.string(),
  value: z.string(),
  name: z.string(),
  class: z.string(),
  prop: z.string(),
  text: z.string(),
  html: z.string(),
  key: z.string(),
  code: z.string(),
  path: z.string(),
  target: z.enum(['props', 'state', 'hooks', 'context']),
  hookId: z.coerce.number(),
  json: z.string(),
  action: z.enum(['start', 'stop', 'report']),
  position: z.enum(['before', 'after', 'prepend', 'append']),
  state: z.enum(['visible', 'hidden']),
  since: z.coerce.number(),
  timeout: z.coerce.number(),
} satisfies Record<string, z.ZodType>

type FieldName = keyof typeof FIELD

function isFieldName(f: string): f is FieldName {
  return f in FIELD
}
function allowedFields(verb: PageQueryKind): FieldName[] {
  const spec = PAGE_VERBS[verb]

  const target: FieldName[] = spec.targetsElement ? ['selector', 'ref', 'name'] : []
  return [...target, ...spec.flags.filter(isFieldName)]
}

function schemaFor(verb: PageQueryKind): z.ZodType<Record<string, unknown>> {
  const shape = Object.fromEntries(allowedFields(verb).map((f) => [f, FIELD[f].optional()]))
  return z.object(shape)
}

function pageInput(verb: PageQueryKind, raw: unknown): PageRunInput {
  const params = schemaFor(verb).parse(raw)
  const present = Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
  return {verb, ...Object.fromEntries(present)}
}

function flagArg(flag: string): ArgDef {
  if (flag === 'position') {
    return {type: 'enum', options: ['before', 'after', 'prepend', 'append'], description: 'where to insert'}
  }
  if (flag === 'state') return {type: 'enum', options: ['visible', 'hidden'], description: 'state to wait for'}
  if (flag === 'since') return {type: 'string', description: 'only logs after this timestamp (ms)'}
  if (flag === 'timeout') return {type: 'string', description: 'max wait in ms'}
  if (flag === 'path') return {type: 'string', description: 'dot-path to drill into, e.g. props.user.address'}
  if (flag === 'target') {
    return {type: 'enum', options: ['props', 'state', 'hooks', 'context'], description: 'which slice to override'}
  }
  if (flag === 'hookId') return {type: 'string', description: 'hook id from inspect (for --target hooks)'}
  if (flag === 'json') return {type: 'string', description: 'new value as JSON, e.g. true or {"a":1}'}
  if (flag === 'action') return {type: 'enum', options: ['start', 'stop', 'report'], description: 'track action'}
  return {type: 'string', description: `--${flag}`}
}

function argsFor(verb: PageQueryKind): ArgsDef {
  const spec = PAGE_VERBS[verb]
  const args: ArgsDef = {}
  if (spec.targetsElement) {
    args.selector = {type: 'positional', required: false, description: 'CSS selector (or use --ref / --name)'}
    args.ref = {type: 'string', description: 'element ref from the latest snapshot'}
    args.name = {type: 'string', description: 'React component name (targets the first match)'}
  }
  for (const f of spec.flags) args[f] = flagArg(f)
  return args
}

function leafCommandsFor(verbs: readonly PageQueryKind[]): SubCommandsDef {
  return Object.fromEntries(
    verbs.map((verb) => [
      verb,
      defineCommand({
        meta: {name: verb, description: `page ${verb}`},
        args: argsFor(verb),
        run: ({args}) => runRpc((rpc) => rpc.page.run(pageInput(verb, args))),
      }),
    ]),
  )
}

function pageCommands(): SubCommandsDef {
  const changes = defineCommand({
    meta: {name: 'changes', description: 'list (or --clear) the live-edit journal'},
    args: {clear: {type: 'boolean', description: 'reset the journal after listing'}},
    run: ({args}) => runRpc((rpc) => (args.clear ? rpc.page.clearChanges(undefined) : rpc.page.changes(undefined))),
  })
  return {...leafCommandsFor(USER_FACING_VERBS), changes}
}

export const pageCommand = defineCommand({
  meta: {name: 'page', description: 'read & drive the live page (snapshot, click, fill, edit, eval, …)'},
  subCommands: pageCommands(),
})

const REACT_VERBS = [
  'inspect',
  'tree',
  'find',
  'locate',
  'override',
  'track',
] as const satisfies readonly PageQueryKind[]

export const reactCommand = defineCommand({
  meta: {name: 'react', description: 'inspect & edit live React components (inspect, tree, find, override, track)'},
  subCommands: leafCommandsFor(REACT_VERBS),
})
