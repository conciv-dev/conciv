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

function mountBaseProbe(label: string): () => JSX.Element {
  return () => {
    const mountedBase = getHostApi().useApiBase()()
    return (
      <output aria-label={label} style={{position: 'fixed', bottom: '0', right: '0', opacity: '0'}}>
        {mountedBase}
      </output>
    )
  }
}

const mountProbe = defineExtension({
  name: 'mount-probe',
  Surface: mountBaseProbe('surface mount api base'),
  views: [{id: 'mount-probe', label: 'Mount probe', Component: mountBaseProbe('view mount api base')}],
}).client(() => ({value: {}}))

export function makeHandle(apiBase: string): ConcivHandle {
  return createConciv({extensions: [terminal, apiBaseProbe, mountProbe], apiBase})
}
