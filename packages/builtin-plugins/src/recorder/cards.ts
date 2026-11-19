import type {ToolCardView} from '@conciv/protocol/tool-view-types'
import {recordingCard} from './recording-card.js'

export const recorderCards = {
  recording_start: recordingCard,
  recording_stop: recordingCard,
  recording_pull: recordingCard,
} satisfies Record<string, ToolCardView>
