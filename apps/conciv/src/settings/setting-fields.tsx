import {For, splitProps, type JSX} from 'solid-js'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {
  NumberInput,
  RadioGroupPrimitive as RadioGroup,
  SegmentGroup,
  Select,
  Switch,
  TextField as TextInput,
  createListCollection,
  skinDefinition,
  type SchemePair,
  type SkinName,
} from '@conciv/ui-kit-system'
import {useFieldContext} from './form-context.js'
import {MICRO, SettingRow} from './settings-ui.js'

type Option = {value: string; label: string}

type FieldProps = {label: string; hint?: string; lock?: string}

const SEGMENT_ROOT =
  '!grid w-full !gap-0.5 !p-0.5 !bg-chat-sunken ![border-color:var(--chat-line-soft)] !rounded-[var(--chat-radius-sm)]'
const SEGMENT_ITEM = '!min-h-7.5 !px-2 !text-[0.75rem] !rounded-[var(--chat-radius-chip)]'
const SEGMENT_INDICATOR =
  '!rounded-[var(--chat-radius-chip)] !bg-chat-fill-strong ![border-color:var(--chat-line-2)] !shadow-none'

export function SegmentField(props: FieldProps & {options: readonly Option[]}): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'lock', 'options'])
  const field = useFieldContext<string>()
  return (
    <SettingRow label={local.label} hint={local.hint} lock={local.lock} layout="stack">
      <SegmentGroup.Root
        class={SEGMENT_ROOT}
        aria-label={local.label}
        style={{'grid-template-columns': `repeat(${local.options.length}, minmax(0, 1fr))`}}
        name={field().name}
        value={field().state.value}
        readOnly={Boolean(local.lock)}
        onValueChange={(details) => {
          if (details.value) field().handleChange(details.value)
        }}
        on:focusout={() => field().handleBlur()}
      >
        <SegmentGroup.Indicator class={SEGMENT_INDICATOR} />
        <For each={local.options}>
          {(option) => (
            <SegmentGroup.Item class={SEGMENT_ITEM} value={option.value}>
              <SegmentGroup.ItemText>{option.label}</SegmentGroup.ItemText>
              <SegmentGroup.ItemControl />
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          )}
        </For>
      </SegmentGroup.Root>
    </SettingRow>
  )
}

const SKINS = 'grid grid-cols-2 gap-2'
const SKIN =
  'flex flex-col overflow-hidden rounded-[var(--chat-radius-sm)] [border:1px_solid_var(--chat-line)] cursor-pointer trans-border data-[state=checked]:[border-color:var(--chat-accent)] data-[state=checked]:[box-shadow:0_0_0_1px_var(--chat-accent)] data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem] data-[readonly]:cursor-default'
const SKIN_PREVIEW = 'flex flex-col gap-1.25 h-14.5 p-2'
const SKIN_BAR = 'h-1.25'
const SKIN_CAPTION =
  'flex items-center justify-between py-1.75 px-2.25 [border-block-start:1px_solid_var(--chat-line-soft)] text-[0.75rem] text-chat-text-hi'
const SKIN_TAG: Record<SkinName, string> = {conciv: 'default', terminal: 'mono'}

function schemeColor(pair: SchemePair): string {
  return `light-dark(${pair.light}, ${pair.dark})`
}

function SkinPreview(props: {name: SkinName}): JSX.Element {
  const skin = () => skinDefinition(props.name)
  const radius = () => skin().scalars['chat-radius-chip']
  return (
    <div class={SKIN_PREVIEW} style={{background: schemeColor(skin().pairs['chat-panel'])}} aria-hidden="true">
      <div
        class={SKIN_BAR}
        style={{width: '60%', background: schemeColor(skin().pairs['chat-line-2']), 'border-radius': radius()}}
      />
      <div
        class={SKIN_BAR}
        style={{width: '85%', background: schemeColor(skin().pairs['chat-line']), 'border-radius': radius()}}
      />
      <div
        class={`${SKIN_BAR} mt-auto w-6`}
        style={{background: schemeColor(skin().pairs['chat-accent']), 'border-radius': radius()}}
      />
    </div>
  )
}

