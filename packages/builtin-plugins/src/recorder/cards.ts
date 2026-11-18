import type {ToolCardView} from '@conciv/protocol/tool-view-types'
import {toolFallbackCardView} from '@conciv/ui-kit-chat/tools'

export const recorderCards = {
  recording_start: toolFallbackCardView,
  recording_stop: toolFallbackCardView,
  recording_pull: toolFallbackCardView,
} satisfies Record<string, ToolCardView>
