import {Show, children, createUniqueId, type JSX} from 'solid-js'

const CARD =
  'flex flex-col rounded-chat-surface-md [border:1px_solid_var(--chat-line)] bg-chat-fill-soft [&>*+*]:[border-block-start:1px_solid_var(--chat-line-soft)]'
export const LABEL = 'flex items-center gap-2 text-[0.8125rem] font-medium text-chat-text-hi'
export const HINT = 'text-[0.75rem] leading-[1.35] text-chat-text-2'
export const ROW = 'flex items-center gap-3 min-h-11.5 py-2.5 px-3'
export const TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
export const HEADLINE = 'flex min-w-0 items-baseline gap-x-2'
const SECTION = `${CARD} overflow-hidden`
const SECTION_DANGER = '[border-color:color-mix(in_oklch,var(--chat-danger)_35%,transparent)]'
const SECTION_HEAD = 'flex items-start gap-2.5 pt-3 px-3 pb-2.5'
const SECTION_TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
const SECTION_TITLE =
  'flex items-center gap-1.75 m-0 font-chat-display text-[0.84375rem] font-semibold text-chat-text-hi'
const SECTION_DESCRIPTION = 'm-0 text-[0.71875rem] leading-[1.35] text-chat-text-2'
const HEADER = 'flex h-13 shrink-0 items-center gap-1.5 px-2 [border-block-end:1px_solid_var(--chat-line-soft)]'
const HEADER_TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
const HEADER_TITLE = 'm-0 font-chat-display text-[0.9375rem] font-semibold text-chat-text-hi leading-[1.25]'

type SettingsHeaderProps = {
  title: JSX.Element
  description?: JSX.Element
  leading?: JSX.Element
  actions?: JSX.Element
}

export function SettingsHeader(props: SettingsHeaderProps): JSX.Element {
  const description = children(() => props.description)
  return (
    <header class={HEADER}>
      {props.leading}
      <div class={HEADER_TEXT}>
        <h2 class={HEADER_TITLE}>{props.title}</h2>
        <Show when={description()}>
          <p class={SECTION_DESCRIPTION}>{description()}</p>
        </Show>
      </div>
      {props.actions}
    </header>
  )
}

type GroupProps = {
  title?: JSX.Element
  description?: string
  danger?: boolean
  children: JSX.Element
  footer?: JSX.Element
}

export function Group(props: GroupProps): JSX.Element {
  const titleId = createUniqueId()
  return (
    <section
      class={`${SECTION} ${props.danger ? SECTION_DANGER : ''}`}
      aria-labelledby={props.title === undefined ? undefined : titleId}
    >
      <Show when={props.title !== undefined}>
        <div class={SECTION_HEAD}>
          <div class={SECTION_TEXT}>
            <span class={HEADLINE}>
              <h3 id={titleId} class={`${SECTION_TITLE} ${props.danger ? '!text-chat-danger' : ''}`}>
                {props.title}
              </h3>
            </span>
            <Show when={props.description}>
              <p class={SECTION_DESCRIPTION}>{props.description}</p>
            </Show>
          </div>
        </div>
      </Show>
      {props.children}
      {props.footer}
    </section>
  )
}

type ActionRowProps = {
  label: JSX.Element
  hint?: JSX.Element
  id?: string
  leading?: JSX.Element
  children: JSX.Element
}

export function ActionRow(props: ActionRowProps): JSX.Element {
  const hint = children(() => props.hint)
  return (
    <div class={ROW} data-action={props.id}>
      {props.leading}
      <span class={TEXT}>
        <span class={LABEL}>{props.label}</span>
        <Show when={hint()}>
          <span class={HINT}>{hint()}</span>
        </Show>
      </span>
      {props.children}
    </div>
  )
}
