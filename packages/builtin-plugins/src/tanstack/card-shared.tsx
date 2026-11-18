import {splitProps, Switch, Match, type JSX} from 'solid-js'
import {z} from 'zod'
import {isPlainObject, lowerCase, upperFirst} from 'es-toolkit'
import type {ToolProps} from '@conciv/plugin/experimental'
import {Operations, type Operation} from '@conciv/plugin-tanstack/rpc'
import {tanstackToolMeta} from './tanstack-tool-names.js'
import {BasicTool, CodeBlock, JsonTree, ToolErrorCard} from '@conciv/ui-kit-chat/tools'

export function tanstackOperation<const Name extends Operation['name']>(name: Name): Extract<Operation, {name: Name}> {
  const operation = Operations.find(
    (candidate): candidate is Extract<Operation, {name: Name}> => candidate.name === name,
  )
  if (operation === undefined) throw new Error(`no tanstack operation named ${name}`)
  return operation
}

const OkResult = z.looseObject({ok: z.literal(true)})

export function parseOutput(output: string | undefined): unknown {
  if (!output) return undefined
  try {
    return JSON.parse(output)
  } catch {
    return undefined
  }
}

export function readInput<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> | undefined {
  const parsed = schema.safeParse(input)
  return parsed.success ? parsed.data : undefined
}

export function resultOk(output: string | undefined): boolean {
  return OkResult.safeParse(parseOutput(output)).success
}

export function CardRows(props: {children: JSX.Element}): JSX.Element {
  return <div class="flex flex-col gap-0.5">{props.children}</div>
}

export function CardRow(props: {children: JSX.Element}): JSX.Element {
  return <div class="text-chat-xs font-chat-mono flex gap-2 items-baseline">{props.children}</div>
}

export function CardNote(props: {children: JSX.Element; class?: string}): JSX.Element {
  return <div class={`text-chat-xs text-chat-text-3 ${props.class ?? ''}`}>{props.children}</div>
}

function isTreeable(value: unknown): value is object {
  return Array.isArray(value) || isPlainObject(value)
}

export function JsonValue(props: {value: unknown; name?: string}): JSX.Element {
  return (
    <Switch>
      <Match when={isTreeable(props.value) && props.value}>{(value) => <JsonTree data={value()} />}</Match>
      <Match when={!isTreeable(props.value)}>
        <CodeBlock
          size="xs"
          file={{name: props.name ?? 'value.json', lang: 'json', contents: JSON.stringify(props.value, null, 2)}}
        />
      </Match>
    </Switch>
  )
}

function tanstackTitle(tool: string, status: string | undefined): string {
  const label = tanstackToolMeta(tool)?.label
  if (label === undefined) return tool
  return status === 'pending' || status === 'running' || status === 'streaming' ? label.running : label.done
}

export function InspectionCard(
  props: ToolProps & {summary: string; failed?: boolean; hasContent?: boolean; children?: JSX.Element},
): JSX.Element {
  const [local, tool] = splitProps(props, ['summary', 'failed', 'hasContent', 'children'])
  const running = () => tool.status === 'pending' || tool.status === 'running' || tool.status === 'streaming'
  return (
    <BasicTool
      {...tool}
      status={local.failed === true ? 'error' : tool.status}
      trigger={{title: tanstackTitle(tool.tool, tool.status), subtitle: running() ? undefined : local.summary}}
      hasContent={!running() && (local.hasContent ?? false)}
    >
      {local.children}
    </BasicTool>
  )
}

export function TanstackFailedCard(props: ToolProps): JSX.Element {
  return (
    <ToolErrorCard
      tool={props.tool}
      error={props.error ?? ''}
      title={upperFirst(lowerCase(props.tool.replace(/^tanstack_/, '')))}
      defaultOpen={props.defaultOpen}
      open={props.open}
      onOpenChange={props.onOpenChange}
    />
  )
}
