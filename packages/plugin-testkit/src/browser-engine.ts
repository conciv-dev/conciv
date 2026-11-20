import {expect, onTestFinished} from 'vitest'
import {commands} from 'vitest/browser'
import type {CreateEngineOptions, Engine, EngineAddress, EngineSession} from './engine.js'
import type {} from './browser-commands.js'

const addresses = new WeakMap<Engine, EngineAddress>()

function sessionOn(engineId: string, id: string): EngineSession {
  return {
    id,
    send: (text) => commands.concivSend(engineId, id, text),
    approve: () => commands.concivApprove(engineId, id),
    tool: (name) => ({
      call: (input) => commands.concivToolCall(engineId, id, name, input),
      failure: (input) => commands.concivToolFailure(engineId, id, name, input),
    }),
  }
}

export async function createEngine(options: CreateEngineOptions = {}): Promise<Engine> {
  const inTest = expect.getState().currentTestName !== undefined
  const handle = await commands.concivCreateEngine(options, inTest ? 'test' : 'file')
  if (inTest) onTestFinished(() => commands.concivStopEngine(handle.id))
  const engine: Engine = {
    session: sessionOn(handle.id, handle.sessionId),
    newSession: async (title) => sessionOn(handle.id, await commands.concivNewSession(handle.id, title)),
    setting: (setting) => commands.concivSetting(handle.id, setting),
  }
  addresses.set(engine, handle.address)
  return engine
}

export function engineAddress(engine: Engine): EngineAddress {
  const address = addresses.get(engine)
  if (!address) throw new Error('mount needs an engine made by createEngine from @conciv/plugin-testkit/node')
  return address
}
