export {defineExtension} from './define-extension.js'
export type {
  AnyExtension,
  AnyToolBuilder,
  ExtensionBuilder,
  ExtensionMeta,
  RegisterExtension,
} from './define-extension.js'
export type {
  ComposerActionDecl,
  ComposerControlDecl,
  ExtensionTableDecl,
  HostApi,
  HostChat,
  HostState,
  HostUi,
  PageAgent,
} from './host-types.js'
export {defineTool} from './define-tool.js'
export type {ToolBuilder} from './define-tool.js'
export {imageResult} from './image-result.js'
export type {ContentPart} from '@tanstack/ai'
export {collectToolRenderers} from './collect-client.js'
export {getExtensionApi, useClientApi, installClientApi} from './extension-api.js'
export type {ExtensionApi, ExtensionId, Register} from './extension-api.js'
export type {
  ClientApi,
  PageInspect,
  ClientFactoryResult,
  ComposerActions,
  ConfigOf,
  ExtensionCommand,
  ExtensionHostContext,
  ExtensionServerTool,
  ExtensionSlot,
  ExtensionTool,
  ExtensionView,
  ExtensionViewHost,
  RequiredContext,
  ServerApi,
  ServerHarness,
  ServerSessions,
  ServerResult,
  ToolRenderer,
  ToolRequest,
} from './types.js'
export {HostProvider, useHost, useSlot} from './host.js'
export {extensionError, isExtensionError, type ExtensionError, type ExtensionErrorCode} from './errors.js'
