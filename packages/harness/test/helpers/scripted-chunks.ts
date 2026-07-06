import {EventType, type StreamChunk} from '@tanstack/ai'

export function* scriptedRunChunks(text: string): Generator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'scripted', runId: 'scripted'}
  yield {type: EventType.TEXT_MESSAGE_START, messageId: 'scripted-m1', role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'scripted-m1', delta: text}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: 'scripted-m1'}
  yield {type: EventType.RUN_FINISHED, threadId: 'scripted', runId: 'scripted'}
}

export function* runErrorChunks(message: string): Generator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'scripted', runId: 'scripted'}
  yield {type: EventType.RUN_ERROR, message}
}
