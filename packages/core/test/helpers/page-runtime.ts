import type {ToolRegistry} from '@conciv/extension/registry'
import type {EngineStaleness} from '@conciv/contract'
import {createAskRegistry} from '@conciv/chat/ask'
import {createCommandMemory} from '@conciv/chat/command-memory'
import {createSessionStreams} from '@conciv/chat/session-events'
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
    commandMemory: createCommandMemory(),
    stream: createSessionStreams(),
    page,
    registry,
  }
  return makeCoreRuntime({
    primitives,
    plane: fixture.plane,
    model: () => null,
    staleness: () => FRESH,
  })
}

export function scopedToolCallOf(runtime: CoreRuntime): ScopedToolCall {
  return (name, input, request) =>
    runtime.forSession(request.sessionId).tools.call(name, input, {toolCallId: request.toolCallId})
}
