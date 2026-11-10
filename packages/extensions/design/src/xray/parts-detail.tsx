import {For, Show, type JSX} from 'solid-js'
import {Button, createClipboardCopy} from '@conciv/ui-kit-system'
import {Chip} from '@conciv/ui-kit-chat/tools'
import type {createXrayData} from './data.js'

export function PartDetail(props: {part: Part; data: Data}): JSX.Element {
  const copy = createClipboardCopy({text: () => props.part.importLine})
  const hidden = () => props.part.flag === DO_NOT_USE
  const busy = () => props.data.flagged.loading
  const flag = (next: Flag) => props.data.flagPart({id: props.part.id, flag: next})
  return (
    <div class="pb-3.5 pe-3 ps-26 pt-3 flex flex-col gap-2 items-start" data-conciv-key="esBOHg">
      <code
        class="text-[length:var(--chat-text-md)] text-chat-text-hi font-chat-mono whitespace-pre-wrap [overflow-wrap:anywhere]"
        data-conciv-key="7d4wRQ"
      >
        {props.part.importLine}
      </code>
      <Show when={props.part.sentence}>
        {(sentence) => (
          <p class="text-[length:var(--chat-text-md)] text-chat-text m-0" data-conciv-key="F8UiHQ">
            {sentence()}
          </p>
        )}
      </Show>
      <p class="text-[length:var(--chat-text-md)] text-chat-text-2 m-0" data-conciv-key="GdrdpA">
        {'Props that matter: '}
        <Show when={props.part.props !== SEE_FILE} fallback={SEE_FILE}>
          <For each={matter(props.part.props)}>
            {(prop, index) => (
              <>
                <span class="text-chat-text-hi font-chat-mono" data-conciv-key="-qqDhw">
                  {prop.name}
                </span>
                <Show when={prop.values.length > 0}>{` ${prop.values.join(VALUE_GAP)}`}</Show>
                <Show when={index() < matter(props.part.props).length - 1}>{PROP_GAP}</Show>
              </>
            )}
          </For>
        </Show>
      </p>
      <div class="flex flex-col gap-1.5" data-conciv-key="R5hSUA">
        <span class="text-[length:var(--chat-text-md)] text-chat-text-2" data-conciv-key="i7gPww">
          Renders on this page
        </span>
        <Show
          when={props.part.renders.length > 0}
          fallback={
            <span class="text-[length:var(--chat-text-md)] text-chat-text-3" data-conciv-key="lQ4PbA">
              Nothing on this page.
            </span>
          }
        >
          <ul
            aria-label="Renders on this page"
            class="m-0 p-0 list-none flex flex-col gap-1.5"
            data-conciv-key="rJvohw"
          >
            <For each={props.part.renders}>
              {(render) => (
                <li class="text-[length:var(--chat-text-md)] flex gap-1.5 items-center" data-conciv-key="oVOrpA">
                  <span class="text-chat-text-2" data-conciv-key="R7d_Uw">
                    {render.name}
                  </span>
                  <span class="text-chat-text-hi" data-conciv-key="gFEijA">
                    {render.text}
                  </span>
                  <Chip kind="pill" tone="success" value={render.node} class="shrink-0" />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <div class="flex flex-wrap gap-2 items-center" data-conciv-key="4yMfug">
        <Button variant="outline" size="sm" class="font-semibold" onClick={() => copy.copy()}>
          Copy import
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="font-semibold"
          disabled={busy()}
          onClick={() => flag(hidden() ? CLEAR : DO_NOT_USE)}
        >
          {hidden() ? 'Use again' : 'Do not use'}
        </Button>
      </div>
      <Show when={props.data.flagged.error}>
        <p role="alert" class="text-[length:var(--chat-text-md)] text-chat-danger m-0" data-conciv-key="lLE4Uw">
          The flag was not saved. Try again.
        </p>
      </Show>
      <p role="status" class="sr-only" data-conciv-key="qDWMgQ">
        {copy.announcement()}
      </p>
    </div>
  )
}

type Data = ReturnType<typeof createXrayData>

type Part = NonNullable<ReturnType<Data['parts']>>['components'][number]

type Flag = Parameters<Data['flagPart']>[0]['flag']

type Prop = Exclude<Part['props'], string>[number]

const SEE_FILE = 'see file'

const DO_NOT_USE = 'do-not-use'

const CLEAR = 'clear'

const VALUE_GAP = ' · '

const PROP_GAP = ', '

function matter(sketched: Part['props']): Prop[] {
  if (sketched === SEE_FILE) return []
  return sketched.filter((prop) => prop.required || prop.values.length > 0)
}
