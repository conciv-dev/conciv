import {createMemo, For, Show, splitProps, type Component, type JSX} from 'solid-js'
import {useFieldsetContext} from '@ark-ui/solid/fieldset'
import {useFieldContext} from '@ark-ui/solid/field'
import Check from 'lucide-solid/icons/check'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {CheckboxGroup} from './checkbox-group.js'
import {ColorPicker} from './color-picker.js'
import {ComboboxSelect} from './combobox-select.js'
import {FieldShell} from './field-shell.js'
import {HotkeyRecorder} from './hotkey-recorder.js'
import {NumberInput} from './number-input.js'
import {PasswordInput} from './password-input.js'
import {RadioCards} from './radio-cards.js'
import {SegmentGroup} from './segment-group.js'
import {createListCollection, Select} from './select.js'
import {settingsFormContexts} from './settings-form-contexts.js'
import {Slider} from './slider.js'
import {Switch} from './switch.js'
import {TagsInput} from './tags-input.js'
import {TextArea, TextField} from './text-field.js'

type ShellProps = {
  label: string
  description?: JSX.Element
  locked?: string
  changed?: boolean
  onReset?: () => void
  disabled?: boolean
  layout?: 'row' | 'stack'
}

const SHELL_KEYS: (keyof ShellProps)[] = ['label', 'description', 'locked', 'changed', 'onReset', 'disabled', 'layout']

type Option = {value: string; label: string}

const SELECT_CONTENT_ITEM_CHECK = 'size-3.5 text-chat-accent'
const COUNTER = 'self-end pt-1 font-chat-mono text-[0.6875rem] text-chat-text-3 tabular-nums'
const SLIDER_ROW = 'flex items-start gap-3'
const MARKER_GROUP = 'relative h-3.5 mx-[0.4375rem]'
const MARKER = 'font-chat-mono text-[0.625rem] text-chat-text-3 -translate-x-1/2'

export const settingsFieldComponents = {
  TextField: SettingTextField,
  NumberField: SettingNumberField,
  SliderField: SettingSliderField,
  SwitchField: SettingSwitchField,
  SegmentField: SettingSegmentField,
  RadioCardsField: SettingRadioCardsField,
  SelectField: SettingSelectField,
  ComboboxField: SettingComboboxField,
  CheckboxGroupField: SettingCheckboxGroupField,
  TagsField: SettingTagsField,
  PasswordField: SettingPasswordField,
  ColorField: SettingColorField,
  HotkeyField: SettingHotkeyField,
  TextAreaField: SettingTextAreaField,
}

function SettingTextField(
  props: ShellProps & {
    placeholder?: string
    addonStart?: JSX.Element
    addonEnd?: JSX.Element
    action?: JSX.Element
    mono?: boolean
  },
): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string | undefined>()
  return (
    <FieldShell {...shell} error={firstError(field().state.meta.errors)}>
      <TextField
        name={field().name}
        value={field().state.value ?? ''}
        placeholder={own.placeholder}
        addonStart={own.addonStart}
        addonEnd={own.addonEnd}
        action={own.action}
        mono={own.mono}
        onInput={(event) => field().handleChange(event.currentTarget.value)}
        onBlur={() => field().handleBlur()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.isComposing) field().handleBlur()
        }}
      />
    </FieldShell>
  )
}

function SettingNumberField(
  props: ShellProps & {min?: number; max?: number; step?: number; unit?: string},
): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<number | undefined>()
  return (
    <FieldShell layout="row" {...shell} error={firstError(field().state.meta.errors)}>
      <NumberInput
        value={field().state.value}
        min={own.min}
        max={own.max}
        step={own.step}
        unit={own.unit}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) => field().handleChange(value)}
        onValueCommit={() => field().handleBlur()}
      />
    </FieldShell>
  )
}

function SettingSliderField(
  props: ShellProps & {min: number; max: number; step?: number; unit?: string; marks?: number[]},
): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<number>()
  return (
    <FieldShell {...shell} error={firstError(field().state.meta.errors)}>
      <SliderControl
        value={field().state.value}
        min={own.min}
        max={own.max}
        step={own.step}
        unit={own.unit}
        marks={own.marks}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) => field().handleChange(value)}
        onValueCommit={() => field().handleBlur()}
      />
    </FieldShell>
  )
}

