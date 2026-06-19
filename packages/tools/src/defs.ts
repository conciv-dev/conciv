// Browser-safe barrel: the mandarax tool definitions + their zod input schemas, with no node deps, so
// the tool-ui renderers can import the schemas as the single source of truth for typed rendering.
export {mandaraxPageToolDef, PageInput} from './page.js'
export {mandaraxTestToolDef, TestInput} from './test.js'
export {mandaraxUiToolDef, UiInput} from './ui.js'
export {mandaraxOpenToolDef, OpenInput} from './open.js'
