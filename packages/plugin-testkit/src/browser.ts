import {test as base} from 'vitest'
import {createComponent} from 'solid-js'
import {configure, render, screen} from '@solidjs/testing-library'
import {ConcivApp, type Platform} from '@conciv/app'
import {forkEngine, type EngineProcess} from './engine-process.js'

export type MountOptions = {plugins?: Platform['plugins']}

export type Chat = {
  reply: (text: string) => Promise<void>
  hold: () => Promise<void>
  release: () => Promise<void>
}

export type BrowserFixtures = {
  $file: {engine: EngineProcess}
  $test: {chat: Chat; mount: (options?: MountOptions) => Promise<void>}
}

const FIND_TIMEOUT_MS = 20_000

configure({asyncUtilTimeout: FIND_TIMEOUT_MS})

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
  mount: async ({engine}, use) => {
    const mounted: Array<() => void> = []
    try {
      await use(async (options = {}) => {
        await engine.call({kind: 'session'})
        const platform: Platform = {
          engine: () => ({kind: 'bound', apiBase: engine.apiBase, token: () => Promise.resolve(engine.token)}),
          navigation: {memory: '/'},
          root: document,
          plugins: options.plugins,
        }
        mounted.push(render(() => createComponent(ConcivApp, {platform})).unmount)
        await screen.findByRole('button', {name: 'Open conciv chat'})
      })
    } finally {
      for (const unmount of mounted) unmount()
    }
  },
})
