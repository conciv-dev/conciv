import {z} from 'zod'
import {defineCommand, type ArgDef, type ArgsDef, type SubCommandsDef} from 'citty'
import {PAGE_QUERY_KINDS, type PageQueryKind} from '@aidx/protocol/page-types'
import {compact, qs, runAndPrint, type CliRequest} from './request.js'

// `aidx tools page <verb>` — read and drive the live page. Each verb declares its HTTP
// method, whether it targets an element (positional <selector> or --ref), and which extra
// flags carry params. The 33 leaf citty commands are GENERATED from this one table (× zod),
// so adding a verb is a single row — never a hand-written command block.
export type VerbSpec = {method: 'GET' | 'POST'; targetsElement: boolean; flags: readonly string[]}

export const PAGE_VERBS: Record<PageQueryKind, VerbSpec> = {
  route: {method: 'GET', targetsElement: false, flags: []},
  dom: {method: 'GET', targetsElement: true, flags: []},
  query: {method: 'GET', targetsElement: true, flags: []},
  console: {method: 'GET', targetsElement: false, flags: ['since']},
  text: {method: 'GET', targetsElement: true, flags: []},
  value: {method: 'GET', targetsElement: true, flags: []},
  attr: {method: 'GET', targetsElement: true, flags: ['name']},
  exists: {method: 'GET', targetsElement: true, flags: []},
  snapshot: {method: 'GET', targetsElement: true, flags: []},
  locate: {method: 'GET', targetsElement: true, flags: []},
  inspect: {method: 'GET', targetsElement: true, flags: ['path']},
  override: {method: 'POST', targetsElement: true, flags: ['target', 'path', 'hookId', 'json']},
  tree: {method: 'GET', targetsElement: true, flags: []},
  find: {method: 'GET', targetsElement: false, flags: ['name']},
  track: {method: 'GET', targetsElement: false, flags: ['action', 'name']},
  wait: {method: 'GET', targetsElement: true, flags: ['state', 'timeout']},
  click: {method: 'POST', targetsElement: true, flags: []},
  hover: {method: 'POST', targetsElement: true, flags: []},
  scroll: {method: 'POST', targetsElement: true, flags: []},
  submit: {method: 'POST', targetsElement: true, flags: []},
  check: {method: 'POST', targetsElement: true, flags: []},
  uncheck: {method: 'POST', targetsElement: true, flags: []},
  fill: {method: 'POST', targetsElement: true, flags: ['value']},
  select: {method: 'POST', targetsElement: true, flags: ['value']},
  press: {method: 'POST', targetsElement: true, flags: ['key']},
  setattr: {method: 'POST', targetsElement: true, flags: ['name', 'value']},
  removeattr: {method: 'POST', targetsElement: true, flags: ['name']},
  addclass: {method: 'POST', targetsElement: true, flags: ['class']},
  removeclass: {method: 'POST', targetsElement: true, flags: ['class']},
  setstyle: {method: 'POST', targetsElement: true, flags: ['prop', 'value']},
  settext: {method: 'POST', targetsElement: true, flags: ['text']},
  sethtml: {method: 'POST', targetsElement: true, flags: ['html']},
  remove: {method: 'POST', targetsElement: true, flags: []},
  insert: {method: 'POST', targetsElement: true, flags: ['html', 'position']},
  css: {method: 'POST', targetsElement: false, flags: ['text']},
  eval: {method: 'POST', targetsElement: false, flags: ['code']},
}

// One zod schema per field; a verb's allowed fields are picked from this map. Strings stay
// strings; since/timeout coerce to numbers; position/state are enums — so a bad --state is
// rejected with a clear error instead of being silently forwarded.
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
  // Element verbs target by selector, snapshot ref, OR React component name (whichever the agent has).
  const target: FieldName[] = spec.targetsElement ? ['selector', 'ref', 'name'] : []
  return [...target, ...spec.flags.filter(isFieldName)]
}

function schemaFor(verb: PageQueryKind): z.ZodType<Record<string, unknown>> {
  const shape = Object.fromEntries(allowedFields(verb).map((f) => [f, FIELD[f].optional()]))
  return z.object(shape)
}

// Pure: raw args → the HTTP request. The verb's zod schema validates + strips to its allowed
// fields. GET verbs carry params in the query string; POST verbs in a compact JSON body.
export function pageRequest(verb: PageQueryKind, raw: unknown): CliRequest {
  const params = schemaFor(verb).parse(raw)
  const spec = PAGE_VERBS[verb]
  if (spec.method === 'GET') return {method: 'GET', path: `/api/page/${verb}${qs(params)}`}
  return {method: 'POST', path: `/api/page/${verb}`, body: compact(params)}
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

// One generated leaf command per verb (all hit /api/page/:verb, so the `react` alias group reuses them).
function leafCommandsFor(verbs: readonly PageQueryKind[]): SubCommandsDef {
  return Object.fromEntries(
    verbs.map((verb) => [
      verb,
      defineCommand({
        meta: {name: verb, description: `page ${verb}`},
        args: argsFor(verb),
        run: ({args}) => runAndPrint(pageRequest(verb, args)),
      }),
    ]),
  )
}

// The generated leaf commands for every page verb, plus the non-query `changes` journal cmd.
export function pageCommands(): SubCommandsDef {
  const changes = defineCommand({
    meta: {name: 'changes', description: 'list (or --clear) the live-edit journal'},
    args: {clear: {type: 'boolean', description: 'reset the journal after listing'}},
    run: ({args}) => {
      const req: CliRequest = args.clear
        ? {method: 'POST', path: '/api/page/changes/clear'}
        : {method: 'GET', path: '/api/page/changes'}
      return runAndPrint(req)
    },
  })
  return {...leafCommandsFor(PAGE_QUERY_KINDS), changes}
}

export const pageCommand = defineCommand({
  meta: {name: 'page', description: 'read & drive the live page (snapshot, click, fill, edit, eval, …)'},
  subCommands: pageCommands(),
})

// The React-introspection subset, exposed under `aidx tools react` as an alias of the same verbs —
// where agents intuitively reach for them. All resolve to the same /api/page/:verb endpoints.
export const REACT_VERBS = [
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
