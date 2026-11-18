import type {ToolComponent} from '@conciv/plugin/experimental'
import {recordingCard} from './recording-card.js'

export const recorderCards = {
  recording_start: recordingCard,
  recording_stop: recordingCard,
  recording_pull: recordingCard,
} satisfies Record<string, ToolComponent>
