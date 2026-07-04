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
  RequiredContext,
  ServerApi,
  ServerResult,
  ToolRenderer,
  ToolRequest,
} from './types.js'
