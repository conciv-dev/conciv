import {Match, Switch, type JSX} from 'solid-js'
import {Tabs} from '@conciv/ui-kit-system'
import type {ElementCapture} from '@conciv/protocol/element-capture-types'
import type {ToolProps} from '@conciv/plugin/experimental'
import {CodeBlock, DiffBlock, ElementPreview} from '@conciv/ui-kit-chat/tools'
import {useToolCapture} from '../session-captures.js'
import {pageVerbOfTool} from './page-tool-names.js'
import {PageTool} from './shared.js'

const CODE_VERBS = new Set(['eval', 'css'])

const CODE_INPUT_KEYS = new Set(['code', 'text'])

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
  return `${lines.filter((line): line is string => line !== undefined).join('\n')}\n`
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

export function EditLiveCard(props: ToolProps): JSX.Element {
  const capture = useToolCapture()
  const verb = () => pageVerbOfTool(props.tool)
  const before = () => capture()?.before
  const after = () => capture()?.after
  const skip = () => (CODE_VERBS.has(verb()) ? CODE_INPUT_KEYS : undefined)
  return (
    <PageTool {...props} skip={skip()} hasContent={CODE_VERBS.has(verb()) || before() !== undefined}>
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={CODE_VERBS.has(verb())}>
            <CodeBlock
              file={{
                name: codeFileName(verb()),
                lang: codeLanguage(verb()),
                contents: codeContents(props.input),
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
                <ElementPreview.Root capture={before()} css={capture()?.css}>
                  <ElementPreview.Frame />
                  <ElementPreview.Descriptor />
                </ElementPreview.Root>
              </Tabs.Content>
              <Tabs.Content value="after">
                <ElementPreview.Root capture={after()} css={capture()?.css}>
                  <ElementPreview.Frame />
                  <ElementPreview.Descriptor />
                </ElementPreview.Root>
              </Tabs.Content>
            </Tabs.Root>
            <DiffBlock
              file={{
                name: 'element.txt',
                before: descriptorSummary(before()),
                after: descriptorSummary(after()),
              }}
            />
          </Match>
          <Match when={before() !== undefined}>
            <ElementPreview.Root capture={before()} css={capture()?.css}>
              <ElementPreview.Frame />
              <ElementPreview.Descriptor />
            </ElementPreview.Root>
          </Match>
        </Switch>
      </div>
    </PageTool>
  )
}
