import {For, type JSX} from 'solid-js'
import ArrowLeft from 'lucide-solid/icons/arrow-left'
import {formatHex} from 'culori'
import {Button, ClipboardCopyButton, TooltipIconButton} from '@conciv/ui-kit-system'
import type {createXrayData} from './data.js'

export function Card(props: {
  card: NonNullable<ReturnType<ReturnType<typeof createXrayData>['card']>>
  data: ReturnType<typeof createXrayData>
}): JSX.Element {
  const dom = () => props.card.layer.dom[0]
  const css = () => props.card.layer.cssom[0]
  const look = () => props.card.look
  const compare = () => [
    {
      label: 'Corners',
      design: withToken(plain(look()?.radius), look()?.token_radius),
      page: plain(css()?.radius),
      same: whole(look()?.radius) === whole(css()?.radius),
    },
    {
      label: 'Fill',
      design: withToken(look()?.fill?.toUpperCase() ?? '', look()?.token_fill),
      page: css()?.background ?? '',
      same: (look()?.fill ?? '').toLowerCase() === hexOf(css()?.background),
    },
    {
      label: 'Size',
      design: `${plain(look()?.w)} × ${plain(look()?.h)}`,
      page: `${plain(dom()?.box.w)} × ${plain(dom()?.box.h)}`,
      same: whole(look()?.w) === whole(dom()?.box.w) && whole(look()?.h) === whole(dom()?.box.h),
    },
    {
      label: 'Position',
      design: `${plain(look()?.x)}, ${plain(look()?.y)}`,
      page: `${plain(dom()?.box.x)}, ${plain(dom()?.box.y)}`,
      same: whole(look()?.x) === whole(dom()?.box.x) && whole(look()?.y) === whole(dom()?.box.y),
    },
  ]
  const wrong = () => {
    const target = props.data.design.latest?.target.id
    const round = props.data.shownRound()?.round
    if (target === undefined || round === undefined) return
    void props.data.label({target, round, node: props.card.node, id: props.card.layer.id, verdict: 'wrong'})
  }
  const brief = () =>
    [
      `${props.card.name}, Figma node ${props.card.node}`,
      props.card.source === null ? '' : `In code: ${props.card.source}`,
      ...props.card.lines,
    ]
      .filter((line) => line !== '')
      .join('\n')
  return (
    <div class="px-6 flex flex-col gap-5" data-conciv-key="il7bKQ">
      <div class="flex gap-2 items-center" data-conciv-key="ZMn3Vg">
        <TooltipIconButton
          tooltip="All problems"
          side="bottom"
          class="p-1 size-6"
          onClick={() => props.data.pickNode(null)}
          data-conciv-key="0C0BjA"
        >
          <ArrowLeft class="size-full block" aria-hidden="true" />
        </TooltipIconButton>
        <span class="text-[length:var(--chat-text-md)] text-chat-text-2" data-conciv-key="Vwb8Fg">
          All problems
        </span>
      </div>
      <div class="flex flex-col gap-0.5" data-conciv-key="7Q0Flw">
        <span class="text-xl text-chat-text-hi font-semibold" data-conciv-key="WHN2Gg">
          {props.card.name}
        </span>
        <span class="text-[length:var(--chat-text-md)] text-chat-text-2" data-conciv-key="ZiSyxA">
          {props.card.magnitude === null
            ? 'Matches the design.'
            : `${props.card.within === null ? 'An element' : `Inside ${props.card.within}`}. Looks different from the design.`}
        </span>
      </div>
      <div class="border border-chat-line rounded-chat-surface-md flex flex-col" data-conciv-key="_lOKyQ">
        <div
          class="text-xs text-chat-text-3 font-semibold px-3 py-2 bg-chat-fill-soft gap-2 grid grid-cols-3"
          data-conciv-key="fETKJg"
        >
          <span class="leading-[1.45]" data-conciv-key="HDXulA" />
          <span class="leading-[1.45]" data-conciv-key="EpZC8A">
            Design wants
          </span>
          <span class="leading-[1.45]" data-conciv-key="WaC24w">
            Page has
          </span>
        </div>
        <For each={compare()}>
          {(row) => (
            <div
              class="text-xs px-3 py-2 border-b border-chat-line-soft gap-2 grid grid-cols-3 last:border-b-0"
              data-conciv-key="arD-mw"
            >
              <span class="text-chat-text-2 leading-[1.45]" data-conciv-key="T0dL0A">
                {row.label}
              </span>
              <span
                class="text-chat-text font-chat-mono whitespace-pre-wrap [overflow-wrap:anywhere]"
                data-conciv-key="hwIpkw"
              >
                {row.design}
              </span>
              <span
                class={`font-chat-mono whitespace-pre-wrap [overflow-wrap:anywhere] ${row.same ? 'text-chat-text' : 'text-chat-danger'}`}
                data-conciv-key="b1I3NA"
              >
                {row.page}
              </span>
            </div>
          )}
        </For>
      </div>
      <div class="flex flex-col gap-1.5 w-fit items-start" data-conciv-key="P0aYRg">
        <span
          class="text-[length:var(--chat-text-xs)] text-chat-text-3 tracking-wide font-semibold"
          data-conciv-key="K6-tuw"
        >
          WHERE
        </span>
        <div class="flex gap-2 items-center" data-conciv-key="3L9L3w">
          <span class="text-[length:var(--chat-text-md)] text-chat-text-2" data-conciv-key="xV-WLQ">
            In code
          </span>
          <span class="text-[length:var(--chat-text-md)] text-chat-accent" data-conciv-key="J9dY6A">
            {whereCode(props.card.source)}
          </span>
        </div>
        <div class="flex gap-2 items-center" data-conciv-key="T1RvXw">
          <span class="text-[length:var(--chat-text-md)] text-chat-text-2" data-conciv-key="eqAZrw">
            On the page
          </span>
          <span class="text-[length:var(--chat-text-md)] text-chat-text font-chat-mono" data-conciv-key="dHSVkw">
            {wherePage(props.card.layer)}
          </span>
        </div>
        <div class="flex gap-2 items-center" data-conciv-key="xHhnNQ">
          <span class="text-[length:var(--chat-text-md)] text-chat-text-2" data-conciv-key="npBEPw">
            In Figma
          </span>
          <span class="text-[length:var(--chat-text-md)] text-chat-accent" data-conciv-key="Hw_iqQ">
            {props.card.name}, instance {props.card.node}
          </span>
        </div>
      </div>
      <div class="flex gap-2 w-fit items-center" data-conciv-key="6bynCg">
        <label
          class="text-xs text-chat-text-hi font-semibold pe-2.5 ps-0.5 border border-chat-line rounded-chat-surface-sm bg-chat-fill-soft inline-flex cursor-pointer items-center"
          data-conciv-key="cyFXOg"
        >
          <ClipboardCopyButton text={brief()} tooltips={{idle: 'Copy for the agent'}} class="size-6.5" />
          <span data-conciv-key="kFgDbw">Copy for the agent</span>
        </label>
        <Button variant="outline" size="sm" class="font-semibold" onClick={wrong} data-conciv-key="cyFXOh">
          Wrong element?
        </Button>
      </div>
    </div>
  )
}

function whole(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : Math.round(value)
}

function withToken(value: string, token: string | null | undefined): string {
  return token === null || token === undefined ? value : `${value}  ${token}`
}

function hexOf(color: string | undefined): string {
  return formatHex(color ?? '') ?? ''
}

function plain(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : `${Math.round(value * 10) / 10}`
}

function whereCode(source: string | null): string {
  const parts = source?.split(':') ?? []
  return parts.length < 2 ? '' : `${parts[0]}, line ${parts[1]}`
}

function wherePage(layer: NonNullable<ReturnType<ReturnType<typeof createXrayData>['card']>>['layer']): string {
  const first = layer.src.classes[0]
  return first === undefined ? layer.src.element : `${layer.src.element}.${first}`
}
