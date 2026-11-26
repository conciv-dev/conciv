import {createFakeEngine, type FakeEngine} from '@conciv/client/testing'
import {shellEngine} from './mount-shell.js'
import {pluginBundles, type FakeBundle} from './fake-plugins.js'
import shellBoard from '../fixtures/plugins/shell-board/plugin-experimental.js?raw'

export function boardEngine(options: FakeBundle['options'] = {}): FakeEngine {
  const bundles = [{id: 'shell-board', code: shellBoard, options}]
  return shellEngine(createFakeEngine({handlers: {plugin: pluginBundles(() => bundles)}}))
}
