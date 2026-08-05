import {z} from 'zod'
import {BUILTIN_OPEN_TOOL} from '@conciv/tools/builtins'
import {runRpc} from './request.js'
import {toolCommand} from './tool-command.js'

const EditorOpen = z.object({file: z.string(), line: z.number().optional()})

export const openCommand = toolCommand(BUILTIN_OPEN_TOOL, {
  name: 'open',
  positional: 'file',
  run: (input) => runRpc((rpc) => rpc.editor.open(EditorOpen.parse(input))),
})
