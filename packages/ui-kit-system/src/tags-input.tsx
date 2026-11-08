import {For, Show, splitProps, type JSX} from 'solid-js'
import {useFieldContext} from '@ark-ui/solid/field'
import {TagsInput as Ark} from '@ark-ui/solid/tags-input'
import X from 'lucide-solid/icons/x'
import {INPUT_FRAME} from './input-frame.js'
import {TooltipIconButton} from './tooltip-icon-button.js'

const CONTROL = `${INPUT_FRAME} flex-wrap items-center gap-1 py-1 px-1.5`
const ITEM_PREVIEW =
  'inline-flex items-center gap-0.5 h-6 ps-2 pe-0.5 rounded-chat-chip bg-chat-fill-strong [border:1px_solid_var(--chat-line-2)] font-chat-mono text-[0.6875rem] text-chat-text-hi data-[highlighted]:border-chat-accent data-[highlighted]:bg-chat-accent-20'
const INPUT =
  'flex-1 min-w-24 h-6 bg-transparent [border:none] px-1 text-inherit text-[0.8125rem] focus-visible:outline-none placeholder:text-chat-text-3 read-only:cursor-default'

type TagsInputProps = {
  value: string[]
  onValueChange?: (value: string[]) => void
  placeholder?: string
  max?: number
  disabled?: boolean
  readOnly?: boolean
  class?: string
  'aria-label'?: string
}

export function TagsInput(props: TagsInputProps): JSX.Element {
  const [local] = splitProps(props, [
    'value',
    'onValueChange',
    'placeholder',
    'max',
    'disabled',
    'readOnly',
    'class',
    'aria-label',
  ])
  const field = useFieldContext()
  return (
    <Ark.Root
      class={`min-w-0 ${local.class ?? ''}`}
      value={local.value}
      onValueChange={(details) => local.onValueChange?.(details.value)}
      delimiter=","
      addOnPaste
      blurBehavior="add"
      max={local.max}
      disabled={local.disabled}
      readOnly={local.readOnly}
      translations={{deleteTagTriggerLabel: (value) => `Remove ${value}`}}
    >
      <Ark.Control class={CONTROL}>
        <For each={local.value}>
          {(tag, index) => (
            <Ark.Item index={index()} value={tag}>
              <Ark.ItemPreview class={ITEM_PREVIEW}>
                <Ark.ItemText>{tag}</Ark.ItemText>
                <Show when={!local.readOnly && !local.disabled}>
                  <Ark.ItemDeleteTrigger
                    asChild={(triggerProps) => (
                      <TooltipIconButton
                        {...triggerProps()}
                        tooltip={`Remove ${tag}`}
                        class="rounded-[0.1875rem] size-4.5"
                      >
                        <X class="size-3" aria-hidden="true" />
                      </TooltipIconButton>
                    )}
                  />
                </Show>
              </Ark.ItemPreview>
              <Ark.ItemInput class={INPUT} />
            </Ark.Item>
          )}
        </For>
        <Ark.Input
          class={INPUT}
          placeholder={local.placeholder}
          aria-label={local['aria-label']}
          aria-labelledby={local['aria-label'] ? undefined : field?.().ids.label}
        />
      </Ark.Control>
      <Ark.HiddenInput />
    </Ark.Root>
  )
}
