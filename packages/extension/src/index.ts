export {defineExtension} from './define-extension.js'
export type {
  AnyExtension,
  AnyToolBuilder,
  ExtensionBuilder,
  ExtensionMeta,
  RegisterExtension,
} from './define-extension.js'
export {defineTool, isToolError, toolDefinition, toolError} from './define-tool.js'
export type {
  RegisteredTool,
  RegisteredTools,
  ToolBinding,
  ToolBuilder,
  ToolDefinition,
  ToolError,
  ToolErrorSpec,
  ToolErrors,
  ToolMeta,
  ToolNameProblem,
} from './define-tool.js'
export {defineAttachment} from './define-attachment.js'
export type {AnyAttachmentBuilder, AttachmentBuilder} from './define-attachment.js'
export {imageResult} from './image-result.js'
export type {ContentPart} from '@conciv/protocol/chat-message-types'
export {collectAttachmentCards, collectToolRenderers} from './collect-client.js'
export {getExtensionApi} from './extension-api.js'
export type {ExtensionApi, ExtensionId} from './extension-api.js'
export type {
  AttachmentCardEntry,
  AttachmentCardProps,
  AttachmentDocumentPart,
  AttachmentExpand,
  ClientEffect,
  ClientFactoryResult,
  InferConfig,
  ExtensionAttachment,
  ExtensionCommand,
  ExtensionCommandContext,
  ExtensionPromptContext,
  ExtensionScope,
  ExtensionServerTool,
  ExtensionSettingsSchema,
  ExtensionSlot,
  ExtensionTool,
  ExtensionView,
  NoSettings,
  RequiredContext,
  ServerApi,
  ServerHarness,
  ServerSessions,
  ServerResult,
  ToolCallContext,
  ToolMiddleware,
  SettingsForNamespace,
  InferSettings,
  SettingsReader,
  SettingsRegistry,
  SystemPromptFactory,
  SystemPromptResolver,
  ToolCard,
  ToolRenderer,
  ToolRequest,
} from './types.js'
export {MountedExtension, MountedSurface, MountedView} from './mount-extension.js'
export type {MountedExtensionProps, MountedSurfaceProps, MountedViewProps} from './mount-extension.js'
export {ensureEffectsSurface, openSource} from './client-host.js'
export {EFFECTS_SURFACE_ATTR, CONCIV_UI_SELECTOR} from '@conciv/protocol/page-types'
export {makeExtRpcClient} from './ext-rpc.js'
export {createSettingsStore, mergeSettings, createClientSettings} from '@conciv/contract'
export type {Settings, SettingsState, SettingsStore} from '@conciv/contract'
export type {ExtRpcContext} from './ext-rpc.js'
export {subscriptionIterator} from './server-stream.js'
