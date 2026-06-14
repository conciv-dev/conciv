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
  const target: FieldName[] = spec.targetsElement ? ['selector', 'ref'] : []
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
  return {type: 'string', description: `--${flag}`}
}

function argsFor(verb: PageQueryKind): ArgsDef {
  const spec = PAGE_VERBS[verb]
  const args: ArgsDef = {}
  if (spec.targetsElement) {
    args.selector = {type: 'positional', required: false, description: 'CSS selector (or use --ref)'}
    args.ref = {type: 'string', description: 'element ref from the latest snapshot'}
  }
  for (const f of spec.flags) args[f] = flagArg(f)
  return args
}

// The generated leaf commands for every page verb, plus the non-query `changes` journal cmd.
export function pageCommands(): SubCommandsDef {
  const verbs = Object.fromEntries(
    PAGE_QUERY_KINDS.map((verb) => [
      verb,
      defineCommand({
        meta: {name: verb, description: `page ${verb}`},
        args: argsFor(verb),
        run: ({args}) => runAndPrint(pageRequest(verb, args)),
      }),
    ]),
  )
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
  return {...verbs, changes}
}

export const pageCommand = defineCommand({
  meta: {name: 'page', description: 'read & drive the live page (snapshot, click, fill, edit, eval, …)'},
  subCommands: pageCommands(),
})
