import {z} from 'zod'
import {defineCommand} from 'citty'
import {runRequest, type CliRequest} from './request.js'

// `devgent tools open <file> [--line n]` — open a source file in the user's editor.
const OpenArgs = z.object({file: z.string(), line: z.coerce.number().optional()})

export function openRequest(raw: Record<string, unknown>): CliRequest {
  const p = OpenArgs.parse(raw)
  return {method: 'POST', path: '/__pw/tools/open', body: {file: p.file, line: p.line}}
}

export const openCommand = defineCommand({
  meta: {name: 'open', description: "open a file in the user's editor"},
  args: {
    file: {type: 'positional', required: true, description: 'the file to open'},
    line: {type: 'string', description: 'line number to jump to'},
  },
  run: async ({args}) => {
    process.stdout.write((await runRequest(openRequest(args as Record<string, unknown>))) + '\n')
  },
})
