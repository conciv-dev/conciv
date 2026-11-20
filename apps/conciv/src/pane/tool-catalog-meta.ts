import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'

export function mergeToolMeta(
  signature: ToolViewMeta | undefined,
  view: ToolViewMeta | undefined,
): ToolViewMeta | undefined {
  if (signature === undefined) return view
  return {...signature, icon: signature.icon ?? view?.icon, label: signature.label ?? view?.label}
}
