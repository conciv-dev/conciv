import {Show, splitProps, type JSX} from 'solid-js'
import {useFieldContext} from '@ark-ui/solid/field'
import {NumberInput as Ark} from '@ark-ui/solid/number-input'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import ChevronUp from 'lucide-solid/icons/chevron-up'
import {INPUT_FRAME} from './input-frame.js'
import {nativeFocusPart} from './native-focus.js'

const ROOT = 'inline-flex min-w-0'
const CONTROL = `${INPUT_FRAME} w-full data-[invalid]:border-chat-danger`
const INPUT =
  'flex-1 w-full min-w-0 bg-transparent [border:none] px-2.5 py-2 text-inherit font-chat-mono text-[0.75rem] tabular-nums focus-visible:outline-none read-only:cursor-default'
const UNIT = 'flex items-center pe-1.5 text-chat-text-3 text-[0.6875rem] font-chat-mono whitespace-nowrap'
const STEPS = 'flex flex-col shrink-0 w-6 [border-inline-start:1px_solid_var(--chat-line-soft)]'
const STEP =
  'flex flex-1 items-center justify-center bg-transparent [border:none] p-0 text-chat-text-2 cursor-pointer trans-color-bg hover:not-disabled:bg-chat-fill-strong hover:not-disabled:text-chat-text-hi disabled:opacity-40 disabled:cursor-not-allowed'

type NumberInputProps = {
  value: number | undefined
  onValueChange?: (value: number | undefined) => void
  onValueCommit?: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  class?: string
  'aria-label'?: string
}

const Input = nativeFocusPart(Ark.Input, 'input')

const PAGE_KEYS: Partial<Record<string, number>> = {PageUp: 1, PageDown: -1}

const clampStep = (options: {value: number; min: number | undefined; max: number | undefined}): number =>
  Math.min(options.max ?? Number.POSITIVE_INFINITY, Math.max(options.min ?? Number.NEGATIVE_INFINITY, options.value))

const toNumber = (value: number): number | undefined => (Number.isNaN(value) ? undefined : value)

export function NumberInput(props: NumberInputProps): JSX.Element {
  const [local] = splitProps(props, [
    'value',
    'onValueChange',
    'onValueCommit',
    'min',
    'max',
    'step',
    'unit',
    'disabled',
    'readOnly',
    'invalid',
    'class',
    'aria-label',
  ])
  const field = useFieldContext()
  const disabled = () => local.disabled ?? field?.().disabled
  const readOnly = () => local.readOnly ?? field?.().readOnly
  const steppable = () => !disabled() && !readOnly()
  const largeStep = () => (local.step ?? 1) * 10
  return (
    <Ark.Root
      class={`${ROOT}  ${local.class ?? 'w-36'}`}
      value={local.value === undefined ? '' : String(local.value)}
      onValueChange={(details) => local.onValueChange?.(toNumber(details.valueAsNumber))}
      onValueCommit={(details) => local.onValueCommit?.(toNumber(details.valueAsNumber))}
      min={local.min}
      max={local.max}
      step={local.step}
      largeStep={largeStep()}
      clampValueOnBlur={false}
      allowOverflow
      disabled={disabled()}
      readOnly={readOnly()}
      invalid={local.invalid ?? field?.().invalid}
      formatOptions={{useGrouping: false, maximumFractionDigits: 6}}
      translations={{valueText: (value) => (local.unit ? `${value} ${local.unit}` : value)}}
    >
      <Ark.Control class={CONTROL}>
        <Ark.Context>
          {(api) => (
            <Input
              class={INPUT}
              aria-label={local['aria-label']}
              onKeyDown={(event) => {
                const direction = PAGE_KEYS[event.key]
                if (direction === undefined || !steppable()) return
                event.preventDefault()
                const current = Number.isNaN(api().valueAsNumber) ? (local.min ?? 0) : api().valueAsNumber
                api().setValue(clampStep({value: current + direction * largeStep(), min: local.min, max: local.max}))
              }}
            />
          )}
        </Ark.Context>
        <Show when={local.unit}>
          {(unit) => (
            <span class={UNIT} aria-hidden="true">
              {unit()}
            </span>
          )}
        </Show>
        <Show when={steppable()}>
          <span class={STEPS}>
            <Ark.IncrementTrigger class={`${STEP} [border-block-end:1px_solid_var(--chat-line-soft)]`}>
              <ChevronUp class="size-3" aria-hidden="true" />
            </Ark.IncrementTrigger>
            <Ark.DecrementTrigger class={STEP}>
              <ChevronDown class="size-3" aria-hidden="true" />
            </Ark.DecrementTrigger>
          </span>
        </Show>
      </Ark.Control>
    </Ark.Root>
  )
}
