export {
  defineExtension,
  defineTool,
  type MandaraxExtension,
  type ExtensionBuilder,
  type UiFactory,
  type EmptyStateProps,
  type EmptyStateFactory,
  type ToolRenderer,
  type ToolBuilder,
  type ExtensionTool,
  type ClientApi,
  type ServerApi,
  type ComposerActionCtx,
  type ExtComposerAction,
  type ExtensionServerTool,
  type ExtensionServerContributions,
} from './contract.js'
export {extensionsModuleSource, collectServerContributions, collectClientContributions} from './discovery.js'
export {buildCatalog, scaffold, validateSource, type Catalog, type CatalogToken, type ScaffoldKind} from './catalog.js'
