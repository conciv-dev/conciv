import {createSignal, For, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {RigState} from './rig.js'
import {bubbleVariations} from './story-bubble-effects.js'
import {
  cellStyle,
  gridStyle,
  labelStyle,
  noteStyle,
  pageStyle,
  RigStage,
  rowStyle,
  stageWrapStyle,
  TipTransition,
  toggleStyle,
} from './story-support.js'

const meta: Meta = {title: 'mascot/WorkBubblePlayground'}
export default meta
type Story = StoryObj

function Playground(): JSX.Element {
  const [working, setWorking] = createSignal(true)
  const state = (): RigState => (working() ? 'work' : 'closed')

  return (
    <div style={pageStyle}>
      <div style={rowStyle}>
        <button
          type="button"
          aria-pressed={working()}
          onClick={() => setWorking((current) => !current)}
          style={toggleStyle}
        >
          {working() ? 'working' : 'idle'}
        </button>
        <span style={noteStyle}>
          {working() ? 'bubbles run while working' : 'closed: eyes follow the cursor, no bubbles'}
        </span>
      </div>
      <div style={gridStyle}>
        <For each={bubbleVariations}>
          {(variation) => (
            <div style={cellStyle}>
              <div style={stageWrapStyle}>
                <RigStage state={state()} />
                <TipTransition active={working()}>
                  <Dynamic component={variation.effect} />
                </TipTransition>
              </div>
              <span style={labelStyle}>{variation.name}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export const Playground6Up: Story = {
  render: () => <Playground />,
}
