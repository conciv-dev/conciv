// Package entry ("."): the node-side server tools the MCP server binds to a runtime context.
export type {AidxServerTool, AidxToolContext} from './types.js'
export {aidxTools} from './server.js'

// The definitions + schemas are also exported from the browser-safe `./defs` subpath.
export {aidxPageToolDef, PageInput} from './page.js'
export {aidxTestToolDef, TestInput} from './test.js'
export {aidxUiToolDef, UiInput} from './ui.js'
export {aidxOpenToolDef, OpenInput} from './open.js'
