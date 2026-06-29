import type {ToolCardEntry} from '@mandarax/protocol/tool-view-types'
import {BashCard} from './bash-card.js'
import {ApplyPatchDiff} from './apply-patch-diff.js'
import {fileEditTool} from './file-edit-card.js'
import {fileReadTool} from './file-read-card.js'
import {searchTool} from './search-card.js'
import {todoTool} from './todo-card.js'

// The generic tool vocabulary ui-kit-chat ships, as self-describing entries (Pi/TanStack model). The
// host spreads this with extension tools + app-specific entries and passes the result to the Thread /
// ToolCallCard, which dispatch by name (unmatched names fall through to ToolFallback).
export const builtinToolCards: ToolCardEntry[] = [
  {names: ['Bash'], render: BashCard},
  {names: ['apply_patch'], render: ApplyPatchDiff},
  fileEditTool,
  fileReadTool,
  searchTool,
  todoTool,
]
