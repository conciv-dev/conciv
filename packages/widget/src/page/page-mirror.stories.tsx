import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, userEvent, within} from 'storybook/test'
import {createSignal, onMount} from 'solid-js'
import {mirrorPageAction} from './page-mirror.js'

function targetStyle() {
  return {
    padding: '10px 16px',
    border: '1px solid var(--pw-border)',
    'border-radius': 'var(--pw-radius)',
    background: 'var(--pw-surface)',
    color: 'var(--pw-text)',
    cursor: 'pointer',
  } as const
}

function MirrorDemo(props: {autoplay?: boolean}) {
  const [log, setLog] = createSignal<string[]>([])
  let saveRef: HTMLButtonElement | undefined
  let deleteRef: HTMLButtonElement | undefined

  const agentClick = (el: HTMLButtonElement | undefined, label: string) => {
    if (!el) return
    mirrorPageAction(el)
    el.click()
    setLog((l) => [...l, `clicked ${label}`])
  }

  onMount(() => {
    if (props.autoplay) requestAnimationFrame(() => mirrorPageAction(saveRef!))
  })

  return (
    <div style={{display: 'grid', gap: '20px', width: '360px'}}>
      <div
        style={{
          display: 'flex',
          gap: '12px',
          padding: '24px',
          border: '1px solid var(--pw-border)',
          'border-radius': 'var(--pw-radius)',
          background: 'var(--pw-panel-2, var(--pw-surface))',
        }}
      >
        <button ref={(el) => (saveRef = el)} type="button" style={targetStyle()} onClick={() => undefined}>
          Save
        </button>
        <button ref={(el) => (deleteRef = el)} type="button" style={targetStyle()} onClick={() => undefined}>
          Delete
        </button>
      </div>

      <div style={{display: 'flex', gap: '12px'}}>
        <button type="button" onClick={() => agentClick(saveRef, 'Save')}>
          ▶ Agent clicks Save
        </button>
        <button type="button" onClick={() => agentClick(deleteRef, 'Delete')}>
          ▶ Agent clicks Delete
        </button>
      </div>

      <p style={{margin: 0, opacity: 0.7, 'font-size': '13px'}}>
        {log().length ? log().join(' · ') : 'Idle — trigger an agent action to see the cursor glide + ring.'}
      </p>
    </div>
  )
}

const meta: Meta<typeof MirrorDemo> = {title: 'widget/PageMirror', component: MirrorDemo}
export default meta
type Story = StoryObj<typeof MirrorDemo>

export const Showcase: Story = {
  args: {autoplay: true},
}

export const AgentClick: Story = {
  args: {autoplay: false},
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', {name: '▶ Agent clicks Save'}))
    await expect(c.getByText('clicked Save')).toBeVisible()
  },
}
