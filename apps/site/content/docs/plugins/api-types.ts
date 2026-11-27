import type {
  Info as PromiseToolInfo,
  Plugin as PromisePlugin,
  ToolContext as PromiseToolContext,
  ToolEditor as PromiseToolEditor,
} from '@conciv/backend-plugin-api'
import type {Plugin as EffectPlugin} from '@conciv/backend-plugin-api/effect'
import type {ToolEditor as EffectToolEditor} from '@conciv/backend-plugin-api/effect/tool'
import type {
  ComposerPill,
  ComposerPillView,
  Context,
  Panel,
  PanelTab,
  Plugin as BrowserPlugin,
  SettingsPage,
  Slot,
  ToolProps,
  ToolRegistry,
} from '@conciv/frontend-plugin-api'
import type * as Tool from '@conciv/protocol/schema/tool'
import type * as Rpc from '@conciv/protocol/schema/rpc'

export type PromiseDefinition = PromisePlugin.Plugin

export type EffectDefinition = EffectPlugin.Plugin

export type BrowserDefinition = BrowserPlugin.Definition

export type PromiseContext = Omit<PromisePlugin.Context, 'experimental'>

export type EffectContext = Omit<EffectPlugin.Context, 'experimental'>

export type PromiseToolDefinition = PromiseToolInfo

export type EffectToolDefinition = Tool.Info

export type PromiseToolCallContext = PromiseToolContext

export type EffectToolCallContext = Tool.Context

export type PromiseTools = PromiseToolEditor

export type EffectTools = EffectToolEditor

export type ToolResult = Tool.Result

export type RpcMethod = Rpc.Method

export type BrowserContext = Context

export type PanelDefinition = Panel

export type PanelTabDefinition = PanelTab

export type SlotDefinition = Extract<Slot, {readonly at: 'session.status'}>

export type ComposerPillDefinition = ComposerPill

export type ComposerPillShown = ComposerPillView

export type SettingsPageDefinition = SettingsPage

export type ToolCardDefinition = ToolRegistry

export type ToolCardProps = ToolProps
