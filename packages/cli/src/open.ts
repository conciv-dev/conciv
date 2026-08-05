import {EditorOpenInputSchema} from '@conciv/contract'
import {BUILTIN_OPEN_TOOL} from '@conciv/tools/builtins'
import {runRpc} from './request.js'
import {toolCommand} from './tool-command.js'

export const openCommand = toolCommand(BUILTIN_OPEN_TOOL, {
  name: 'open',
  positional: 'file',
  run: (input) => runRpc((rpc) => rpc.editor.open(EditorOpenInputSchema.parse(input))),
})
