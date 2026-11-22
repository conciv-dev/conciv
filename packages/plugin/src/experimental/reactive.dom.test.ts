import {createRoot, createSignal, onCleanup} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {createKeyed} from './reactive.js'

describe('reactive helpers and scope', () => {
  it('createKeyed runs once per value, ends each run before the next, and runs otherwise while there is no value', () => {
    const seen: string[] = []
    const [tab, setTab] = createSignal<string | undefined>('files')
    const end = createRoot((dispose) => {
      createKeyed(
        tab,
        (value) => {
          seen.push(`start ${value}`)
          onCleanup(() => seen.push(`end ${value}`))
        },
        {otherwise: () => onCleanup(() => seen.push('end no tab'))},
      )
      return dispose
    })

    expect(seen).toEqual(['start files'])

    setTab('search')
    expect(seen).toEqual(['start files', 'end files', 'start search'])

    setTab(undefined)
    expect(seen).toEqual(['start files', 'end files', 'start search', 'end search'])

    end()
    expect(seen).toEqual(['start files', 'end files', 'start search', 'end search', 'end no tab'])
  })
})
