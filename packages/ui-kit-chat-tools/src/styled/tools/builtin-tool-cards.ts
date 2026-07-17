import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {BashCard} from './bash-card.js'
import {ApplyPatchDiff} from './apply-patch-diff.js'
import {fileEditTool} from './file-edit-card.js'
import {fileReadTool} from './file-read-card.js'
import {searchTool} from './search-card.js'
import {todoTool} from './todo-card.js'
import {toolLookupTool} from './tool-lookup-card.js'
import {pageActionTool} from '../page-action-card.js'
import {uiTool} from '../ui-chip-card.js'

export const builtinToolCards: ToolCardEntry[] = [
  {names: ['Bash'], render: BashCard},
  {names: ['apply_patch'], render: ApplyPatchDiff},
  fileEditTool,
  fileReadTool,
  searchTool,
  todoTool,
  toolLookupTool,
  pageActionTool,
  uiTool,
]