export function SkinField(props: FieldProps & {skins: readonly SkinName[]; shown?: SkinName}): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'lock', 'skins', 'shown'])
  const field = useFieldContext<SkinName>()
  return (
    <SettingRow label={local.label} hint={local.hint} lock={local.lock} layout="stack">
      <RadioGroup.Root
        class={SKINS}
        aria-label={local.label}
        name={field().name}
        value={local.shown ?? field().state.value}
        readOnly={Boolean(local.lock)}
        onValueChange={(details) => {
          const next = local.skins.find((name) => name === details.value)
          if (next) field().handleChange(next)
        }}
        on:focusout={() => field().handleBlur()}
      >
        <For each={local.skins}>
          {(name) => (
            <RadioGroup.Item class={SKIN} value={name}>
              <SkinPreview name={name} />
              <span class={SKIN_CAPTION}>
                <RadioGroup.ItemText>{skinDefinition(name).label}</RadioGroup.ItemText>
                <span class={MICRO}>{SKIN_TAG[name]}</span>
              </span>
              <RadioGroup.ItemControl class="hidden" />
              <RadioGroup.ItemHiddenInput />
            </RadioGroup.Item>
          )}
        </For>
      </RadioGroup.Root>
    </SettingRow>
  )
}

const SELECT_TRIGGER = '!w-37.5'

export function SelectField(props: FieldProps & {options: readonly Option[]}): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'lock', 'options'])
  const field = useFieldContext<string>()
  const collection = () => createListCollection({items: [...local.options]})
  return (
    <SettingRow label={local.label} hint={local.hint} lock={local.lock}>
      <Select.Root
        collection={collection()}
        name={field().name}
        value={[field().state.value]}
        readOnly={Boolean(local.lock)}
        onValueChange={(details) => {
          const next = details.value.at(0)
          if (next) field().handleChange(next)
        }}
        onInteractOutside={() => field().handleBlur()}
      >
        <Select.Control>
          <Select.Trigger class={SELECT_TRIGGER}>
            <Select.ValueText />
            <Select.Indicator>
              <ChevronDown class="size-3 text-chat-dim" aria-hidden="true" />
            </Select.Indicator>
          </Select.Trigger>
        </Select.Control>
        <Select.Positioner>
          <Select.Content>
            <For each={local.options}>
              {(option) => (
                <Select.Item item={option}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              )}
            </For>
          </Select.Content>
        </Select.Positioner>
        <Select.HiddenSelect />
      </Select.Root>
    </SettingRow>
  )
}

export function SwitchField(props: FieldProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'lock'])
  const field = useFieldContext<boolean>()
  return (
    <SettingRow label={local.label} hint={local.hint} lock={local.lock}>
      <Switch.Root
        name={field().name}
        checked={field().state.value}
        readOnly={Boolean(local.lock)}
        onCheckedChange={(details) => field().handleChange(details.checked)}
        on:focusout={() => field().handleBlur()}
      >
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.HiddenInput />
      </Switch.Root>
    </SettingRow>
  )
}

type NumberFieldProps = FieldProps & {min?: number; max?: number; step?: number}

export function NumberField(props: NumberFieldProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'lock', 'min', 'max', 'step'])
  const field = useFieldContext<number | undefined>()
  return (
    <SettingRow label={local.label} hint={local.hint} lock={local.lock}>
      <NumberInput
        class={CONTROL_WIDTH}
        value={field().state.value}
        min={local.min}
        max={local.max}
        step={local.step}
        onValueChange={(value) => field().setValue(value, {dontRunListeners: true})}
        onValueCommit={(value) => {
          if (value !== undefined) field().handleChange(value)
          field().handleBlur()
        }}
      />
    </SettingRow>
  )
}

const CONTROL_WIDTH = 'w-37.5'

export function TextField(props: FieldProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'lock'])
  const field = useFieldContext<string>()
  return (
    <SettingRow label={local.label} hint={local.hint} lock={local.lock}>
      <TextInput
        class={CONTROL_WIDTH}
        name={field().name}
        value={field().state.value}
        onInput={(event) => field().handleChange(event.currentTarget.value)}
        onBlur={() => field().handleBlur()}
      />
    </SettingRow>
  )
}
