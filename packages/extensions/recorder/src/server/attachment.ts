import {recordingAttachment} from '../shared/attachment.js'
import {decodeRecordingRef} from '../shared/protocol.js'
import {renderRecording} from './runtime.js'

recordingAttachment.server(async (part, ctx) => {
  const ref = decodeRecordingRef(part.source.value)
  const events = ref ? await ctx.recorder.recordings.get(ref.recordingId) : null
  if (!events) return [{type: 'text', content: '[recording expired]'}]
  return renderRecording(ctx.recorder, events, 3)
})

export {recordingAttachment}
