import {createFakeEngine, type FakeEngine, type FakeEngineOptions} from '@internal/test-utils'
import shellBoard from '../fixtures/plugins/shell-board/plugin-experimental.js?raw'
import {shellEngine} from './mount-shell.js'
import {ENGINE_HARNESS, PANE_SESSION} from './sample-data.js'
import {localBundle} from './sample-plugins.js'

const SHIP = {release_ship: {ask: {always: true}, run: () => ({shipped: true})}}

export function paneEngine(options: FakeEngineOptions = {}): FakeEngine {
  return shellEngine(
    createFakeEngine({
      sessions: [{id: PANE_SESSION, title: 'New session'}],
      ...options,
      tools: {...SHIP, ...options.tools},
    }),
  )
}

export function composerEngine(options: FakeEngineOptions = {}): FakeEngine {
  return shellEngine(createFakeEngine({harnesses: [ENGINE_HARNESS], ...options}))
}

export function boardEngine(options: Readonly<Record<string, string | number | boolean>> = {}): FakeEngine {
  return shellEngine(createFakeEngine({bundles: [localBundle('shell-board', shellBoard, {options})]}))
}
