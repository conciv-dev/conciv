import {test as base} from 'vitest'
import {createComponent} from 'solid-js'
import {render, screen} from '@solidjs/testing-library'
import {ConcivApp, type Platform} from '@conciv/app'
import {dropChatTurns, failChatTurns} from './chat-fault.js'
import {disposeAll} from './dispose.js'
import {forkEngine, type EngineProcess} from './engine-process.js'
import {provideExpectLog, type ExpectLog} from './expect-log.js'
import type {FlowFaults} from './flow.js'
import {abortRpcCalls, failRpcCalls, gateRpcCalls} from './rpc-fault.js'
import {rpcSocketFor} from './rpc-socket.js'

export type MountOptions = {plugins?: Platform['plugins']}

export type Chat = {
  reply: (text: string) => Promise<void>
  hold: () => Promise<void>
  release: () => Promise<void>
}

export type BrowserFaults = FlowFaults & {
  offline: () => Promise<void>
  online: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
}

export type BrowserFixtures = {
  $file: {engine: EngineProcess}
  $test: {
    chat: Chat
    faults: BrowserFaults
    mount: (options?: MountOptions) => Promise<void>
    expectLog: ExpectLog
  }
}

const ENGINE_TIMINGS: NonNullable<Platform['timings']>['engine'] = {
  reconnectMinDelayMs: 10,
  reconnectMaxDelayMs: 50,
  connectionLossRetryDelayMs: 10,
  offlineGraceMs: 10,
}

async function settle(call: Promise<unknown>): Promise<void> {
  await call
}

export const test = base.extend<BrowserFixtures>({
  engine: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      const engine = await forkEngine()
      try {
        await use(engine)
      } finally {
        await engine.stop()
      }
    },
    {scope: 'file'},
  ],
  chat: async ({engine}, use) => {
    try {
      await use({
        reply: (text) => settle(engine.call({kind: 'reply', text})),
        hold: () => settle(engine.call({kind: 'hold'})),
        release: () => settle(engine.call({kind: 'release'})),
      })
    } finally {
      await engine.call({kind: 'release'})
    }
  },
  faults: async ({engine, mount: _mount}, use) => {
    const disposers: (() => Promise<void>)[] = []
    const tracked = async <Fault extends {dispose: () => Promise<void>}>(made: Promise<Fault>): Promise<Fault> => {
      const fault = await made
      disposers.push(fault.dispose)
      return fault
    }
    const source = engine.proxy
    try {
      await use({
        failRpc: (options) => tracked(failRpcCalls(source, options)),
        abortRpc: (options) => tracked(abortRpcCalls(source, options)),
        gateRpc: (options) => tracked(gateRpcCalls(source, options)),
        failChatTurns: (options) => tracked(failChatTurns(source, options)),
        dropChatTurns: () => tracked(dropChatTurns(source)),
        offline: () => settle(engine.call({kind: 'offline'})),
        online: () => settle(engine.call({kind: 'online'})),
        pause: () => settle(engine.call({kind: 'pause'})),
        resume: () => settle(engine.call({kind: 'resume'})),
      })
    } finally {
      await disposeAll(
        [...disposers, () => settle(engine.call({kind: 'resume'})), () => settle(engine.call({kind: 'online'}))],
        'parallel',
        'a browser fault did not dispose cleanly',
      )
    }
  },
  expectLog: provideExpectLog,
  mount: async ({engine}, use) => {
    const mounted: Array<() => void> = []
    try {
      await use(async (options = {}) => {
        await engine.call({kind: 'session'})
        await rpcSocketFor(engine.proxy).installed
        const platform: Platform = {
          engine: () => ({kind: 'bound', apiBase: engine.proxy.apiBase, token: () => Promise.resolve(engine.token)}),
          navigation: {memory: '/'},
          root: document,
          plugins: options.plugins,
          timings: {engine: ENGINE_TIMINGS},
        }
        mounted.push(render(() => createComponent(ConcivApp, {platform})).unmount)
        await screen.findByRole('button', {name: 'Open conciv chat'})
      })
    } finally {
      for (const unmount of mounted) unmount()
      localStorage.clear()
      await engine.settled()
    }
  },
})