function SliderControl(props: {
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  marks?: number[]
  disabled?: boolean
  readOnly?: boolean
  onValueChange: (value: number) => void
  onValueCommit: () => void
}): JSX.Element {
  const context = useFieldContext()
  return (
    <div class={SLIDER_ROW}>
      <Slider.Root
        class="pt-2.5 flex-1"
        value={[props.value]}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={props.disabled}
        readOnly={props.readOnly}
        ids={{label: context?.().ids.label}}
        onValueChange={(details) => {
          const [next] = details.value
          if (next !== undefined) props.onValueChange(next)
        }}
        onValueChangeEnd={() => props.onValueCommit()}
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumb index={0} aria-describedby={context?.().ariaDescribedby}>
            <Slider.HiddenInput />
          </Slider.Thumb>
        </Slider.Control>
        <Show when={props.marks}>
          {(marks) => (
            <Slider.MarkerGroup class={MARKER_GROUP} aria-hidden="true">
              <For each={marks()}>
                {(mark) => (
                  <Slider.Marker value={mark} class={MARKER}>
                    {mark}
                  </Slider.Marker>
                )}
              </For>
            </Slider.MarkerGroup>
          )}
        </Show>
      </Slider.Root>
      <NumberInput
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        unit={props.unit}
        disabled={props.disabled}
        readOnly={props.readOnly}
        onValueChange={(value) => {
          if (value !== undefined) props.onValueChange(value)
        }}
        onValueCommit={() => props.onValueCommit()}
      />
    </div>
  )
}

function SettingSwitchField(props: ShellProps): JSX.Element {
  const [shell] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<boolean>()
  return (
    <FieldShell layout="row" {...shell} error={firstError(field().state.meta.errors)}>
      <Switch.Root
        checked={field().state.value}
        onCheckedChange={(details) =>
          commit(
            () => field().handleChange(details.checked),
            () => field().handleBlur(),
          )
        }
      >
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.HiddenInput />
      </Switch.Root>
    </FieldShell>
  )
}

function SettingSegmentField(
  props: ShellProps & {options: (Option & {icon?: Component<{class?: string; 'aria-hidden'?: 'true'}>})[]},
): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string>()
  return (
    <FieldShell group {...shell} error={firstError(field().state.meta.errors)}>
      <SegmentControl
        value={field().state.value}
        options={own.options}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) =>
          commit(
            () => field().handleChange(value),
            () => field().handleBlur(),
          )
        }
      />
    </FieldShell>
  )
}

function SegmentControl(props: {
  value: string
  options: (Option & {icon?: Component<{class?: string; 'aria-hidden'?: 'true'}>})[]
  disabled?: boolean
  readOnly?: boolean
  onValueChange: (value: string) => void
}): JSX.Element {
  const fieldset = useFieldsetContext()
  return (
    <SegmentGroup.Root
      class="self-start"
      value={props.value}
      disabled={props.disabled}
      readOnly={props.readOnly}
      ids={{label: fieldset?.().ids.legend}}
      onValueChange={(details) => {
        if (details.value !== null) props.onValueChange(details.value)
      }}
    >
      <SegmentGroup.Indicator />
      <For each={props.options}>
        {(option) => (
          <SegmentGroup.Item value={option.value}>
            <SegmentGroup.ItemText>
              <Show when={option.icon}>
                {(icon) => {
                  const Icon = icon()
                  return <Icon class="size-3.5" aria-hidden="true" />
                }}
              </Show>
              {option.label}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        )}
      </For>
    </SegmentGroup.Root>
  )
}

function SettingRadioCardsField(
  props: ShellProps & {options: {value: string; title: string; description?: string}[]},
): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string>()
  return (
    <FieldShell group {...shell} error={firstError(field().state.meta.errors)}>
      <RadioCards
        options={own.options}
        value={field().state.value}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) =>
          commit(
            () => field().handleChange(value),
            () => field().handleBlur(),
          )
        }
      />
    </FieldShell>
  )
}

function SettingSelectField(props: ShellProps & {options: Option[]; placeholder?: string}): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string | undefined>()
  const collection = createMemo(() => createListCollection({items: own.options}))
  return (
    <FieldShell layout="row" {...shell} error={firstError(field().state.meta.errors)}>
      <Select.Root
        class="min-w-48"
        collection={collection()}
        value={field().state.value === undefined ? [] : [field().state.value ?? '']}
        onValueChange={(details) => {
          const [next] = details.value
          if (next !== undefined)
            commit(
              () => field().handleChange(next),
              () => field().handleBlur(),
            )
        }}
      >
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText placeholder={own.placeholder ?? 'Choose one'} />
            <ChevronDown class="text-chat-text-3 shrink-0 size-3.5" aria-hidden="true" />
          </Select.Trigger>
        </Select.Control>
        <Select.Positioner>
          <Select.Content>
            <For each={collection().items}>
              {(item) => (
                <Select.Item item={item}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check class={SELECT_CONTENT_ITEM_CHECK} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              )}
            </For>
          </Select.Content>
        </Select.Positioner>
        <Select.HiddenSelect />
      </Select.Root>
    </FieldShell>
  )
}

