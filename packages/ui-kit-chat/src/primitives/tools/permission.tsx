import {createContext, createSignal, useContext, type Accessor, type JSX} from 'solid-js'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'

// Headless native-approval logic ([[native-approval-hybrid]]): tanstack drives the part into
// `approval-requested` (part.state + part.approval) from the harness's approval event; answering posts
// the decision out-of-band via ctx.respondApproval (→ the widget's client.permissionDecision), which
// unblocks the gate. The live stream then settles the same part to complete/error. We optimistically
// mark answered on click so the controls don't linger. No classes — styled/tools/permission-card adds them.
type PermissionContextValue = {
  pending: Accessor<boolean>
  approve: () => void
  reject: () => void
}

const PermissionContext = createContext<PermissionContextValue>()

export function usePermission(): PermissionContextValue {
  const context = useContext(PermissionContext)
  if (!context) throw new Error('Permission.* must be used within Permission.Root')
  return context
}

function Root(props: {part: ToolCallPart; ctx: ToolViewCtx; children: JSX.Element}): JSX.Element {
  const [answered, setAnswered] = createSignal(false)
  const approval = () => props.part.approval
  const pending = () =>
    !answered() &&
    props.part.state === 'approval-requested' &&
    approval() !== undefined &&
    Boolean(props.ctx.respondApproval)
  const decide = (approved: boolean) => {
    const id = approval()?.id
    if (!id) return
    setAnswered(true)
    props.ctx.respondApproval?.(id, approved)
  }
  return (
    <PermissionContext.Provider value={{pending, approve: () => decide(true), reject: () => decide(false)}}>
      {props.children}
    </PermissionContext.Provider>
  )
}

export const Permission = Object.assign(Root, {Root})
