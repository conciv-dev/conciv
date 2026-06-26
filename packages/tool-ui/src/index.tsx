// CSS ships alongside (tokens.css + tool-ui.css) for the host to import; not bundled into the JS.
// Public surface: the by-name dispatcher, the shared card shell, the cards, and the typed helpers.
import type {ToolCardEntry} from './types.js'
import {shellTool} from './cards/shell.js'
import {fileEditTool} from './cards/file-edit.js'
import {fileReadTool} from './cards/file-read.js'
import {searchTool} from './cards/search.js'
import {todoTool} from './cards/todo.js'
import {pageActionTool} from './cards/page-action.js'
import {uiTool} from './cards/ui-chip.js'

export {ToolCallCard, type ToolCallCardProps} from './tool-call.js'
export {ApprovalBar} from './approval-bar.js'
export {ToolCard} from './shell.js'
export {GenericCard} from './cards/generic.js'
export {ShellCard, shellTool} from './cards/shell.js'
export {FileEditCard, fileEditTool} from './cards/file-edit.js'
export {FileReadCard, fileReadTool} from './cards/file-read.js'
export {SearchCard, searchTool} from './cards/search.js'
export {TodoCard, todoTool} from './cards/todo.js'
export {PageActionCard, pageActionTool} from './cards/page-action.js'
export {UiCard, uiTool} from './cards/ui-chip.js'
export {ChainOfThought, Reasoning} from './thinking.js'
export {NowLine} from './now-line.js'
export {nowTitle} from './now-title.js'
export {DoneCard} from './done-card.js'
export {parseInput, resultText, toolGlyph, type ToolGlyph} from './util.js'
export type {ToolCardProps, ToolViewCtx, ToolAccent, ToolCardEntry} from './types.js'

// The built-in cards the package ships, as an array of self-describing entries (each co-located with
// its card). The host spreads this with extension tool cards and passes the result to ToolCallCard.
export const builtinToolCards: ToolCardEntry[] = [
  shellTool,
  fileEditTool,
  fileReadTool,
  searchTool,
  todoTool,
  pageActionTool,
  uiTool,
]
