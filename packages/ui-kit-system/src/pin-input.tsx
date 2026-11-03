import {createEffect, Index, on, splitProps, type JSX} from 'solid-js'
import {PinInput as Ark, usePinInput} from '@ark-ui/solid/pin-input'

const ROOT = 'flex flex-col gap-1'
const LABEL = 'text-[0.75rem] text-chat-text-2 font-chat'
const CONTROL = 'flex gap-2'
const INPUT =
  'size-11 min-w-0 text-center font-chat text-base tabular-nums rounded-chat-surface-md bg-chat-fill text-chat-text [border:1px_solid_var(--chat-line)] focus-ring placeholder:text-chat-text-3 data-[invalid]:[border-color:var(--chat-danger)]'

type InputProps = JSX.InputHTMLAttributes<HTMLInputElement>
type FocusHandler = InputProps['onFocusIn']
type FocusArgument = Parameters<JSX.FocusEventHandler<HTMLInputElement, FocusEvent>>[0]

function forwardFocus(handler: FocusHandler, event: FocusArgument): void {
  if (typeof handler === 'function') {
    handler(event)
    return
  }
  handler?.[0](handler[1], event)
}

function DigitInput(props: InputProps): JSX.Element {
  const [focus, rest] = splitProps(props, ['onFocusIn', 'onFocusOut'])
  return (
    <input
      {...rest}
      on:focusin={(event) => forwardFocus(focus.onFocusIn, event)}
      on:focusout={(event) => forwardFocus(focus.onFocusOut, event)}
    />
  )
}

export type PinInputProps = {
  label: string
  length: number
  value: string[]
  onValueChange: (value: string[]) => void
  onValueComplete: (code: string) => void
  digitLabel: (position: number, length: number) => string
  invalid?: boolean
  autoFocus?: boolean
}

export function PinInput(props: PinInputProps): JSX.Element {
  const pin = usePinInput(() => ({
    otp: true,
    type: 'numeric',
    count: props.length,
    value: [...props.value],
    invalid: props.invalid,
    autoFocus: props.autoFocus,
    placeholder: '',
    translations: {inputLabel: (index, length) => props.digitLabel(index + 1, length)},
    onValueChange: (details) => props.onValueChange(details.value),
    onValueComplete: (details) => props.onValueComplete(details.valueAsString),
  }))
  createEffect(
    on(
      () => props.value.some((digit) => digit !== ''),
      (filled, wasFilled) => {
        if (wasFilled && !filled) pin().focus()
      },
      {defer: true},
    ),
  )
  return (
    <Ark.RootProvider value={pin} class={ROOT}>
      <Ark.Label class={LABEL}>{props.label}</Ark.Label>
      <Ark.Control class={CONTROL}>
        <Index each={Array.from({length: props.length}, (_, index) => index)}>
          {(index) => (
            <Ark.Input index={index()} class={INPUT} asChild={(inputProps) => <DigitInput {...inputProps()} />} />
          )}
        </Index>
      </Ark.Control>
      <Ark.HiddenInput />
    </Ark.RootProvider>
  )
}
