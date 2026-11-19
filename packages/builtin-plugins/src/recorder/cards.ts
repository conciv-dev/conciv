import type {ToolRegistry} from '@conciv/plugin/experimental'
import {recordingCard, recordingFailedCard} from './recording-card.js'

const recorderEntry = {render: recordingCard, errorComponent: recordingFailedCard} satisfies Pick<
  ToolRegistry,
  'render' | 'errorComponent'
>

export const recorderCards = {
  recording_start: recorderEntry,
  recording_stop: recorderEntry,
  recording_pull: recorderEntry,
} satisfies Record<string, Pick<ToolRegistry, 'render' | 'errorComponent'>>
