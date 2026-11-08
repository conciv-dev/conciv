import {For, Show, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'
import type {Box} from '../shared/defs.js'
import type {createXrayState} from './state.js'
import type {createXrayView} from './view.js'

export function Boxes(props: {
  xray: ReturnType<typeof createXrayState>
  view: ReturnType<typeof createXrayView>
}): JSX.Element {
  return (
    <div aria-label="Design x-ray boxes" role="group" class="inset-0 absolute">
      <Show when={props.xray.state.layers.changed}>
        <For each={props.view.regions()}>
          {(region) => <div aria-hidden="true" class="bg-chat-accent-08 absolute" style={placed(region.box)} />}
        </For>
      </Show>
      <For each={props.view.visible()}>
        {(entry) => (
          <>
            <Show when={props.xray.state.layers.fom}>
              <For each={entry.node.fom.flatMap((pair) => (pair.box === null ? [] : [pair.box]))}>
                {(box) => (
                  <div
                    aria-hidden="true"
                    class="outline-1 outline-dashed absolute"
                    style={{...placed(box), 'outline-color': hue(entry.shown)}}
                  />
                )}
              </For>
            </Show>
            <Show when={props.xray.state.layers.dom}>
              <For each={entry.node.dom}>
                {(dom, index) => (
                  <Button
                    variant="plain"
                    size="none"
                    tabIndex={props.xray.state.pick && index() === 0 ? 0 : -1}
                    aria-hidden={!props.xray.state.pick || index() > 0}
                    aria-label={`${entry.name} ${entry.node.id}`}
                    aria-pressed={props.xray.state.picked === entry.node.id}
                    class="outline-1 outline-solid absolute aria-pressed:outline-2 hover:bg-chat-accent-08"
                    classList={{
                      'pointer-events-auto': props.xray.state.pick,
                      'pointer-events-none': !props.xray.state.pick,
                      'opacity-40': !props.view.atDesignWidth() && entry.rows.length === 0,
                    }}
                    style={{
                      ...placed(dom.box),
                      'view-transition-name': index() === 0 ? boxName(entry.node.id) : 'none',
                      'outline-color':
                        props.xray.state.picked === entry.node.id ? 'var(--chat-accent)' : hue(entry.shown),
                    }}
                    onClick={() => props.xray.pickId(entry.node.id)}
                  />
                )}
              </For>
            </Show>
          </>
        )}
      </For>
    </div>
  )
}

function placed(box: Box): JSX.CSSProperties {
  return {left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`}
}

function boxName(id: string): string {
  return `box-${CSS.escape(id)}`
}

function hue(shown: string): string {
  return `var(--xray-${shown})`
}
