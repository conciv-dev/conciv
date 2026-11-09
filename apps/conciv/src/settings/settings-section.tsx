import {Show, createUniqueId, splitProps, type JSX} from 'solid-js'

const SECTION = 'flex flex-col gap-2'
const TITLE =
  'm-0 [font-family:var(--chat-mono)] text-[length:var(--chat-text-micro)] leading-[1.2] font-normal uppercase tracking-[0.14em] [color:var(--chat-microlabel)]'
const LEAD = 'm-0 text-[0.75rem] leading-snug text-chat-text-2'
const CARD = 'flex flex-col rounded-chat-surface-md [border:1px_solid_var(--chat-line)] bg-chat-fill'

type SettingsSectionProps = {
  title: string
  lead?: string
  children: JSX.Element
}

export function SettingsSection(props: SettingsSectionProps): JSX.Element {
  const [local] = splitProps(props, ['title', 'lead', 'children'])
  const titleId = createUniqueId()
  return (
    <section class={SECTION} aria-labelledby={titleId}>
      <h3 id={titleId} class={TITLE}>
        {local.title}
      </h3>
      <Show when={local.lead}>
        <p class={LEAD}>{local.lead}</p>
      </Show>
      <div class={CARD}>{local.children}</div>
    </section>
  )
}
