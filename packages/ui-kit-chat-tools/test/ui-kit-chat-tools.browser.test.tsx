import 'virtual:uno.css'
import {z} from 'zod'
import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {cleanup} from '@solidjs/testing-library'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import {defineTool} from '@conciv/extension/tool'
import type {AnyToolBuilder} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import type {ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {PAGE_TOOL_DEFS, pageToolMetaOf, pageVerbOfTool} from '@conciv/extension-page/defs'
import {
  GENERIC_TOOL_ICON,
  INERT_ADD_RESULT,
  INERT_TOOL_CTX,
  MetaToolCard,
  ToolTraceRow,
  nowTitle,
  toolIconRender,
} from '@conciv/ui-kit-chat/tools'
import {SearchCard} from '../src/styled/tools/search-card.js'
import {ToolLookupCard} from '../src/styled/tools/tool-lookup-card.js'
import {TodoCard} from '../src/styled/tools/todo-card.js'
import {FileReadCard} from '../src/styled/tools/file-read-card.js'
import {hiddenMatchSummary, type SearchFileGroup} from '../src/styled/tools/search-matches.js'
import {builtinToolCards} from '../src/styled/tools/builtin-tool-cards.js'
import {builtinPageRegistry, mountView, registryCatalogView} from './helpers.js'

describe('card body floor', () => {
  function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
    return {type: 'tool-call', id: 'f1', name, arguments: JSON.stringify(input), input, state}
  }

  function result(content: string): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'f1', content, state: 'complete'}
  }

  async function expandFirst(): Promise<void> {
    await page.getByRole('button').first().click()
  }

  it('search card names the running state instead of expanding into nothing', async () => {
    mountView(() => (
      <SearchCard
        part={call('Grep', {pattern: 'useChat'}, 'input-complete')}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('searching…')).toBeVisible()
  })

  it('search card reports no matches instead of expanding into nothing', async () => {
    mountView(() => (
      <SearchCard
        part={call('Grep', {pattern: 'nothing'})}
        result={result('')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('no matches')).toBeVisible()
  })

  it('tool lookup card reports a missing query instead of expanding into nothing', async () => {
    mountView(() => (
      <ToolLookupCard
        part={call('ToolSearch', {})}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('no query')).toBeVisible()
  })

  it('todo card reports an empty list instead of expanding into nothing', async () => {
    mountView(() => (
      <TodoCard
        part={call('TodoWrite', {todos: []})}
        result={result('{"todos":[]}')}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('no to-dos yet')).toBeVisible()
  })

  it('file read card reports the pending file instead of expanding into nothing', async () => {
    mountView(() => (
      <FileReadCard
        part={call('Read', {}, 'input-streaming')}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expandFirst()
    await expect.element(page.getByText('waiting for the file')).toBeVisible()
  })
})

describe('catalog cards', () => {
  const shipTool = defineTool({
    name: 'page_ship',
    description: 'ship the page the user is looking at',
    inputSchema: z.object({selector: z.string(), note: z.string().optional()}),
    outputSchema: z.string(),
    meta: {
      summary: 'ship the page the user is looking at',
      category: 'act',
      icon: 'pointer',
      label: {running: 'Shipping the page', done: 'Shipped the page'},
      positional: 'selector',
    },
  }).client()

  const bannerTool = defineTool({
    name: 'page_banner',
    description: 'paint a banner over the page',
    inputSchema: z.object({value: z.string().optional()}),
    outputSchema: z.object({ok: z.literal(true)}),
    errors: {NO_CANVAS: {message: 'this page has nowhere to paint a banner'}},
    meta: {
      summary: 'paint a banner over the page',
      category: 'act',
      icon: 'edit',
      label: {running: 'Painting the banner', done: 'Painted the banner'},
      mutating: true,
      mirrors: true,
      hint: 'the banner disappears on the next navigation',
    },
  }).client()

  const plainTool = defineTool({
    name: 'page_plain',
    description: 'do something the widget has no cosmetics for',
    inputSchema: z.object({}),
    outputSchema: z.object({ok: z.literal(true)}),
    meta: {summary: 'do something the widget has no cosmetics for', category: 'act'},
  }).client()

  const countTool = defineTool({
    name: 'page_count',
    description: 'count the elements the page shows',
    inputSchema: z.object({}),
    outputSchema: z.number(),
    meta: {summary: 'count the elements the page shows', category: 'read', icon: 'read'},
  }).client()

  function declaredRegistry() {
    const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
    for (const def of PAGE_TOOL_DEFS) registry.register(def.client(), {owner: 'a built-in page tool'})
    for (const tool of [shipTool, bannerTool, plainTool, countTool])
      registry.register(tool, {owner: 'a test registrant'})
    return registry
  }

  function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
    return {apiBase: '', harnessId: 'test', sendMessage: () => {}, addResult: () => {}, catalog}
  }

  function part(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
    return {type: 'tool-call', id: 'p1', name, arguments: JSON.stringify(input), input, state}
  }

  function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'p1', content, state}
  }

  it('a non-builtin registry tool renders its declared labels and its positional argument', async () => {
    const catalog = registryCatalogView(declaredRegistry())

    mountView(() => (
      <MetaToolCard
        part={part('page_ship', {selector: '#hero'})}
        result={undefined}
        ctx={ctxWith(catalog)}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByText('Shipped the page #hero')).toBeVisible()
    expect(nowTitle(part('page_ship', {selector: '#hero'}, 'input-streaming'), catalog)).toBe('Shipping the page')
    await page.screenshot({path: '__screenshots__/catalog-cards/declared-non-builtin.png'})
  })

  it('a mutating mirroring registry tool shows its write badge, its hint and the mirror row', async () => {
    const catalog = registryCatalogView(declaredRegistry())

    mountView(() => (
      <MetaToolCard
        part={part('page_banner', {value: 'Sale'})}
        result={result('{"ok":true}')}
        ctx={ctxWith(catalog)}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByText('page edit')).toBeVisible()
    await page.getByRole('button').click()
    await expect.element(page.getByText('shown on your page')).toBeVisible()
    await expect.element(page.getByText('the banner disappears on the next navigation')).toBeVisible()
  })

  it('a tool declaring an error renders the declared message instead of the raw failure string', async () => {
    const catalog = registryCatalogView(declaredRegistry())

    mountView(() => (
      <MetaToolCard
        part={part('page_banner', {value: 'Sale'})}
        result={result('{"error":{"message":"page_banner failed","code":"NO_CANVAS"}}', 'error')}
        ctx={ctxWith(catalog)}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await page.getByRole('button').click()
    await expect.element(page.getByText('this page has nowhere to paint a banner')).toBeVisible()
    expect(document.body.textContent).not.toContain('page_banner failed')
  })

  it('a string output schema renders the result as a code block', async () => {
    const catalog = registryCatalogView(declaredRegistry())

    mountView(() => (
      <MetaToolCard
        part={part('page_ship', {selector: '#hero'})}
        result={result(JSON.stringify('shipped-42'))}
        ctx={ctxWith(catalog)}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await page.getByRole('button').click()
    await expect.element(page.getByText('shipped-42', {exact: true})).toBeVisible()
  })

  it('a scalar output schema renders the result as a chip', async () => {
    const catalog = registryCatalogView(declaredRegistry())

    mountView(() => (
      <MetaToolCard
        part={part('page_count', {})}
        result={result('7')}
        ctx={ctxWith(catalog)}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await page.getByRole('button').click()
    await expect.element(page.getByText('7')).toBeVisible()
  })

  it('a declared tool with no cosmetics still renders its summary as the title', async () => {
    const catalog = registryCatalogView(declaredRegistry())

    mountView(() => (
      <MetaToolCard
        part={part('page_plain', {})}
        result={undefined}
        ctx={ctxWith(catalog)}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByText('do something the widget has no cosmetics for').first()).toBeVisible()
  })
})

describe('new tool projection', () => {
  function part(verb: string, args: Record<string, unknown> = {}): ToolCallPart {
    return {
      type: 'tool-call',
      id: 'p1',
      name: `page_${verb}`,
      arguments: JSON.stringify(args),
      input: args,
      state: 'complete',
    }
  }

  const shipTool = defineTool({
    name: 'page_ship',
    description: 'ship the page the user is looking at',
    inputSchema: z.object({note: z.string().optional()}),
    outputSchema: z.object({ok: z.literal(true)}),
    meta: {
      summary: 'ship the page the user is looking at',
      category: 'act',
      icon: 'pointer',
      label: {running: 'Shipping the page', done: 'Shipped the page'},
      hint: 'only once the user has approved the diff',
    },
  }).client()

  function registryWith(extra: AnyToolBuilder) {
    const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
    for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a built-in page tool'})
    registry.register(extra, {owner: 'a test registrant'})
    return registry
  }

  const ctx: ToolViewCtx = {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    addResult: () => {},
    catalog: registryCatalogView(registryWith(shipTool)),
  }

  it('a newly declared capability reaches the widget through its own declaration', async () => {
    const declared = registryWith(shipTool).catalog.get('page_ship')
    expect(declared.summary).toBe('ship the page the user is looking at')
    expect(declared.hint).toBe('only once the user has approved the diff')

    mountView(() => (
      <MetaToolCard
        part={part('ship', {note: 'after review'})}
        result={undefined}
        ctx={ctx}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByText('Shipped the page', {exact: false})).toBeVisible()
    expect(nowTitle(part('ship'), ctx.catalog)).toBe('Shipping the page')
  })

  it('the card and the running title read a built-in declaration through the default source', async () => {
    const declared = pageToolMetaOf('setattr')
    if (!declared?.label) throw new Error('page_setattr declares no label')

    mountView(() => (
      <MetaToolCard
        part={part('setattr', {selector: '#hero', attribute: 'hidden'})}
        result={undefined}
        ctx={ctx}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByText(`${declared.label.done} #hero`, {exact: true})).toBeVisible()
    expect(nowTitle(part('setattr'), ctx.catalog)).toBe(declared.label.running)
    expect(toolIconRender(declared.icon)).toBe(toolIconRender('edit'))
    expect(toolIconRender(declared.icon)).not.toBe(GENERIC_TOOL_ICON)
  })

  it('a declaration with no icon key falls back to the generic icon', () => {
    const plainTool = defineTool({
      name: 'page_plain',
      description: 'do something the widget has no icon for',
      inputSchema: z.object({}),
      outputSchema: z.object({ok: z.literal(true)}),
      meta: {summary: 'do something the widget has no icon for', category: 'act'},
    }).client()

    expect(registryWith(plainTool).catalog.get('page_plain').summary).toBe('do something the widget has no icon for')
    expect(toolIconRender(plainTool.meta?.icon)).toBe(GENERIC_TOOL_ICON)
  })
})

describe('page tool cards', () => {
  const ctx: ToolViewCtx = {
    apiBase: '',
    harnessId: 'test',
    sendMessage: () => {},
    addResult: () => {},
    catalog: registryCatalogView(builtinPageRegistry()),
  }

  function part(verb: string, input: Record<string, unknown>): ToolCallPart {
    return {
      type: 'tool-call',
      id: 'p1',
      name: `page_${verb}`,
      arguments: JSON.stringify(input),
      input,
      state: 'complete',
    }
  }

  it('titles a click with the declared label and promotes the selector', async () => {
    mountView(() => (
      <MetaToolCard
        part={part('click', {selector: '#submit'})}
        result={undefined}
        ctx={ctx}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByText('Clicked #submit')).toBeVisible()
  })

  it('titles a fill with the declared label and chips the typed value', async () => {
    mountView(() => (
      <MetaToolCard
        part={part('fill', {selector: '#email', value: 'jane@example.com'})}
        result={undefined}
        ctx={ctx}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await expect.element(page.getByText('Typed #email')).toBeVisible()
    await page.getByRole('button').click()
    await expect.element(page.getByText('jane@example.com')).toBeVisible()
  })

  it('titles a tree read verb', async () => {
    mountView(() => <MetaToolCard part={part('tree', {})} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />)

    await expect.element(page.getByText('Read the page tree')).toBeVisible()
  })

  it('titles a press with the declared label and chips the pressed key', async () => {
    mountView(() => (
      <MetaToolCard part={part('press', {key: 'Enter'})} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />
    ))

    await expect.element(page.getByText('Pressed')).toBeVisible()
    await page.getByRole('button').click()
    await expect.element(page.getByText('Enter')).toBeVisible()
  })

  it('shows the mirror affordance for a verb the page reflects back', async () => {
    mountView(() => (
      <MetaToolCard
        part={part('click', {selector: '#submit'})}
        result={undefined}
        ctx={ctx}
        addResult={INERT_ADD_RESULT}
      />
    ))

    await page.getByRole('button').click()
    await expect.element(page.getByText('shown on your page')).toBeVisible()
  })

  it('falls back to the bare tool name when the catalog declares nothing for it', async () => {
    mountView(() => (
      <MetaToolCard part={part('nosuchverb', {})} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />
    ))

    await expect.element(page.getByText('page_nosuchverb')).toBeVisible()
  })
})

describe('registry card declarations', () => {
  const catalog = registryCatalogView(builtinPageRegistry())
  const ctx: ToolViewCtx = {apiBase: '', harnessId: 'test', sendMessage: () => {}, addResult: () => {}, catalog}

  function part(
    verb: string,
    args: Record<string, unknown> = {},
    state: ToolCallPart['state'] = 'complete',
  ): ToolCallPart {
    return {type: 'tool-call', id: 'p1', name: `page_${verb}`, arguments: JSON.stringify(args), input: args, state}
  }

  it('every registry page tool declares a label and a non-generic icon', () => {
    for (const def of PAGE_TOOL_DEFS) {
      expect(def.meta?.label?.running, `${def.name} has no running label`).toBeTruthy()
      expect(def.meta?.label?.done, `${def.name} has no done label`).toBeTruthy()
      expect(toolIconRender(def.meta?.icon), `${def.name} renders the generic icon`).not.toBe(GENERIC_TOOL_ICON)
    }
  })

  it('the card titles every registry page tool from its declaration, never the generic fallback', async () => {
    for (const def of PAGE_TOOL_DEFS) {
      const verb = pageVerbOfTool(def.name)
      const done = def.meta?.label?.done
      const running = def.meta?.label?.running
      if (done === undefined || running === undefined) throw new Error(`${def.name} declares no label`)
      expect(nowTitle(part(verb, {}, 'input-streaming'), catalog), `${def.name} running title`).toBe(running)
      mountView(() => <MetaToolCard part={part(verb)} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />)
      await expect.element(page.getByText(done, {exact: true}).first()).toBeVisible()
      expect(document.body.textContent).not.toContain(def.name)
      cleanup()
    }
  })

  it('representative cards render their declared titles and icons for the record', async () => {
    const representatives: Array<{verb: string; args: Record<string, unknown>}> = [
      {verb: 'text', args: {selector: '#probe'}},
      {verb: 'click', args: {selector: '#press-btn'}},
      {verb: 'settext', args: {selector: '#title', value: 'Rewritten'}},
      {verb: 'locate', args: {selector: '#title'}},
      {verb: 'effect', args: {action: 'enable', effect: 'highlight'}},
    ]
    for (const {verb, args} of representatives) {
      const declared = PAGE_TOOL_DEFS.find((def) => def.name === `page_${verb}`)?.meta?.label
      if (!declared) throw new Error(`page_${verb} declares no label`)
      const selector = args['selector']
      const headline = typeof selector === 'string' ? `${declared.done} ${selector}` : declared.done
      mountView(() => (
        <MetaToolCard part={part(verb, args)} result={undefined} ctx={ctx} addResult={INERT_ADD_RESULT} />
      ))
      await expect.element(page.getByText(headline, {exact: true}).first()).toBeVisible()
      await page.screenshot({path: `__screenshots__/registry-card-declarations/page-${verb}.png`})
      cleanup()
    }
  })
})

describe('search matches', () => {
  describe('hiddenMatchSummary', () => {
    it('does not count a file whose matches are all visible', () => {
      const groups: SearchFileGroup[] = [
        {file: 'a.ts', matches: [{file: 'a.ts', line: 1, snippet: 'a'}]},
        {file: 'b.ts', matches: [{file: 'b.ts', line: 1, snippet: 'b'}]},
      ]
      const summary = hiddenMatchSummary(groups, 2)
      expect(summary.matches).toBe(1)
      expect(summary.files).toBe(1)
    })
  })
})

describe('tool row projections', () => {
  function call(name: string, input: Record<string, unknown>, state: ToolCallPart['state'] = 'complete'): ToolCallPart {
    return {type: 'tool-call', id: 'f1', name, arguments: JSON.stringify(input), input, state}
  }

  function result(content: string, state: ToolResultPart['state'] = 'complete'): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'f1', content, state}
  }

  function row(part: ToolCallPart, toolResult?: ToolResultPart) {
    return <ToolTraceRow part={part} result={toolResult} ctx={INERT_TOOL_CTX} tools={() => builtinToolCards} />
  }

  const BUILD_LOG = ['[build] step 19 finished', '[build] step 20 finished'].join('\n')

  const ANSI_LOG = '\u001b[32mPASS\u001b[0m src/app.test.ts'

  const PATCH = [
    '*** Begin Patch',
    '*** Update File: src/store/turn-rollup.ts',
    '@@',
    '-const previous = 1',
    '+const next = 2',
    '+const extra = 3',
    '*** End Patch',
  ].join('\n')

  it('projects a successful bash call as a passing bash row carrying its exit code', async () => {
    mountView(() => row(call('Bash', {command: 'pnpm test'}), result(JSON.stringify({stdout: 'ok', exitCode: 0}))))

    await expect.element(page.getByRole('img', {name: 'succeeded'})).toBeVisible()
    await expect.element(page.getByText('bash')).toBeVisible()
    await expect.element(page.getByRole('button', {name: /pnpm test/}).getByText('pnpm test')).toBeVisible()
    await expect.element(page.getByText('exit 0')).toBeVisible()
  })

  it('projects a nonzero bash exit as a failing row and frames the output as an error', async () => {
    mountView(() =>
      row(call('Bash', {command: 'pnpm test'}), result(JSON.stringify({stderr: '1 test failed', exitCode: 1}))),
    )

    await expect.element(page.getByRole('img', {name: 'failed'})).toBeVisible()
    await expect.element(page.getByText('exit 1')).toBeVisible()
    await expect.element(page.getByRole('group', {name: 'Error output'})).toBeVisible()
    await expect.element(page.getByText('1 test failed')).toBeVisible()
  })

  it('projects an apply_patch call as an edit row with its added and removed counts', async () => {
    mountView(() => row(call('apply_patch', {patchText: PATCH}), result('applied')))

    await expect.element(page.getByText('edit')).toBeVisible()
    await expect.element(page.getByText('turn-rollup.ts', {exact: false})).toBeVisible()
    await expect.element(page.getByText('+2 −1')).toBeVisible()
  })

  it('projects a Write call as a write row and an Edit call as an edit row', async () => {
    mountView(() => (
      <>
        {row(call('Write', {file_path: '/repo/src/new-file.ts', content: 'a\nb\nc'}), result('written'))}
        {row(call('Edit', {file_path: '/repo/src/old.ts', old_string: 'a', new_string: 'b'}), result('edited'))}
      </>
    ))

    await expect.element(page.getByText('write')).toBeVisible()
    await expect.element(page.getByText('new-file.ts', {exact: false})).toBeVisible()
    await expect.element(page.getByText('+3 −0')).toBeVisible()
    await expect.element(page.getByText('old.ts', {exact: false})).toBeVisible()
    await expect.element(page.getByText('+1 −1')).toBeVisible()
  })

  it('projects a Read call as a read row with the line count it returned', async () => {
    mountView(() => row(call('Read', {file_path: '/repo/src/app.tsx'}), result('one\ntwo\nthree')))

    await expect.element(page.getByText('read')).toBeVisible()
    await expect.element(page.getByText('…/src/app.tsx')).toBeVisible()
    await expect.element(page.getByText('3 lines')).toBeVisible()
  })

  it('projects a Grep call as a search row over its pattern', async () => {
    mountView(() => row(call('Grep', {pattern: 'useChat'}), result('src/a.ts:1\nsrc/b.ts:4')))

    await expect.element(page.getByText('search')).toBeVisible()
    await expect.element(page.getByText('useChat')).toBeVisible()
  })

  it('projects a running tool call as a live row', async () => {
    mountView(() => row(call('Bash', {command: 'pnpm build'}, 'input-complete'), undefined))

    await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
    await expect.element(page.getByText('pnpm build')).toBeVisible()
  })

  it('renders plain bash trace output through the code highlighter instead of as flat text', async () => {
    mountView(() =>
      row(call('Bash', {command: 'pnpm build'}), result(JSON.stringify({stdout: BUILD_LOG, exitCode: 0}))),
    )

    await expect.element(page.getByRole('group', {name: 'Output'})).toBeVisible()
    await expect.element(page.getByText('[build] step 20 finished')).toBeVisible()
    expect(document.querySelector('diffs-container')).not.toBeNull()
  })

  it('renders ansi bash trace output through the ansi grammar so escape codes never leak as text', async () => {
    mountView(() => row(call('Bash', {command: 'pnpm test'}), result(JSON.stringify({stdout: ANSI_LOG, exitCode: 0}))))

    await expect.element(page.getByRole('group', {name: 'Output'})).toBeVisible()
    await expect.element(page.getByText('PASS src/app.test.ts')).toBeVisible()
  })
})
