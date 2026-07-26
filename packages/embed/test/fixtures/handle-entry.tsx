import terminal from '@conciv/extension-terminal/client'
import {defineExtension, getHostApi} from '@conciv/extension'
import type {JSX} from 'solid-js'
import {createConciv, type ConcivHandle} from '../../src/mount.js'

function ApiBaseProbe(): JSX.Element {
  const apiBase = getHostApi().useApiBase()
  return (
    <output
      aria-label="host api base probe"
      style={{position: 'fixed', bottom: '0', left: '0', 'pointer-events': 'none', opacity: '0'}}
    >
      {apiBase()}
    </output>
  )
}

const apiBaseProbe = defineExtension({name: 'api-base-probe', Surface: ApiBaseProbe}).client(() => ({value: {}}))

export function makeHandle(apiBase: string): ConcivHandle {
  return createConciv({extensions: [terminal, apiBaseProbe], apiBase})
}
