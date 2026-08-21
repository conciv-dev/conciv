import {type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX, Trace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import {builtinToolCards} from './builtin-tool-cards.js'

const meta: Meta = {title: 'ui-kit-chat-tools/styled/tools/TraceGallery'}
export default meta
type Story = StoryObj

function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
  return {type: 'tool-call', id: 'g1', name, arguments: JSON.stringify(input), input, state}
}

function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'g1', content, state}
}

function catalogCtx(): ToolViewCtx {
  return {
    ...INERT_TOOL_CTX,
    catalog: {
      loaded: () => true,
      meta: () => ({
        summary: 'Reads the forecast for a place',
        category: 'read',
        positional: 'location',
        mutating: false,
        mirrors: false,
        outputSchema: {type: 'string'},
      }),
    },
  }
}

function row(part: ToolCallPart, toolResult: ToolResultPart | undefined, ctx: ToolViewCtx = INERT_TOOL_CTX): TraceItem {
  return {
    key: part.name,
    render: (branch) => (
      <ToolTraceRow part={part} result={toolResult} ctx={ctx} tools={() => builtinToolCards} ring={branch.ring} />
    ),
  }
}

function gallery(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class="chat-theme-terminal p-4 max-w-[34rem] w-full [background:var(--chat-panel)] [font-family:var(--chat-font)]">
      <Trace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}

const PATCH = [
  '*** Begin Patch',
  '*** Update File: src/store/turn-rollup.ts',
  '@@',
  '-const previous = 1',
  '+const next = 2',
  '+const extra = 3',
  '*** End Patch',
].join('\n')

export const Bash: Story = {
  render: () =>
    gallery('1 bash', [
      row(
        call('Bash', {command: 'pnpm turbo run test --filter=@conciv/ui-kit-chat'}),
        result(JSON.stringify({stdout: '58 passed\n0 failed', exitCode: 0})),
      ),
    ]),
}

const BUILD_LOG = [
  '[build] step 18 finished',
  '[build] step 19 finished',
  '[build] step 20 finished',
  'warning: 2 packages resolved from cache',
  'wrote dist/index.js in 812ms',
].join('\n')

export const BashBuildLog: Story = {
  render: () =>
    gallery('1 bash', [
      row(call('Bash', {command: 'pnpm build'}), result(JSON.stringify({stdout: BUILD_LOG, exitCode: 0}))),
    ]),
}

const ANSI_LOG = [
  '\u001b[32m✓\u001b[0m src/store/turn-rollup.test.ts \u001b[2m(12 tests)\u001b[0m',
  '\u001b[31m✕\u001b[0m src/store/thread.test.ts \u001b[2m(1 failed)\u001b[0m',
  '\u001b[33mwarning\u001b[0m: 1 snapshot obsolete',
].join('\n')

export const BashAnsiOutput: Story = {
  render: () =>
    gallery('1 bash', [
      row(call('Bash', {command: 'pnpm vitest run'}), result(JSON.stringify({stdout: ANSI_LOG, exitCode: 0}))),
    ]),
}

export const BashFailed: Story = {
  render: () =>
    gallery('1 failed', [
      row(
        call('Bash', {command: 'pnpm vitest run turn-rollup'}),
        result(
          JSON.stringify({stderr: 'FAIL turn-rollup.test.ts\n  ✕ folds a turn\n1 failed | 12 passed', exitCode: 1}),
        ),
      ),
    ]),
}

export const ApplyPatch: Story = {
  render: () => gallery('1 file · +2 −1', [row(call('apply_patch', {patchText: PATCH}), result('applied'))]),
}

export const FileRead: Story = {
  render: () =>
    gallery('1 read', [
      row(
        call('Read', {file_path: 'packages/ui-kit-chat/src/store/turn-rollup.ts'}),
        result('export function summaryLine(rollup) {\n  return rollupFacts(rollup).join(" · ")\n}'),
      ),
    ]),
}

