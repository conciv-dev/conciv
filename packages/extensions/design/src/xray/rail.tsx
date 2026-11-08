import {For, type JSX} from 'solid-js'
import type {z} from 'zod'
import AppWindow from 'lucide-solid/icons/app-window'
import Box from 'lucide-solid/icons/box'
import Frame from 'lucide-solid/icons/frame'
import MousePointerClick from 'lucide-solid/icons/mouse-pointer-click'
import PanelLeft from 'lucide-solid/icons/panel-left'
import Power from 'lucide-solid/icons/power'
import SquareDashed from 'lucide-solid/icons/square-dashed'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import type {designConfig} from '../shared/tolerances.js'
import type {createXrayState} from './state.js'

export function Rail(props: {xray: ReturnType<typeof createXrayState>; keys: Keys | undefined}): JSX.Element {
  return (
    <div
      class="p-1.5 border-e border-chat-line-soft flex flex-col gap-0.5 w-12 items-center"
      style={{'view-transition-name': 'xray-rail'}}
    >
      <RailButton
        tooltip="X-ray"
        shortcut={props.keys?.overlay}
        pressed={props.xray.state.on}
        onClick={props.xray.toggleOn}
        icon={<Power class={ICON} aria-hidden="true" />}
      />
      <RailButton
        tooltip="Pick a box"
        shortcut={props.keys?.pick}
        pressed={props.xray.state.pick}
        onClick={props.xray.togglePick}
        icon={<MousePointerClick class={ICON} aria-hidden="true" />}
      />
      <RailButton
        tooltip="3D"
        pressed={props.xray.state.threeD}
        onClick={props.xray.toggleThreeD}
        icon={<Box class={ICON} aria-hidden="true" />}
      />
      <Divider />
      <For each={LAYERS}>
        {(layer) => (
          <RailButton
            tooltip={layer.label}
            pressed={props.xray.state.layers[layer.key]}
            onClick={() => props.xray.toggleLayer(layer.key)}
            icon={layer.icon()}
          />
        )}
      </For>
      <Divider />
      <For each={MAGNITUDES}>
        {(magnitude) => (
          <RailButton
            tooltip={magnitude}
            pressed={props.xray.state.magnitudes[magnitude]}
            onClick={() => props.xray.toggleMagnitude(magnitude)}
            icon={
              <span
                aria-hidden="true"
                class="border-2 rounded-chat-pill size-2.5 block"
                style={{
                  'border-color': `var(--xray-${magnitude})`,
                  background: props.xray.state.magnitudes[magnitude] ? `var(--xray-${magnitude})` : 'transparent',
                }}
              />
            }
          />
        )}
      </For>
      <div class="flex-1" />
      <RailButton
        tooltip="Panel"
        pressed={props.xray.state.column}
        onClick={props.xray.toggleColumn}
        icon={<PanelLeft class={ICON} aria-hidden="true" />}
      />
    </div>
  )
}

type Keys = z.output<typeof designConfig>['hotkeys']

const ICON = 'size-5 block'

const MAGNITUDES = ['much', 'noticeably', 'slightly', 'reflow', 'paint', 'matched'] as const

const LAYERS = [
  {key: 'dom', label: 'DOM boxes', icon: () => <AppWindow class={ICON} aria-hidden="true" />},
  {key: 'fom', label: 'Figma boxes', icon: () => <Frame class={ICON} aria-hidden="true" />},
  {key: 'changed', label: 'Changed regions', icon: () => <SquareDashed class={ICON} aria-hidden="true" />},
] as const

function RailButton(props: {
  tooltip: string
  shortcut?: string
  pressed: boolean
  onClick: () => void
  icon: JSX.Element
}): JSX.Element {
  return (
    <TooltipIconButton
      tooltip={props.tooltip}
      shortcut={props.shortcut}
      side="right"
      aria-pressed={props.pressed}
      class="size-8 aria-pressed:text-chat-accent aria-pressed:bg-chat-fill"
      onClick={() => props.onClick()}
    >
      {props.icon}
    </TooltipIconButton>
  )
}

function Divider(): JSX.Element {
  return <div aria-hidden="true" class="my-1 border-t border-chat-line-soft w-6" />
}
