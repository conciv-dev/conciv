import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {defineCommand} from 'citty'
import type {UiFormField, UiSpec} from '@aidx/protocol/ui-types'
import {runRequest, type CliRequest} from './request.js'

// `aidx ui <kind>` — render real interactive UI in the chat thread. The agent does NOT
// block; the user's answer arrives as their next chat message. citty parses argv, zod
// validates, buildUiSpec produces the typed UiSpec the server injects as an AG-UI event.

// Repeated flags (--option / --field) arrive as a string or string[]; normalise to a list.
const list = z.preprocess((v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]), z.array(z.string()))

const ChoicesIn = z.object({question: z.string(), option: list})
const ConfirmIn = z.object({question: z.string(), detail: z.string().optional()})
const DiffIn = z.object({file: z.string(), before: z.string(), after: z.string()})
const FormIn = z.object({field: list, title: z.string().optional()})

// Parse `name:label:type[:opt1,opt2]` into a form field. Returns null on a malformed spec.
function parseField(raw: string): UiFormField | null {
  const [name, label, type, opts] = raw.split(':')
  if (!name || !label) return null
  if (type !== 'text' && type !== 'select') return null
  if (type === 'select') {
    const options = (opts ?? '').split(',').filter(Boolean)
    if (options.length === 0) return null
    return {name, label, type, options}
  }
  return {name, label, type}
}

// Pure: validated args + a caller-supplied renderId → a typed UiSpec. Throws on invalid input.
export function buildUiSpec(kind: string, raw: unknown, renderId: string): UiSpec {
  if (kind === 'choices') {
    const p = ChoicesIn.parse(raw)
    if (p.option.length === 0) throw new Error('choices needs at least one --option')
    return {kind: 'choices', renderId, question: p.question, options: p.option}
  }
  if (kind === 'confirm') {
    const p = ConfirmIn.parse(raw)
    return {kind: 'confirm', renderId, question: p.question, detail: p.detail}
  }
  if (kind === 'diff') {
    const p = DiffIn.parse(raw)
    return {kind: 'diff', renderId, file: p.file, before: p.before, after: p.after}
  }
  if (kind === 'form') {
    const p = FormIn.parse(raw)
    const fields = p.field.map(parseField)
    if (fields.length === 0 || fields.some((f) => f === null)) throw new Error('form needs valid --field specs')
    return {kind: 'form', renderId, title: p.title, fields: fields.filter((f): f is UiFormField => f !== null)}
  }
  throw new Error(`unknown ui kind: ${kind}`)
}

export function uiRequest(spec: UiSpec): CliRequest {
  return {method: 'POST', path: '/api/chat/ui', body: {spec}}
}

async function submit(kind: string, raw: unknown): Promise<void> {
  const spec = buildUiSpec(kind, raw, randomUUID())
  await runRequest(uiRequest(spec))
  process.stdout.write(`Rendered ${spec.kind} in the chat. Waiting for the user's reply as their next message.\n`)
}

export const uiCommand = defineCommand({
  meta: {name: 'ui', description: 'render interactive UI (choices/confirm/diff/form) in the chat thread'},
  subCommands: {
    choices: defineCommand({
      meta: {name: 'choices', description: 'offer tappable options'},
      args: {
        question: {type: 'string', required: true, description: 'the question to ask'},
        option: {type: 'string', description: 'an option (repeat for each)'},
      },
      run: ({args}) => submit('choices', args),
    }),
    confirm: defineCommand({
      meta: {name: 'confirm', description: 'ask a yes/no'},
      args: {
        question: {type: 'string', required: true, description: 'the question to ask'},
        detail: {type: 'string', description: 'extra detail (e.g. the command to run)'},
      },
      run: ({args}) => submit('confirm', args),
    }),
    diff: defineCommand({
      meta: {name: 'diff', description: 'show a proposed change with Apply / Reject'},
      args: {
        file: {type: 'string', required: true, description: 'the file path'},
        before: {type: 'string', required: true, description: 'current text'},
        after: {type: 'string', required: true, description: 'proposed text'},
      },
      run: ({args}) => submit('diff', args),
    }),
    form: defineCommand({
      meta: {name: 'form', description: 'collect structured input'},
      args: {
        field: {type: 'string', description: 'name:label:text | name:label:select:opt1,opt2 (repeat)'},
        title: {type: 'string', description: 'form title'},
      },
      run: ({args}) => submit('form', args),
    }),
  },
})
