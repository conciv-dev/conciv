export {defineExtension} from './define-extension.js'
export type {
  AnyExtension,
  AnyToolBuilder,
  ExtensionBuilder,
  ExtensionMeta,
  RegisterExtension,
} from './define-extension.js'
export {defineTool} from './define-tool.js'
export type {ToolBuilder} from './define-tool.js'
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
  ExtensionServerTool,
  ExtensionSlot,
  ExtensionTool,
  ExtensionView,
  RequiredContext,
  ServerApi,
  ServerHarness,
  ServerSessions,
  ServerResult,
  ToolRenderer,
  ToolRequest,
} from './types.js'
export {MountedExtension, MountedSurface, MountedView} from './mount-extension.js'
export type {MountedExtensionProps, MountedSurfaceProps, MountedViewProps} from './mount-extension.js'
export {ensureEffectsSurface, openSource, EFFECTS_SURFACE_ATTR} from './client-host.js'
export {makeExtRpcClient} from './ext-rpc.js'
export type {ExtRpcClientOpts, ExtRpcContext} from './ext-rpc.js'
export {subscriptionIterator} from './server-stream.js'
export {definePageVerbs, pageVerb, pageVerbError, isPageVerbError, noWidgetPageCaller} from './page-verbs.js'
export type {
  AnyPageVerbDef,
  PageCaller,
  PageVerbDef,
  PageVerbError,
  PageVerbErrorCode,
  PageVerbMap,
} from './page-verbs.js'
