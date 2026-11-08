import {z} from 'zod'
import {EditorOpenInputSchema, type ToolCommandSignature} from '@conciv/contract'
import {userFailure} from './failure.js'
import {runRpc} from './request.js'
import {wireToolCommand} from './tool-command.js'

const OPEN_POSITIONAL = 'file'

export function openCommand(signature: ToolCommandSignature) {
  return wireToolCommand(
    {...signature, positional: OPEN_POSITIONAL},
    {
      name: 'open',
      run: (input, target) => {
        const parsed = EditorOpenInputSchema.safeParse(input)
        if (!parsed.success) throw userFailure(z.prettifyError(parsed.error))
        return runRpc(target, (rpc) => rpc.editor.open(parsed.data))
      },
    },
  )
}
