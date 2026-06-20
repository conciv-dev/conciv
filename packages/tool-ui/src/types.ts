// The card-render contract now lives in @mandarax/protocol (a leaf both the renderer and the
// extension authoring layer can depend on without a package cycle). Re-exported here so every card
// keeps importing it from './types.js'.
import type {Component} from 'solid-js'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'
export type {ToolAccent, ToolViewCtx, ToolCardProps} from '@mandarax/protocol/tool-view-types'

// A tool's card, co-located with the tool by the name(s) it renders. Built-in and extension tools
// share this one shape; the host passes an array of them and ToolCallCard matches a part by name.
// (Named ToolCardEntry to avoid colliding with the ToolCard shell component in shell.tsx.)
export type ToolCardEntry = {names: string[]; render: Component<ToolCardProps>}
