import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, waitFor, within} from 'storybook/test'
import {createSignal, type JSX} from 'solid-js'
import {defineEffect, type EffectCtx, type EffectDefinition} from '@mandarax/extensions'
import {makeEffects} from './page-effects.js'
import {highlightEffect} from './effects/highlight.js'

function seamCtx(): Omit<EffectCtx, 'disable'> {
  return {
    page: {
      elementAt: () => null,
      componentHostAt: () => null,
      describe: () => ({component: '', file: null}),
      locate: async () => null,
      inspect: async () => null,
      tree: async () => ({nodes: [], truncated: 0}),
      find: () => ({matches: [], total: 0}),
      addRef: () => 'r0',
    },
    openSource: async () => 'opened',
    toast: () => {},
    env: {reducedMotion: () => true, doc: document, win: window},
  }
}

const EffectOnView = (): JSX.Element => <div>effect on</div>
const demo = defineEffect({name: 'highlight', label: 'Highlight', description: 'test effect', render: EffectOnView})

function Probe() {
  const [snap, setSnap] = createSignal('idle')
  const fx = makeEffects(() => [demo], seamCtx())
  const enabled = () => fx.listEffects().effects.find((e) => e.name === 'highlight')?.enabled
  return (
    <div style={{color: '#fff'}}>
      <button
        onClick={() => {
          fx.setEffect('highlight', true)
          fx.setEffect('highlight', true)
          setSnap(`on:${enabled()}`)
        }}
      >
        enable
      </button>
      <button
        onClick={() => {
          fx.setEffect('highlight', false)
          setSnap(`off:${enabled()}`)
        }}
      >
        disable
      </button>
      <button
        onClick={() => {
          fx.toggleEffect('highlight')
          setSnap(`toggle:${enabled()}`)
        }}
      >
        toggle
      </button>
      <output>{snap()}</output>
    </div>
  )
}

// One instance per render keeps the hotkey story isolated; the play function reads its live state.
let hotkeyFx: ReturnType<typeof makeEffects>
function HotkeyProbe() {
  const effects: EffectDefinition[] = [highlightEffect]
  hotkeyFx = makeEffects(() => effects, seamCtx())
  return <div style={{color: '#fff'}}>hold Alt to inspect</div>
}

const isHighlightOn = () => hotkeyFx.listEffects().effects.find((e) => e.name === 'highlight')?.enabled ?? false

const meta: Meta<typeof Probe> = {title: 'widget/PageEffects', component: Probe}
export default meta
type Story = StoryObj<typeof Probe>

export const DispatchLifecycle: Story = {
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', {name: 'enable'}))
    await expect(c.getByText('on:true')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: 'disable'}))
    await expect(c.getByText('off:false')).toBeVisible()
    await userEvent.click(c.getByRole('button', {name: 'toggle'}))
    await expect(c.getByText('toggle:true')).toBeVisible()
  },
}

export const HoldAltToInspect: StoryObj = {
  render: () => <HotkeyProbe />,
  play: async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Alt'}))
    await waitFor(() => expect(isHighlightOn()).toBe(true))
    document.dispatchEvent(new KeyboardEvent('keyup', {key: 'Alt'}))
    await waitFor(() => expect(isHighlightOn()).toBe(false))
  },
}
