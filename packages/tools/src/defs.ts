// Browser-safe barrel: the aidx tool definitions + their zod input schemas, with no node deps, so
// the tool-ui renderers can import the schemas as the single source of truth for typed rendering.
export {aidxPageToolDef, PageInput} from './page.js'
export {aidxTestToolDef, TestInput} from './test.js'
export {aidxUiToolDef, UiInput} from './ui.js'
export {aidxOpenToolDef, OpenInput} from './open.js'
