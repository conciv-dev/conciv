import {Show, splitProps, type JSX} from 'solid-js'
import {Button, FieldShell} from '@conciv/ui-kit-system'
import Lock from 'lucide-solid/icons/lock'
import {useFieldContext} from './form-context.js'

const ROW = 'flex flex-col gap-1.5 py-3 px-3.5 [&+&]:[border-block-start:1px_solid_var(--chat-line-soft)]'
const LOCK = 'inline-flex items-center gap-1 text-chat-text-3'
const CHANGED = 'flex items-center gap-2 text-[0.75rem] text-chat-text-2'
const CHANGED_DOT = 'size-1.5 shrink-0 rounded-chat-pill bg-chat-accent'

type SettingFieldProps = {
  label: string
  description?: string
  changed: boolean
  onReset: () => void
  lock?: string
  layout?: 'row' | 'stack'
  group?: boolean
  children: JSX.Element
}

export function SettingField(props: SettingFieldProps): JSX.Element {
  const [local] = splitProps(props, [
    'label',
    'description',
    'changed',
    'onReset',
    'lock',
    'layout',
    'group',
    'children',
  ])
  const field = useFieldContext<unknown>()
  const error = () => {
    const first = field().state.meta.errors.at(0)
    return first === undefined || first === null ? undefined : String(first)
  }
  return (
    <div class={ROW}>
      <FieldShell
        label={local.label}
        layout={local.layout}
        group={local.group}
        disabled={Boolean(local.lock)}
        error={error()}
        description={
          <Show when={local.description || local.lock}>
            {local.description}
            <Show when={local.lock}>
              {(reason) => (
                <span class={LOCK}>
                  <Lock class="size-3 shrink-0" aria-hidden="true" />
                  {reason()}
                </span>
              )}
            </Show>
          </Show>
        }
      >
        {local.children}
      </FieldShell>
      <Show when={local.changed && !local.lock}>
        <p class={CHANGED}>
          <span class={CHANGED_DOT} aria-hidden="true" />
          Changed from the default
          <Button variant="link" size="bare" aria-label={`Reset ${local.label} to default`} onClick={local.onReset}>
            Reset to default
          </Button>
        </p>
      </Show>
    </div>
  )
}