export const FileEdit: Story = {
  render: () =>
    gallery('1 file · +2 −1', [
      row(
        call('Edit', {
          file_path: 'src/watcher.ts',
          old_string: 'element.addEventListener("resize", onResize)',
          new_string: 'makeEventListener(element, "resize", onResize)\nonCleanup(stop)',
        }),
        result('edited'),
      ),
    ]),
}

export const MultiEdit: Story = {
  render: () =>
    gallery('1 file · +2 −2', [
      row(
        call('MultiEdit', {
          file_path: 'src/thread.tsx',
          edits: [
            {old_string: 'const live = true', new_string: 'const live = turnLive()'},
            {old_string: 'summaryLine(turn)', new_string: 'summaryLine(segment)'},
          ],
        }),
        result('edited'),
      ),
    ]),
}

export const Search: Story = {
  render: () =>
    gallery('1 search', [
      row(
        call('Grep', {pattern: 'addEventListener'}),
        result('src/watcher.ts:12:  element.addEventListener\nsrc/panel.ts:44:  window.addEventListener'),
      ),
    ]),
}

export const SearchFailed: Story = {
  render: () => gallery('1 failed', [row(call('Grep', {pattern: '('}), result('invalid regular expression', 'error'))]),
}

export const Todo: Story = {
  render: () =>
    gallery('1 todo', [
      row(
        call('TodoWrite', {
          todos: [
            {content: 'Scaffold the trace', status: 'completed'},
            {content: 'Mount tool bodies', activeForm: 'Mounting tool bodies', status: 'in_progress'},
            {content: 'Shoot the gallery', status: 'pending'},
          ],
        }),
        undefined,
      ),
    ]),
}

export const DiscoveredApis: Story = {
  render: () =>
    gallery('1 apis', [
      row(
        call('discovered_apis', {}),
        result(JSON.stringify({apis: [{name: 'useChat', kind: 'hook', file: 'src/use-chat.ts'}]})),
      ),
    ]),
}

export const ToolLookup: Story = {
  render: () =>
    gallery('1 lookup', [
      row(call('ToolSearch', {query: 'canvas'}), result(JSON.stringify({tools: [{name: 'canvas_draw'}]}))),
    ]),
}

export const DeclaredMetaTool: Story = {
  render: () =>
    gallery('1 forecast', [
      row(call('weather_forecast', {location: 'Tel Aviv', units: 'metric'}), result('clear, 24C'), catalogCtx()),
    ]),
}

export const GenericFallback: Story = {
  render: () =>
    gallery('1 forecast', [
      row(call('mcp__weather__forecast', {location: 'Tel Aviv', days: 3}), result('clear skies over the bay')),
    ]),
}

export const PendingRow: Story = {
  render: () => gallery('1 bash', [row(call('Bash', {command: 'pnpm build'}, 'input-complete'), undefined)]),
}

export const SingleRowElbowOnly: Story = {
  render: () =>
    gallery('1 bash', [row(call('Bash', {command: 'ls'}), result(JSON.stringify({stdout: 'src', exitCode: 0})))]),
}

const TALL_OUTPUT = Array.from({length: 40}, (_, index) => `line ${index + 1} of a very tall body`).join('\n')

export const TallMiddleBody: Story = {
  render: () =>
    gallery('3 bash', [
      {...row(call('Bash', {command: 'echo first'}), result(JSON.stringify({stdout: 'first', exitCode: 0}))), key: 'a'},
      {
        ...row(
          call('Bash', {command: 'pnpm test --reporter verbose'}),
          result(JSON.stringify({stdout: TALL_OUTPUT, exitCode: 0})),
        ),
        key: 'b',
      },
      {...row(call('Bash', {command: 'echo last'}), result(JSON.stringify({stdout: 'last', exitCode: 0}))), key: 'c'},
    ]),
}

