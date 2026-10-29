import {ChatEventType, type ChatEvent} from '@conciv/ai/events'

export function* scriptedRunChunks(text: string): Generator<ChatEvent> {
  yield {type: ChatEventType.RUN_STARTED, threadId: 'scripted', runId: 'scripted'}
  yield {type: ChatEventType.TEXT_MESSAGE_START, messageId: 'scripted-m1', role: 'assistant'}
  yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'scripted-m1', delta: text}
  yield {type: ChatEventType.TEXT_MESSAGE_END, messageId: 'scripted-m1'}
  yield {type: ChatEventType.RUN_FINISHED, threadId: 'scripted', runId: 'scripted'}
}

export function* runErrorChunks(message: string): Generator<ChatEvent> {
  yield {type: ChatEventType.RUN_STARTED, threadId: 'scripted', runId: 'scripted'}
  yield {type: ChatEventType.RUN_ERROR, message}
}
