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
export {collectToolRenderers} from './collect-client.js'
export {getExtensionApi, useClientApi, installClientApi} from './extension-api.js'
export type {ExtensionApi, ExtensionId, Register} from './extension-api.js'
export {MountedExtension, mountExtension} from './mount-extension.js'
export type {MountedExtensionProps, MountExtensionOptions} from './mount-extension.js'
export {ensureEffectsSurface, openSource, EFFECTS_SURFACE_ATTR} from './client-host.js'
export type {
  ClientApi,
  PageInspect,
  ClientFactoryResult,
  ComposerActions,
  ConfigOf,
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
