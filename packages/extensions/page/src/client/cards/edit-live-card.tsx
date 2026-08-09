import {Match, Show, Switch, type JSX} from 'solid-js'
import {Tabs} from '@conciv/ui-kit-system'
import {SolidCodeBlock, SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CODE_BLOCK_CLASS, CODE_BLOCK_OPTIONS, DANGER_TEXT_CLASS, ElementPreview} from '@conciv/ui-kit-chat'
import {pageVerbOfTool} from '../../shared/defs.js'
import {CardShell, cardErrorMessage, cardHeader, toolInput} from './shared.js'

const CODE_VERBS = new Set(['eval', 'css'])

const DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
}

function descriptorSummary(capture: ElementCapture | undefined): string {
  if (capture === undefined) return ''
  const descriptor = capture.descriptor
  const lines = [
    `tag: ${descriptor.tagName}`,
    descriptor.role === undefined ? undefined : `role: ${descriptor.role}`,
    descriptor.accessibleName === undefined ? undefined : `name: ${descriptor.accessibleName}`,
    descriptor.value === undefined ? undefined : `value: ${descriptor.value}`,
    descriptor.checked === undefined ? undefined : `checked: ${descriptor.checked}`,
  ]
  return lines.filter((line): line is string => line !== undefined).join('\n')
}

function codeLanguage(verb: string): string {
  return verb === 'css' ? 'css' : 'javascript'
}

function codeFileName(verb: string): string {
  return verb === 'css' ? 'style.css' : 'script.js'
}

function codeContents(input: Record<string, unknown>): string {
  const value = input.code ?? input.text
  return typeof value === 'string' ? value : ''
}

export function EditLiveCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const verb = () => pageVerbOfTool(props.part.name)
  const before = () => props.capture?.before
  const after = () => props.capture?.after
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      metaBadge="writes"
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={CODE_VERBS.has(verb())}>
            <SolidCodeBlock
              class={CODE_BLOCK_CLASS}
              options={CODE_BLOCK_OPTIONS}
              file={{
                name: codeFileName(verb()),
                lang: codeLanguage(verb()),
                contents: codeContents(toolInput(props.part)),
              }}
            />
          </Match>
          <Match when={before() !== undefined && after() !== undefined}>
            <Tabs.Root defaultValue="after">
              <Tabs.List>
                <Tabs.Trigger value="before">Before</Tabs.Trigger>
                <Tabs.Trigger value="after">After</Tabs.Trigger>
                <Tabs.Indicator />
              </Tabs.List>
              <Tabs.Content value="before">
                <ElementPreview.Root capture={before()} css={props.capture?.css}>
                  <ElementPreview.Frame />
                  <ElementPreview.Descriptor />
                </ElementPreview.Root>
              </Tabs.Content>
              <Tabs.Content value="after">
                <ElementPreview.Root capture={after()} css={props.capture?.css}>
                  <ElementPreview.Frame />
                  <ElementPreview.Descriptor />
                </ElementPreview.Root>
              </Tabs.Content>
            </Tabs.Root>
            <SolidFileDiff
              class={CODE_BLOCK_CLASS}
              options={DIFF_OPTIONS}
              oldFile={{name: 'element.txt', contents: descriptorSummary(before())}}
              newFile={{name: 'element.txt', contents: descriptorSummary(after())}}
            />
          </Match>
          <Match when={before() !== undefined}>
            <ElementPreview.Root capture={before()} css={props.capture?.css}>
              <ElementPreview.Frame />
              <ElementPreview.Descriptor />
            </ElementPreview.Root>
          </Match>
        </Switch>
        <Show when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Show>
      </div>
    </CardShell>
  )
}
