import {For, splitProps, type JSX} from 'solid-js'
import {isEqual} from 'es-toolkit'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import ArrowUp from 'lucide-solid/icons/arrow-up'
import ArrowDown from 'lucide-solid/icons/arrow-down'
import {useFieldContext} from './form-context.js'
import {arrangeViews} from './arrange-views.js'
import {SettingField} from './setting-field.js'

const LIST = 'flex flex-col m-0 p-0 list-none'
const ITEM = 'flex items-center gap-1 min-h-8 text-[0.8125rem] text-chat-text'
const NAME = 'flex-1 min-w-0 truncate'
const MOVE = 'size-7'

type View = {id: string; label: string}

type ViewOrderFieldProps = {
  label: string
  description?: string
  views: readonly View[]
}

export function ViewOrderField(props: ViewOrderFieldProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'description', 'views'])
  const field = useFieldContext<Record<string, number>>()
  const ordered = () => arrangeViews(local.views, {docksHidden: [], docksCustomOrder: field().state.value})
  const move = (from: number, to: number) => {
    const next = ordered().slice()
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(to, 0, moved)
    const ids = next.map((view) => view.id)
    const order = isEqual(
      ids,
      local.views.map((view) => view.id),
    )
      ? {}
      : Object.fromEntries(ids.map((id, index) => [id, index]))
    field().handleChange(order)
  }
  return (
    <SettingField
      label={local.label}
      description={local.description}
      group
      changed={Object.keys(field().state.value).length > 0}
      onReset={() => field().handleChange({})}
    >
      <ol class={LIST}>
        <For each={ordered()}>
          {(view, index) => (
            <li class={ITEM}>
              <span class={NAME}>{view.label}</span>
              <TooltipIconButton
                tooltip={`Move ${view.label} up`}
                class={MOVE}
                disabled={index() === 0}
                onClick={() => move(index(), index() - 1)}
              >
                <ArrowUp class="size-3.5" aria-hidden="true" />
              </TooltipIconButton>
              <TooltipIconButton
                tooltip={`Move ${view.label} down`}
                class={MOVE}
                disabled={index() === ordered().length - 1}
                onClick={() => move(index(), index() + 1)}
              >
                <ArrowDown class="size-3.5" aria-hidden="true" />
              </TooltipIconButton>
            </li>
          )}
        </For>
      </ol>
    </SettingField>
  )
}
