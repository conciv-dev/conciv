import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {defineCommand} from 'citty'
import {buildUiSpec, parseField, type UiBuildInput, type UiFormField, type UiSpec} from '@conciv/protocol/ui-types'
import {runRequest, type CliRequest} from './request.js'

// `conciv ui <kind>` — render real interactive UI in the chat thread. The agent does NOT
// block; the user's answer arrives as their next chat message. citty parses argv, zod
// validates, the shared buildUiSpec (also used by the conciv_ui tool) produces the typed UiSpec.

// Repeated flags (--option / --field) arrive as a string or string[]; normalise to a list.
const list = z.preprocess((v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]), z.array(z.string()))

const ChoicesIn = z.object({question: z.string(), option: list})
const ConfirmIn = z.object({question: z.string(), detail: z.string().optional()})
const DiffIn = z.object({file: z.string(), before: z.string(), after: z.string()})
const FormIn = z.object({field: list, title: z.string().optional()})

// Map citty-shaped CLI args to the shared builder's normalized input.
function cliUiInput(kind: string, raw: unknown): UiBuildInput {
  if (kind === 'choices') {
    const p = ChoicesIn.parse(raw)
    return {kind, question: p.question, options: p.option}
  }
  if (kind === 'confirm') {
    const p = ConfirmIn.parse(raw)
    return {kind, question: p.question, detail: p.detail}
  }
  if (kind === 'diff') {
    const p = DiffIn.parse(raw)
    return {kind, file: p.file, before: p.before, after: p.after}
  }
  if (kind === 'form') {
    const p = FormIn.parse(raw)
    const parsed = p.field.map(parseField)
    if (parsed.length === 0 || parsed.some((f) => f === null)) throw new Error('form needs valid --field specs')
    const fields = parsed.filter((f): f is UiFormField => f !== null)
    return {kind, title: p.title, fields}
  }
  throw new Error(`unknown ui kind: ${kind}`)
}

export function uiRequest(spec: UiSpec): CliRequest {
  return {method: 'POST', path: '/api/chat/ui', body: {spec}}
}

async function submit(kind: string, raw: unknown): Promise<void> {
  const spec = buildUiSpec(cliUiInput(kind, raw), randomUUID())
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
