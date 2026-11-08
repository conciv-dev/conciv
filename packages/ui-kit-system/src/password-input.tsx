import {Show, splitProps, type JSX} from 'solid-js'
import {PasswordInput as Ark} from '@ark-ui/solid/password-input'
import Eye from 'lucide-solid/icons/eye'
import EyeOff from 'lucide-solid/icons/eye-off'
import {ClipboardCopyButton} from './clipboard-copy-button.js'
import {INPUT_FRAME} from './input-frame.js'
import {TooltipIconButton} from './tooltip-icon-button.js'

const INPUT =
  'flex-1 w-full min-w-0 bg-transparent [border:none] px-2.5 text-inherit font-chat-mono text-[0.75rem] focus-visible:outline-none placeholder:text-chat-text-3 read-only:cursor-default'
const ACTIONS = 'flex items-center gap-0.5 shrink-0 px-0.5'
const ICON = 'size-3.5'
const BUTTON = 'size-8'

type PasswordInputProps = {
  value: string
  onValueChange?: (value: string) => void
  onBlur?: () => void
  onEnter?: () => void
  copyable?: boolean
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  class?: string
  'aria-label'?: string
}

export function PasswordInput(props: PasswordInputProps): JSX.Element {
  const [local] = splitProps(props, [
    'value',
    'onValueChange',
    'onBlur',
    'onEnter',
    'copyable',
    'placeholder',
    'disabled',
    'readOnly',
    'class',
    'aria-label',
  ])
  return (
    <Ark.Root
      class={`min-w-0 ${local.class ?? ''}`}
      disabled={local.disabled}
      readOnly={local.readOnly}
      autoComplete="new-password"
      ignorePasswordManagers
    >
      <Ark.Control class={INPUT_FRAME}>
        <Ark.Input
          class={INPUT}
          value={local.value}
          placeholder={local.placeholder}
          aria-label={local['aria-label']}
          onInput={(event) => local.onValueChange?.(event.currentTarget.value)}
          onBlur={() => local.onBlur?.()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.isComposing) local.onEnter?.()
          }}
        />
        <span class={ACTIONS}>
          <Ark.Context>
            {(api) => (
              <Ark.VisibilityTrigger
                asChild={(triggerProps) => (
                  <TooltipIconButton
                    {...triggerProps()}
                    class={BUTTON}
                    tooltip={api().visible ? 'Hide secret' : 'Show secret'}
                    disabled={local.disabled}
                  >
                    <Show when={api().visible} fallback={<Eye class={ICON} aria-hidden="true" />}>
                      <EyeOff class={ICON} aria-hidden="true" />
                    </Show>
                  </TooltipIconButton>
                )}
              />
            )}
          </Ark.Context>
          <Show when={local.copyable}>
            <ClipboardCopyButton text={local.value} class={BUTTON} disabled={local.disabled || local.value === ''} />
          </Show>
        </span>
      </Ark.Control>
    </Ark.Root>
  )
}
