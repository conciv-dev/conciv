import {For, Match, Show, Switch, type JSX} from 'solid-js'
import Blocks from 'lucide-solid/icons/blocks'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {TruncatedText} from '@conciv/ui-kit-system'
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

const CatalogTokenSchema = z.looseObject({name: z.string(), default: z.string()})
const CatalogSlotSchema = z.looseObject({name: z.string(), description: z.string()})
const CatalogSurfaceSchema = z.looseObject({method: z.string(), description: z.string()})
const CatalogSchema = z.looseObject({
  tokens: z.array(CatalogTokenSchema),
  slots: z.array(CatalogSlotSchema),
  clientSurfaces: z.array(CatalogSurfaceSchema),
  serverSurfaces: z.array(CatalogSurfaceSchema),
})
type CardCatalog = z.infer<typeof CatalogSchema>

const ScaffoldResultSchema = z.looseObject({code: z.string()})

const IssueSchema = z.object({level: z.enum(['error', 'warn']), message: z.string()})
type CardIssue = z.infer<typeof IssueSchema>

const ValidateResultSchema = z.looseObject({ok: z.boolean(), issues: z.array(IssueSchema)})
type CardValidateResult = z.infer<typeof ValidateResultSchema>

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
const ISSUE_TONE: Record<CardIssue['level'], string> = {error: 'text-chat-danger', warn: 'text-chat-warn'}

function Icon(): JSX.Element {
  return <Blocks size={14} aria-hidden="true" />
}

function catalogPayload(result: ToolCardProps['result']): CardCatalog | undefined {
  const parsed = CatalogSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : undefined
}

function scaffoldPayload(result: ToolCardProps['result']): {code: string} | undefined {
  const parsed = ScaffoldResultSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : undefined
}

function validatePayload(result: ToolCardProps['result']): CardValidateResult | undefined {
  const parsed = ValidateResultSchema.safeParse(parseResultPayload(result))
  return parsed.success ? parsed.data : undefined
}

function scaffoldLanguage(kind: string | undefined): string {
  return kind === 'tool' ? 'ts' : 'tsx'
}

function EntryRow(props: {name: string; detail: string}): JSX.Element {
  return (
    <p class={ENTRY_ROW}>
      <span class={ENTRY_NAME}>{props.name}</span>
      <TruncatedText class={ENTRY_DETAIL} text={props.detail} />
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

function CatalogBody(props: {catalog: CardCatalog}): JSX.Element {
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

function ValidateBody(props: {issues: CardIssue[]}): JSX.Element {
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

function catalogMeta(catalog: CardCatalog | undefined): string | undefined {
  if (!catalog) return undefined
  const apis = catalog.clientSurfaces.length + catalog.serverSurfaces.length
  return [
    countLabel(catalog.tokens.length, 'token', 'tokens'),
    countLabel(catalog.slots.length, 'slot', 'slots'),
    countLabel(apis, 'api', 'apis'),
  ].join(' · ')
}

function validateMeta(validateResult: CardValidateResult | undefined): string | undefined {
  if (!validateResult) return undefined
  return validateResult.ok ? 'ok' : countLabel(validateResult.issues.length, 'issue', 'issues')
}

function metaFor(
  verb: Verb | undefined,
  catalog: CardCatalog | undefined,
  validateResult: CardValidateResult | undefined,
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
