import {For, Show, splitProps, type JSX} from 'solid-js'
import {useFieldContext} from '@ark-ui/solid/field'
import {ColorPicker as Ark, parseColor, useColorPicker} from '@ark-ui/solid/color-picker'
import Check from 'lucide-solid/icons/check'
import {INPUT_FRAME} from './input-frame.js'

const ROOT = 'flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0'
const CONTROL = 'flex items-center gap-2'
const TRIGGER =
  'grid size-9.5 shrink-0 p-0 overflow-hidden rounded-chat-surface-md bg-transparent [border:1px_solid_var(--chat-line-2)] cursor-pointer focus-ring data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[readonly]:cursor-default'
const VALUE_SWATCH = 'size-full'
const HEX_FRAME = `${INPUT_FRAME} w-28`
const HEX_INPUT =
  'flex-1 w-full min-w-0 bg-transparent [border:none] px-2.5 py-2 text-inherit font-chat-mono text-[0.75rem] uppercase focus-visible:outline-none read-only:cursor-default'
const PRESETS = 'flex flex-wrap items-center gap-1.5'
const PRESET =
  'grid place-items-center size-6 p-0 rounded-chat-pill bg-transparent [border:2px_solid_transparent] cursor-pointer trans-border focus-ring data-[state=checked]:border-chat-text-hi data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed'
const PRESET_SWATCH = 'grid place-items-center size-4.5 rounded-chat-pill'
const PRESET_CHECK = 'size-3 text-chat-on-accent [filter:drop-shadow(0_0_1px_var(--chat-panel))]'
const CONTENT =
  'hidden data-[state=open]:flex data-[state=open]:anim-combo flex-col gap-3 w-60 p-3 z-[2147483647] rounded-chat-surface-md bg-chat-panel [border:1px_solid_var(--chat-line)] shadow-chat-lg focus-visible:outline-none'
const AREA = 'relative h-36 overflow-hidden rounded-chat-surface-sm touch-none'
const THUMB =
  'size-3.5 rounded-chat-pill [border:2px_solid_var(--chat-panel)] [box-shadow:0_0_0_1px_var(--chat-text-hi)] -translate-x-1/2 -translate-y-1/2 focus-ring'
const SLIDER = 'relative h-3 rounded-chat-pill'
const SLIDER_TRACK = 'h-3 rounded-chat-pill'
const SLIDER_THUMB = `${THUMB} top-1/2`

const HEX = /^#[0-9a-f]{6}$/i

type ColorPickerProps = {
  value: string
  onValueChange?: (value: string) => void
  onValueCommit?: (value: string) => void
  presets?: string[]
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  class?: string
}

const toHex = (details: {value: {toString: (format: 'hex') => string}}): string => details.value.toString('hex')

export function ColorPicker(props: ColorPickerProps): JSX.Element {
  const [local] = splitProps(props, [
    'value',
    'onValueChange',
    'onValueCommit',
    'presets',
    'disabled',
    'readOnly',
    'invalid',
    'class',
  ])
  const field = useFieldContext()
  const invalid = () => local.invalid ?? field?.().invalid
  const picker = useColorPicker(() => ({
    value: HEX.test(local.value) ? parseColor(local.value) : undefined,
    format: 'hsba',
    disabled: local.disabled ?? field?.().disabled,
    readOnly: local.readOnly ?? field?.().readOnly,
    invalid: invalid(),
    positioning: {strategy: 'fixed', placement: 'bottom-start', gutter: 6},
    onValueChange: (details) => {
      local.onValueChange?.(toHex(details))
      if (!picker().open) local.onValueCommit?.(toHex(details))
    },
    onValueChangeEnd: (details) => {
      if (picker().open) local.onValueCommit?.(toHex(details))
    },
    onOpenChange: (details) => {
      if (!details.open) local.onValueCommit?.(picker().value.toString('hex'))
    },
  }))
  return (
    <Ark.RootProvider value={picker} class={`${ROOT}  ${local.class ?? ''}`}>
      <Ark.Control class={CONTROL}>
        <Ark.Trigger class={TRIGGER}>
          <Ark.ValueSwatch class={VALUE_SWATCH} />
        </Ark.Trigger>
        <div class={HEX_FRAME}>
          <Ark.ChannelInput
            channel="hex"
            class={HEX_INPUT}
            aria-labelledby={field?.().ids.label}
            aria-describedby={field?.().ariaDescribedby}
            aria-invalid={invalid() || undefined}
          />
        </div>
      </Ark.Control>
      <Show when={local.presets?.length}>
        <Ark.SwatchGroup class={PRESETS}>
          <For each={local.presets}>
            {(preset) => (
              <Ark.SwatchTrigger value={preset} class={PRESET}>
                <Ark.Swatch value={preset} class={PRESET_SWATCH}>
                  <Ark.SwatchIndicator>
                    <Check class={PRESET_CHECK} stroke-width={3} aria-hidden="true" />
                  </Ark.SwatchIndicator>
                </Ark.Swatch>
              </Ark.SwatchTrigger>
            )}
          </For>
        </Ark.SwatchGroup>
      </Show>
      <Ark.Positioner>
        <Ark.Content class={CONTENT}>
          <Ark.Area class={AREA}>
            <Ark.AreaBackground class="size-full" />
            <Ark.AreaThumb class={THUMB} />
          </Ark.Area>
          <Ark.ChannelSlider channel="hue" class={SLIDER}>
            <Ark.ChannelSliderTrack class={SLIDER_TRACK} />
            <Ark.ChannelSliderThumb class={SLIDER_THUMB} />
          </Ark.ChannelSlider>
        </Ark.Content>
      </Ark.Positioner>
      <Ark.HiddenInput />
    </Ark.RootProvider>
  )
}
