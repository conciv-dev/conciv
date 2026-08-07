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
  ClientConsoleEntry,
  ClientToolCtx,
  ClientToolLocator,
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
export {sanitizeIdentifier, uniqueIdentifier} from './sanitize-identifier.js'
export {defineAttachment} from './define-attachment.js'
export type {AnyAttachmentBuilder, AttachmentBuilder} from './define-attachment.js'
export {imageResult} from './image-result.js'
export type {ContentPart} from '@tanstack/ai'
export {
  collectAttachmentCards,
  collectClientEffects,
  collectClientTools,
  collectToolRenderers,
} from './collect-client.js'
export type {ClientToolEntry} from './collect-client.js'
export {getExtensionApi} from './extension-api.js'
export type {ExtensionApi, ExtensionId} from './extension-api.js'
export {getHostApi, HostApiProvider} from './hooks.js'
export type {ConnectHostApi, HostWiring} from './host-context.js'
export type {
  AttachmentCardEntry,
  AttachmentCardProps,
  AttachmentDocumentPart,
  AttachmentExpand,
  ClientEffect,
  ClientFactoryResult,
  ConfigOf,
  ConnectGate,
  ExtensionAttachment,
  ExtensionCommand,
  ExtensionPromptContext,
  ExtensionServerTool,
  ExtensionSlot,
  ExtensionTool,
  ExtensionView,
  RequiredContext,
  ServerApi,
  ServerHarness,
  ServerPageCaller,
  ServerToolCaller,
  ServerSessions,
  ServerResult,
  SystemPromptFactory,
  SystemPromptResolver,
  ToolRenderer,
  ToolRequest,
} from './types.js'
export {MountedExtension, MountedSurface, MountedView} from './mount-extension.js'
export type {MountedExtensionProps, MountedSurfaceProps, MountedViewProps} from './mount-extension.js'
export {ensureEffectsSurface, openSource, EFFECTS_SURFACE_ATTR} from './client-host.js'
export {makeExtRpcClient} from './ext-rpc.js'
export type {ExtRpcClientOpts, ExtRpcContext} from './ext-rpc.js'
export {subscriptionIterator} from './server-stream.js'
export {pageVerbError, isPageVerbError} from './page-errors.js'
export type {PageVerbError} from './page-errors.js'