const ISLAND_SHELL_MATCHES = [
  'src/styles.css:248:.island-shell {',
  'src/routes/form.tsx:101:      <section className="island-shell rise-in relative overflow-hidden rounded-[1.75rem] px-6 py-8">',
  'src/routes/form.tsx:117:        <div className="island-shell rounded-[1.25rem] p-4 sm:p-5">',
  'src/routes/form.tsx:136:        className="island-shell island-raised flex flex-col gap-8 rounded-[1.5rem] p-6"',
  'src/routes/form.tsx:461:        className="island-shell flex h-fit flex-col gap-5 rounded-[1.5rem] p-5 lg:sticky"',
  'src/routes/about.tsx:32:      <section className="island-shell island-raised rise-in relative overflow-hidden">',
  'src/routes/about.tsx:48:        <div className="island-shell rounded-[1.25rem] p-4 sm:p-5">',
  'src/routes/about.tsx:72:      <section className="island-shell mt-5 rounded-[1.5rem] p-6 sm:p-7">',
  'src/routes/index.tsx:44:      <section className="island-shell island-raised rise-in relative">',
  'src/routes/index.tsx:88:        <article className="island-shell rounded-[1.25rem] p-5">',
  'src/routes/index.tsx:120:        <article className="island-shell rounded-[1.25rem] p-5">',
  'src/routes/index.tsx:151:      <aside className="island-shell rounded-[1.5rem] p-6">',
].join('\n')

export const SearchManyMatches: Story = {
  render: () => gallery('1 search', [row(call('Grep', {pattern: 'island-shell'}), result(ISLAND_SHELL_MATCHES))]),
}

const TAIL_OUTPUT = Array.from({length: 30}, (_, index) => `[build] step ${index + 1} finished`).join('\n')

function streamingResult(content: string): ToolResultPart {
  return {type: 'tool-result', toolCallId: 'g1', content, state: 'streaming'}
}

export const LiveTailClamp: Story = {
  render: () =>
    gallery('1 bash', [
      {
        ...row(
          call('Bash', {command: 'pnpm build --watch'}, 'input-complete'),
          streamingResult(JSON.stringify({stdout: TAIL_OUTPUT})),
        ),
        key: 'tail',
        live: true,
      },
    ]),
}

export const MixedTree: Story = {
  render: () =>
    gallery('2 files · +5 −2 · 1 read', [
      {...row(call('Read', {file_path: 'src/watcher.ts'}), result('one\ntwo\nthree')), key: 'read'},
      {...row(call('apply_patch', {patchText: PATCH}), result('applied')), key: 'patch'},
      {
        ...row(call('Bash', {command: 'pnpm lint'}), result(JSON.stringify({exitCode: 0}))),
        key: 'quiet',
      },
      {
        ...row(call('Bash', {command: 'pnpm typecheck'}), result(JSON.stringify({stdout: 'ok', exitCode: 0}))),
        key: 'bash',
      },
    ]),
}

function askingCall(command: string): ToolCallPart {
  return {
    type: 'tool-call',
    id: 'g1',
    name: 'Bash',
    arguments: JSON.stringify({command}),
    state: 'approval-requested',
    approval: {id: 'approval-1', needsApproval: true},
  }
}

function askingCtx(): ToolViewCtx {
  return {...INERT_TOOL_CTX, respondApproval: () => {}}
}

export const PermissionBlockLast: Story = {
  render: () =>
    gallery('2 bash · 1 waiting', [
      {...row(call('Bash', {command: 'pnpm lint'}), result(JSON.stringify({stdout: 'ok', exitCode: 0}))), key: 'lint'},
      {
        key: 'ask',
        render: (branch) => (
          <ToolTraceRow
            part={askingCall('rm -rf apps/conciv/dist')}
            result={undefined}
            ctx={askingCtx()}
            tools={() => builtinToolCards}
            ring={branch.ring}
          />
        ),
      },
    ]),
}

export const LastRowWithoutBody: Story = {
  render: () =>
    gallery('2 bash', [
      {...row(call('Bash', {command: 'pnpm lint'}), result(JSON.stringify({stdout: 'ok', exitCode: 0}))), key: 'lint'},
      {...row(call('Bash', {command: 'pnpm clean'}), result(JSON.stringify({exitCode: 0}))), key: 'quiet'},
    ]),
}
