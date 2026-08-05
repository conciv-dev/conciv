export {defineExtension} from './define-extension.js'
export type {
  AnyExtension,
  AnyToolBuilder,
  ExtensionBuilder,
  ExtensionMeta,
  RegisterExtension,
} from './define-extension.js'
export {defineTool, isToolError, toolError} from './define-tool.js'
export type {ToolBinding, ToolBuilder, ToolError, ToolErrorSpec, ToolErrors, ToolMeta} from './define-tool.js'
export {createToolRegistry, TOOL_TRANSPORT_ERRORS} from './tool-registry.js'
export type {
  RegistryPageCaller,
  RegistryToolMeta,
  ToolCatalogEntry,
  ToolRegistry,
  ToolSignature,
  ToolSignatureError,
} from './tool-registry.js'
export {sanitizeIdentifier} from './sanitize-identifier.js'
export {defineAttachment} from './define-attachment.js'
export type {AnyAttachmentBuilder, AttachmentBuilder} from './define-attachment.js'
export {imageResult} from './image-result.js'
export type {ContentPart} from '@tanstack/ai'
export {collectAttachmentCards, collectToolRenderers} from './collect-client.js'
export {getExtensionApi} from './extension-api.js'
export type {ExtensionApi, ExtensionId, Register} from './extension-api.js'
export {getHostApi, HostApiProvider} from './hooks.js'
export type {ConnectHostApi, HostWiring} from './host-context.js'
export type {
  AttachmentCardEntry,
  AttachmentCardProps,
  AttachmentDocumentPart,
  AttachmentExpand,
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
export {
  definePageVerbs,
  pageVerb,
  pageVerbError,
  isPageVerbError,
  isPageVerbErrorCode,
  noWidgetPageCaller,
  PAGE_VERB_ERROR_CODES,
} from './page-verbs.js'
export type {
  AnyPageVerbDef,
  PageCaller,
  PageVerbDef,
  PageVerbError,
  PageVerbErrorCode,
  PageVerbMap,
} from './page-verbs.js'
