import {createSignal, Show, type JSX, type ParentProps} from 'solid-js'
import Brain from 'lucide-solid/icons/brain'
import {createStickToBottom} from '@conciv/solid-stick-to-bottom'
import {Group} from './group.js'

export type ChainOfThoughtProps = ParentProps<{
  streaming?: boolean
  autoOpen?: boolean
  grow?: boolean
}>

const NODE =
  'shrink-0 size-[1.375rem] flex items-center justify-center rounded-full [background:var(--chat-bg)] [border:1px_solid_var(--chat-line)] text-[color:var(--chat-text-3)]'
const LINE = 'w-px flex-1 [background:var(--chat-line)]'

const NODE_ROW = 'flex items-center shrink-0 mt-px text-[length:var(--chat-text-md)] [height:calc(1lh_+_1rem)]'

const PREVIEW =
  'max-h-64 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]'

function Step(props: {icon: JSX.Element; last?: boolean; children: JSX.Element}): JSX.Element {
  return (
    <div class="flex gap-2.5">
      <div class="flex flex-col items-center self-stretch">
        <div class={NODE_ROW}>
          <span class={NODE}>{props.icon}</span>
        </div>
        <Show when={!props.last}>
          <span aria-hidden="true" class={LINE} />
        </Show>
      </div>
      <div class="pb-3 flex-1 min-w-0">{props.children}</div>
    </div>
  )
}

function Root(props: ChainOfThoughtProps): JSX.Element {
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  const capped = () => !props.grow
  const streaming = () => props.streaming === true
  createStickToBottom(scroller, {
    initial: 'instant',
    follow: () => capped() && streaming(),
  })
  return (
    <Group.Root streaming={streaming()} autoOpen={(props.autoOpen ?? props.streaming) === true}>
      <Group.Trigger
        icon={<Brain size={14} class="text-[color:var(--chat-text-3)] shrink-0" />}
        label={streaming() ? 'Working…' : 'Chain of Thought'}
      />
      <Group.Content>
        <div ref={setScroller} class={`pt-2 ${capped() ? PREVIEW : ''}`}>
          <div class="flex flex-col">{props.children}</div>
        </div>
      </Group.Content>
    </Group.Root>
  )
}

export const ChainOfThought = Object.assign(Root, {Step})
