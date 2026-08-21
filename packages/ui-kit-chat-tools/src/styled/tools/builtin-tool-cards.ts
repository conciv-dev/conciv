import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {bashTool} from './bash-card.js'
import {applyPatchTool} from './apply-patch-diff.js'
import {discoveredApisTool} from './discovered-apis-card.js'
import {fileEditTool} from './file-edit-card.js'
import {fileReadTool} from './file-read-card.js'
import {searchTool} from './search-card.js'
import {todoTool} from './todo-card.js'
import {toolLookupTool} from './tool-lookup-card.js'

export const builtinToolCards: ToolCardEntry[] = [
  bashTool,
  applyPatchTool,
  discoveredApisTool,
  fileEditTool,
  fileReadTool,
  searchTool,
  todoTool,
  toolLookupTool,
]
