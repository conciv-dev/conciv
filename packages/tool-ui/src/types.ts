// The card-render contract now lives in @mandarax/protocol (a leaf both the renderer and the
// extension authoring layer can depend on without a package cycle). Re-exported here so every card
// keeps importing it from './types.js'.
export type {ToolAccent, ToolViewCtx, ToolCardProps} from '@mandarax/protocol/tool-view-types'
