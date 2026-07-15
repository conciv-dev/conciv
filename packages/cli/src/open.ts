import {z} from 'zod'
import {defineCommand} from 'citty'
import {runRpc} from './request.js'

const OpenArgs = z.object({file: z.string(), line: z.coerce.number().optional()})

export const openCommand = defineCommand({
  meta: {name: 'open', description: "open a file in the user's editor"},
  args: {
    file: {type: 'positional', required: true, description: 'the file to open'},
    line: {type: 'string', description: 'line number to jump to'},
  },
  run: ({args}) => {
    const parsed = OpenArgs.parse(args)
    return runRpc((rpc) => rpc.editor.open({file: parsed.file, line: parsed.line}))
  },
})
