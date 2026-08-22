import type {ToolRegistry} from '@conciv/extension/registry'
import type {EngineStaleness} from '@conciv/contract'
import {createAskRegistry} from '../../src/chat/ask.js'
import {createLiveRuns} from '../../src/chat/live-runs.js'
import {createSessionStreams} from '../../src/chat/subscribe.js'
import {makeCompactor, makeSend} from '../../src/chat/run.js'
import {makeCoreRuntime} from '../../src/runtime/core-runtime.js'
import type {CoreRuntime, ScopedToolCall} from '../../src/runtime/scope-types.js'
import type {SessionPrimitives} from '../../src/runtime/primitives.js'
import type {PageEnv} from '../../src/page-bus.js'
import {makeChatFixture} from './chat-fixture.js'

const FRESH: EngineStaleness = {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'test'}

export async function pageRuntime(page: PageEnv, registry: ToolRegistry): Promise<CoreRuntime> {
  const fixture = await makeChatFixture()
  const primitives: SessionPrimitives = {
    asks: createAskRegistry(),
    stream: createSessionStreams(),
    liveRuns: createLiveRuns(),
    page,
    registry,
  }
  return makeCoreRuntime({
    primitives,
    chat: fixture.chat,
    send: makeSend(fixture.chat),
    compactor: makeCompactor(fixture.chat),
    model: () => null,
    staleness: () => FRESH,
  })
}

export function scopedToolCallOf(runtime: CoreRuntime): ScopedToolCall {
  return (name, input, request) =>
    runtime.forSession(request.sessionId).tools.call(name, input, {toolCallId: request.toolCallId})
}
