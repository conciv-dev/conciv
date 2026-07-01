import {describe, it, expect, afterEach} from 'vitest'
import {render} from 'solid-js/web'
import {createSignal} from 'solid-js'
import {track, anyOpen} from '../src/shell/dialogs.js'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.replaceChildren()
})

function Probe(_props: {open?: boolean}) {
  return <div />
}
const TrackedProbe = track(Probe)

describe('foreground overlay stack', () => {
  it('anyOpen follows a tracked overlay opening and closing', async () => {
    const [open, setOpen] = createSignal(false)
    const host = document.createElement('div')
    document.body.appendChild(host)
    disposers.push(render(() => <TrackedProbe open={open()} />, host))
    await Promise.resolve()
    expect(anyOpen()).toBe(false)
    setOpen(true)
    expect(anyOpen()).toBe(true)
    setOpen(false)
    expect(anyOpen()).toBe(false)
  })

  it('drops the layer when the overlay unmounts', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = render(() => <TrackedProbe open={true} />, host)
    await Promise.resolve()
    expect(anyOpen()).toBe(true)
    dispose()
    await Promise.resolve()
    expect(anyOpen()).toBe(false)
  })
})
