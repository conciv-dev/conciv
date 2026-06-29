import type {ToolCardEntry} from '@mandarax/protocol/tool-view-types'
import {BashCard} from './bash-card.js'
import {ApplyPatchDiff} from './apply-patch-diff.js'
import {fileEditTool} from './file-edit-card.js'
import {fileReadTool} from './file-read-card.js'
import {searchTool} from './search-card.js'
import {todoTool} from './todo-card.js'
import {pageActionTool} from '../page-action-card.js'
import {uiTool} from '../ui-chip-card.js'

// The mandarax tool vocabulary, as self-describing entries (Pi/TanStack model). The host spreads this
// with extension tools and passes the result to the Thread / ToolCallCard, which dispatch by name
// (unmatched names fall through to ui-kit-chat's ToolFallback).
export const builtinToolCards: ToolCardEntry[] = [
  {names: ['Bash'], render: BashCard},
  {names: ['apply_patch'], render: ApplyPatchDiff},
  fileEditTool,
  fileReadTool,
  searchTool,
  todoTool,
  pageActionTool,
  uiTool,
]
