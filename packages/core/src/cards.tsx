import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {EXECUTE_TOOL_NAME} from './api/execute-schemas.js'
import {CodeRunCard} from './cards/code-run-card.js'

export {CodeRunCard} from './cards/code-run-card.js'

export const coreToolCards: ToolCardEntry[] = [{names: [EXECUTE_TOOL_NAME], render: CodeRunCard}]
