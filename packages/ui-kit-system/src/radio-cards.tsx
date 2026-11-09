import {createUniqueId, For, Show, splitProps, type JSX} from 'solid-js'
import {RadioGroup} from '@ark-ui/solid/radio-group'

const ROOT = 'flex flex-col gap-1.5 min-w-0'
const ITEM =
  'relative flex items-start gap-2.5 py-2.5 px-3 rounded-chat-surface-md [border:1px_solid_var(--chat-line-2)] cursor-pointer select-none trans-chip hover:bg-chat-fill data-[state=checked]:border-chat-accent data-[state=checked]:bg-chat-accent-08 data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem] data-[invalid]:border-chat-danger data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[readonly]:cursor-default data-[readonly]:hover:bg-transparent'
const CONTROL =
  'grid place-items-center shrink-0 size-4 mt-px rounded-chat-pill [border:1px_solid_var(--chat-line-2)] trans-border data-[state=checked]:border-chat-accent after:content-[""] after:size-2 after:rounded-chat-pill after:bg-chat-accent after:scale-0 after:[transition:transform_var(--chat-duration-fast)_var(--chat-ease-expo)] data-[state=checked]:after:scale-100 motion-reduce:after:[transition:none]'
const BODY = 'flex flex-col gap-0.5 min-w-0'
const TITLE = 'text-[0.8125rem] leading-snug font-medium text-chat-text-hi'
const DESCRIPTION = 'text-[0.75rem] leading-snug text-chat-text-2'

type RadioCardOption = {value: string; title: string; description?: string; disabled?: boolean}

type RadioCardsProps = {
  options: RadioCardOption[]
  value: string | undefined
  onValueChange?: (value: string) => void
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  name?: string
  class?: string
  'aria-label'?: string
}

export function RadioCards(props: RadioCardsProps): JSX.Element {
  const [local] = splitProps(props, [
    'options',
    'value',
    'onValueChange',
    'disabled',
    'readOnly',
    'invalid',
    'name',
    'class',
    'aria-label',
  ])
  return (
    <RadioGroup.Root
      class={`${ROOT}  ${local.class ?? ''}`}
      value={local.value ?? null}
      onValueChange={(details) => {
        if (details.value !== null) local.onValueChange?.(details.value)
      }}
      disabled={local.disabled}
      readOnly={local.readOnly}
      invalid={local.invalid}
      name={local.name}
      aria-label={local['aria-label']}
    >
      <For each={local.options}>
        {(option) => {
          const titleId = createUniqueId()
          const descriptionId = createUniqueId()
          return (
            <RadioGroup.Item class={ITEM} value={option.value} disabled={option.disabled}>
              <RadioGroup.ItemControl class={CONTROL} />
              <span class={BODY}>
                <RadioGroup.ItemText id={titleId} class={TITLE}>
                  {option.title}
                </RadioGroup.ItemText>
                <Show when={option.description}>
                  {(description) => (
                    <span id={descriptionId} class={DESCRIPTION}>
                      {description()}
                    </span>
                  )}
                </Show>
              </span>
              <RadioGroup.ItemHiddenInput
                aria-labelledby={titleId}
                aria-describedby={option.description ? descriptionId : undefined}
              />
            </RadioGroup.Item>
          )
        }}
      </For>
    </RadioGroup.Root>
  )
}

export const RadioGroupPrimitive = RadioGroup
