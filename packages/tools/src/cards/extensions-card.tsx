import {For, Match, Show, Switch, type JSX} from 'solid-js'
import Blocks from 'lucide-solid/icons/blocks'
import type {Catalog, Issue} from '@conciv/extension/catalog'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {
  CodeBlock,
  countLabel,
  parseInput,
  parseResultPayload,
  QUIET_TEXT_CLASS,
  ToolCard,
} from '@conciv/ui-kit-chat/tools'
import {ExtensionsInput} from '../extensions-tool.js'

type Verb = 'catalog' | 'scaffold' | 'validate'

const TITLE_BY_VERB: Record<Verb, string> = {
  catalog: 'Extension catalog',
  scaffold: 'Extension scaffold',
  validate: 'Extension check',
}

const MICROLABEL =
  'uppercase text-[length:var(--chat-text-micro)] leading-none tracking-[0.13em] [font-family:var(--chat-mono)] flex-none'
const SECTION_LABEL = `${MICROLABEL} text-chat-microlabel`
const SECTION = 'flex flex-col gap-0.5 min-w-0'
const ENTRY_ROW =
  'm-0 flex min-w-0 items-baseline gap-2 leading-[var(--chat-trace-gutter)] text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)]'
const ENTRY_NAME = 'flex-none whitespace-nowrap text-chat-target'
const ENTRY_DETAIL = 'min-w-0 flex-1 truncate text-chat-dim'
const ISSUE_ROW = 'flex items-start gap-1.75 leading-[var(--chat-trace-gutter)]'
const ISSUE_MESSAGE =
  'min-w-0 flex-1 text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)] text-chat-text-2 [overflow-wrap:anywhere]'
const ISSUE_TONE: Record<Issue['level'], string> = {error: 'text-chat-danger', warn: 'text-chat-warn'}

function Icon(): JSX.Element {
  return <Blocks size={14} aria-hidden="true" />
}

function isCatalog(payload: unknown): payload is Catalog {
  return typeof payload === 'object' && payload !== null && 'tokens' in payload && 'slots' in payload
}

function isScaffoldResult(payload: unknown): payload is {code: string} {
  return typeof payload === 'object' && payload !== null && typeof (payload as {code?: unknown}).code === 'string'
}

function isValidateResult(payload: unknown): payload is {ok: boolean; issues: Issue[]} {
  return typeof payload === 'object' && payload !== null && Array.isArray((payload as {issues?: unknown}).issues)
}

function catalogPayload(result: ToolCardProps['result']): Catalog | undefined {
  const payload = parseResultPayload(result)
  return isCatalog(payload) ? payload : undefined
}

function scaffoldPayload(result: ToolCardProps['result']): {code: string} | undefined {
  const payload = parseResultPayload(result)
  return isScaffoldResult(payload) ? payload : undefined
}

function validatePayload(result: ToolCardProps['result']): {ok: boolean; issues: Issue[]} | undefined {
  const payload = parseResultPayload(result)
  return isValidateResult(payload) ? payload : undefined
}

function scaffoldLanguage(kind: string | undefined): string {
  return kind === 'theme' || kind === 'tool' ? 'ts' : 'tsx'
}

function EntryRow(props: {name: string; detail: string}): JSX.Element {
  return (
    <p class={ENTRY_ROW}>
      <span class={ENTRY_NAME}>{props.name}</span>
      <span class={ENTRY_DETAIL}>{props.detail}</span>
    </p>
  )
}

function Section(props: {label: string; children: JSX.Element}): JSX.Element {
  return (
    <div class={SECTION}>
      <p class={`${SECTION_LABEL} m-0`}>{props.label}</p>
      {props.children}
    </div>
  )
}

