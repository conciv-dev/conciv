import {Index, type JSX} from 'solid-js'
import {PinInput as Ark, usePinInput} from '@ark-ui/solid/pin-input'
import {nativeFocusPart} from './native-focus.js'

const ROOT = 'flex flex-col gap-1'
const LABEL = 'text-[0.75rem] text-chat-text-2 font-chat'
const CONTROL = 'flex gap-2'
const INPUT =
  'size-11 min-w-0 text-center font-chat text-base tabular-nums rounded-chat-surface-md bg-chat-fill text-chat-text [border:1px_solid_var(--chat-line)] focus-ring placeholder:text-chat-text-3 data-[invalid]:[border-color:var(--chat-danger)]'

const Input = nativeFocusPart(Ark.Input, 'input')

export type PinInputControls = {clear: () => void}

export type PinInputProps = {
  label: string
  length: number
  onValueChange?: (value: string[]) => void
  onValueComplete: (code: string, controls: PinInputControls) => void
  digitLabel: (position: number, length: number) => string
  invalid?: boolean
}

export function PinInput(props: PinInputProps): JSX.Element {
  const pin = usePinInput(() => ({
    otp: true,
    type: 'numeric',
    count: props.length,
    invalid: props.invalid,
    placeholder: '',
    translations: {inputLabel: (index, length) => props.digitLabel(index + 1, length)},
    onValueChange: (details) => props.onValueChange?.(details.value),
    onValueComplete: (details) => props.onValueComplete(details.valueAsString, {clear: () => pin().clearValue()}),
  }))
  return (
    <Ark.RootProvider value={pin} class={ROOT}>
      <Ark.Label class={LABEL}>{props.label}</Ark.Label>
      <Ark.Control class={CONTROL}>
        <Index each={Array.from({length: props.length}, (_, index) => index)}>
          {(index) => <Input index={index()} class={INPUT} />}
        </Index>
      </Ark.Control>
      <Ark.HiddenInput />
    </Ark.RootProvider>
  )
}
