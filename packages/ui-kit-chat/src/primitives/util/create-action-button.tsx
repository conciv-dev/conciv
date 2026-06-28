import {Show, splitProps, type Accessor, type JSX} from 'solid-js'
import {Primitive, type Slottable} from './primitive.js'

// An action's behavior, supplied by its hook. `null` means the runtime offers no handler for this
// action — the button then renders nothing (assistant-ui's capability convention, §7). So we ship
// every action and the widget lights up only what it supports.
export type ActionButtonState = {run: (event: MouseEvent) => void; disabled?: boolean}

type ButtonBase = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> &
  Slottable<JSX.ButtonHTMLAttributes<HTMLButtonElement>>
export type ActionButtonProps<TArgs = Record<never, never>> = ButtonBase & TArgs

// Build a button whose onClick/disabled come from a behavior hook. Renders null when the hook yields
// no handler. The hook reads the chat context; the args bag (TArgs) is forwarded to it.
export function createActionButton<TArgs extends Record<string, unknown> = Record<never, never>>(
  name: string,
  useActionState: (args: TArgs) => Accessor<ActionButtonState | null>,
): (props: ActionButtonProps<TArgs>) => JSX.Element {
  return (props) => {
    const state = useActionState(props)
    const [local, rest] = splitProps(props, ['disabled', 'aria-label'])
    return (
      <Show when={state()}>
        {(active) => (
          <Primitive.button
            type="button"
            aria-label={local['aria-label'] ?? name}
            disabled={local.disabled || active().disabled}
            onClick={(event) => active().run(event)}
            {...rest}
          />
        )}
      </Show>
    )
  }
}
