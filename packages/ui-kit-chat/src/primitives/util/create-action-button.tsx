import {Show, splitProps, type Accessor, type JSX} from 'solid-js'
import {Primitive, type Slottable} from './primitive.js'

export type ActionButtonState = {run: (event: MouseEvent) => void; disabled?: boolean}

type ButtonBase = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> &
  Slottable<JSX.ButtonHTMLAttributes<HTMLButtonElement>>
export type ActionButtonProps<TArgs = Record<never, never>> = ButtonBase & TArgs

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