function CatalogBody(props: {catalog: Catalog}): JSX.Element {
  return (
    <div class="flex flex-col gap-2.5">
      <Section label={`Tokens · ${props.catalog.tokens.length}`}>
        <For each={props.catalog.tokens}>{(token) => <EntryRow name={token.name} detail={token.default} />}</For>
      </Section>
      <Section label={`Slots · ${props.catalog.slots.length}`}>
        <For each={props.catalog.slots}>{(slot) => <EntryRow name={slot.name} detail={slot.description} />}</For>
      </Section>
      <Section label={`Client · ${props.catalog.clientSurfaces.length}`}>
        <For each={props.catalog.clientSurfaces}>
          {(surface) => <EntryRow name={surface.method} detail={surface.description} />}
        </For>
      </Section>
      <Section label={`Server · ${props.catalog.serverSurfaces.length}`}>
        <For each={props.catalog.serverSurfaces}>
          {(surface) => <EntryRow name={surface.method} detail={surface.description} />}
        </For>
      </Section>
    </div>
  )
}

function ScaffoldBody(props: {code: string; kind: string | undefined}): JSX.Element {
  const language = () => scaffoldLanguage(props.kind)
  return <CodeBlock size="xs" file={{name: `scaffold.${language()}`, lang: language(), contents: props.code}} />
}

function ValidateBody(props: {issues: Issue[]}): JSX.Element {
  return (
    <Show when={props.issues.length > 0} fallback={<p class={QUIET_TEXT_CLASS}>no issues found</p>}>
      <ul class="m-0 p-0 list-none flex flex-col gap-0.5">
        <For each={props.issues}>
          {(issue) => (
            <li class={ISSUE_ROW}>
              <span class={`${MICROLABEL}  ${ISSUE_TONE[issue.level]}`}>{issue.level}</span>
              <span class={ISSUE_MESSAGE}>{issue.message}</span>
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}

function catalogMeta(catalog: Catalog | undefined): string | undefined {
  if (!catalog) return undefined
  const apis = catalog.clientSurfaces.length + catalog.serverSurfaces.length
  return [
    countLabel(catalog.tokens.length, 'token', 'tokens'),
    countLabel(catalog.slots.length, 'slot', 'slots'),
    countLabel(apis, 'api', 'apis'),
  ].join(' · ')
}

function validateMeta(validateResult: {ok: boolean; issues: Issue[]} | undefined): string | undefined {
  if (!validateResult) return undefined
  return validateResult.ok ? 'ok' : countLabel(validateResult.issues.length, 'issue', 'issues')
}

function metaFor(
  verb: Verb | undefined,
  catalog: Catalog | undefined,
  validateResult: {ok: boolean; issues: Issue[]} | undefined,
  kind: string | undefined,
): string | undefined {
  if (verb === 'catalog') return catalogMeta(catalog)
  if (verb === 'validate') return validateMeta(validateResult)
  if (verb === 'scaffold') return kind
  return undefined
}

export function ExtensionsCard(props: ToolCardProps): JSX.Element {
  const input = () => parseInput(ExtensionsInput, props.part)
  const verb = () => input()?.verb
  const title = (): string => {
    const value = verb()
    return value ? TITLE_BY_VERB[value] : props.part.name
  }
  const catalog = () => catalogPayload(props.result)
  const scaffoldResult = () => scaffoldPayload(props.result)
  const validateResult = () => validatePayload(props.result)
  const failed = () => validateResult()?.ok === false
  return (
    <ToolCard
      Icon={Icon}
      title={title()}
      part={props.part}
      result={props.result}
      status={failed() ? 'error' : undefined}
      meta={metaFor(verb(), catalog(), validateResult(), input()?.kind)}
    >
      <Switch fallback={<p class={QUIET_TEXT_CLASS}>waiting on the tool</p>}>
        <Match when={catalog()}>{(value) => <CatalogBody catalog={value()} />}</Match>
        <Match when={scaffoldResult()}>{(value) => <ScaffoldBody code={value().code} kind={input()?.kind} />}</Match>
        <Match when={validateResult()}>{(value) => <ValidateBody issues={value().issues} />}</Match>
      </Switch>
    </ToolCard>
  )
}