function SettingComboboxField(
  props: ShellProps & {options: (Option & {meta?: string})[]; placeholder?: string; emptyText?: string},
): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string | undefined>()
  return (
    <FieldShell {...shell} error={firstError(field().state.meta.errors)}>
      <ComboboxSelect
        options={own.options}
        value={field().state.value}
        placeholder={own.placeholder}
        emptyText={own.emptyText}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) =>
          commit(
            () => field().handleChange(value),
            () => field().handleBlur(),
          )
        }
      />
    </FieldShell>
  )
}

function SettingCheckboxGroupField(props: ShellProps & {options: Option[]}): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string[]>()
  return (
    <FieldShell group {...shell} error={firstError(field().state.meta.errors)}>
      <CheckboxGroup
        options={own.options}
        value={field().state.value}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) =>
          commit(
            () => field().handleChange(value),
            () => field().handleBlur(),
          )
        }
      />
    </FieldShell>
  )
}

function SettingTagsField(props: ShellProps & {placeholder?: string; max?: number}): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string[]>()
  return (
    <FieldShell {...shell} error={firstError(field().state.meta.errors)}>
      <TagsInput
        value={field().state.value}
        placeholder={own.placeholder}
        max={own.max}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) =>
          commit(
            () => field().handleChange(value),
            () => field().handleBlur(),
          )
        }
      />
    </FieldShell>
  )
}

function SettingPasswordField(props: ShellProps & {placeholder?: string; copyable?: boolean}): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string | undefined>()
  return (
    <FieldShell {...shell} error={firstError(field().state.meta.errors)}>
      <PasswordInput
        value={field().state.value ?? ''}
        placeholder={own.placeholder}
        copyable={own.copyable}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) => field().handleChange(value)}
        onBlur={() => field().handleBlur()}
        onEnter={() => field().handleBlur()}
      />
    </FieldShell>
  )
}

function SettingColorField(props: ShellProps & {presets?: string[]}): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string>()
  return (
    <FieldShell {...shell} error={firstError(field().state.meta.errors)}>
      <ColorPicker
        value={field().state.value}
        presets={own.presets}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) => field().handleChange(value)}
        onValueCommit={() => field().handleBlur()}
      />
    </FieldShell>
  )
}

function SettingHotkeyField(props: ShellProps & {conflict?: (hotkey: string) => string | undefined}): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string | null>()
  return (
    <FieldShell layout="row" {...shell} error={firstError(field().state.meta.errors)}>
      <HotkeyRecorder
        value={field().state.value}
        conflict={own.conflict}
        disabled={shell.disabled}
        readOnly={Boolean(shell.locked)}
        onValueChange={(value) =>
          commit(
            () => field().handleChange(value),
            () => field().handleBlur(),
          )
        }
      />
    </FieldShell>
  )
}

function SettingTextAreaField(
  props: ShellProps & {placeholder?: string; maxLength?: number; minRows?: number; maxRows?: number},
): JSX.Element {
  const [shell, own] = splitProps(props, SHELL_KEYS)
  const field = settingsFormContexts.useFieldContext<string | undefined>()
  const count = () => (field().state.value ?? '').length
  return (
    <FieldShell {...shell} error={firstError(field().state.meta.errors)}>
      <TextArea
        value={field().state.value ?? ''}
        placeholder={own.placeholder}
        minRows={own.minRows ?? 3}
        maxRows={own.maxRows ?? 10}
        onInput={(event) => field().handleChange(event.currentTarget.value)}
        onBlur={() => field().handleBlur()}
      />
      <Show when={own.maxLength}>
        {(maxLength) => (
          <span class={COUNTER} classList={{'text-chat-danger': count() > maxLength()}}>
            {`${NUMBER_FORMAT.format(count())} / ${NUMBER_FORMAT.format(maxLength())}`}
          </span>
        )}
      </Show>
    </FieldShell>
  )
}

const NUMBER_FORMAT = new Intl.NumberFormat()

function commit(change: () => void, blur: () => void): void {
  change()
  blur()
}

function firstError(errors: unknown[]): string | undefined {
  const [first] = errors.flat()
  if (typeof first === 'string') return first
  if (typeof first === 'object' && first !== null && 'message' in first && typeof first.message === 'string')
    return first.message
  return undefined
}
