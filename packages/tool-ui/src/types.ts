// The card-render contract lives in @mandarax/protocol (a leaf both the renderer and the authoring
// layer depend on). Re-exported so cards keep importing it from './types.js'.
export type {
  ToolAccent,
  ToolViewCtx,
  ToolCardProps,
  ToolRenderContext,
  ToolRenderResultOptions,
} from '@mandarax/protocol/tool-view-types'
