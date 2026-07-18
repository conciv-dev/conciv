import terminal from '@conciv/extension-terminal/client'
import {createConciv, type ConcivHandle} from '../../src/mount.js'

export function makeHandle(apiBase: string): ConcivHandle {
  return createConciv({extensions: [terminal], apiBase})
}
