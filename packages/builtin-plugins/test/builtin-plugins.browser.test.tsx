import {Effect} from 'effect'
import {afterAll, beforeAll, describe, expect, it, onTestFinished, test, vi} from 'vitest'
import {cdp, page, server, userEvent} from 'vitest/browser'
import {cleanup, render} from '@solidjs/testing-library'
import {createSignal, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {PAGE_SESSION_GROUP_KEY, type GroupNodeGroup, type PageSessionThinkingPart} from '@conciv/ui-kit-chat'
import {EFFECTS_SURFACE_ATTR, PLUGIN_OVERLAY_ATTR} from '@conciv/protocol/page-types'
import {StoryTool, storyCall, storyFailedCall} from '../src/page/cards/story.fixtures.js'
import {pageToolCards} from '../src/page/cards/page-tool-cards.js'
import {SessionCard} from '../src/page/cards/session-card.js'
import {GrabCard} from '../src/page/cards/grab-card.js'
import {GrabSnapshotFrame} from '../src/page/cards/grab-snapshot-frame.js'
import {mountAttachment} from './fixtures/attachment-harness.js'
import {GRAB_FILE_NAME, GRAB_MIME} from '@conciv/grab/grab-attachment'
import {getReactGrabAdapter, installReactBridge, MASKED_VALUE, picking} from '@conciv/page'
import {Menu} from '@conciv/ui-kit-system'
import tokens from '@conciv/ui-kit-system/tokens.css?inline'
import utilities from 'virtual:uno.css?inline'
import {z} from 'zod'
import {CHAT_FONTS} from '@conciv/ui-kit-chat/theme/fonts'
import {createElement, Fragment} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {createRootRoute, createRoute, createRouter, RouterProvider} from '@tanstack/react-router'
import {Editor} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {makePageOperations, type PageEffect, type PageOperations} from '../src/page/operations.js'
import {Command, Operations, Outcome, PAGE_NAMESPACE, SHORT_MAX, Tab, type PageCommand} from '@conciv/plugin-page/rpc'
import {readTab, reportChanges} from '../src/page/tab.js'
import {watchHotUpdates, type HotSurface} from '../src/page/hmr.js'
import {endTask, mountSimulator, startTask} from '../src/page/simulator.js'
import {aimCursor, CursorLook, dropCursor, pageAt, windowAt} from '../src/page/agent-cursor.js'
import {ControlledForm, FixtureApp} from './fixtures/react-app.js'
import {makeReactTree, pageMembers} from '../src/page/contracts.js'
import {makeHighlight} from '../src/page/highlight.js'
import {openSource, type SourceOpener} from '../src/page/open-source.js'
import {CardChromeProvider, ToolDisplay} from '@conciv/ui-kit-chat/tools'
import type {ChatPart, ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {ReactFiber} from '@conciv/plugin/experimental/page'
import type {ToolProps} from '@conciv/plugin/experimental'
import {tanstackCards} from '../src/tanstack/cards.js'
import {recorderCards} from '../src/recorder/cards.js'

const inFirefox = server.browser === 'firefox'

const noEffects: readonly PageEffect[] = []

const JsonRecord = z.record(z.string(), z.unknown())

function pageCommand(input: unknown): PageCommand {
  const parsed = Command.parse(input)
  const {action} = parsed
  if (action.type === 'operation') throw new Error('expected one of the page plugin own actions')
  return {...parsed, action}
}

function command(verb: string, input: Record<string, unknown>, agentId = 'test-agent'): PageCommand {
  return pageCommand({action: {type: verb, ...input}, agentId, timeoutMs: 5000})
}

function readValue(outcome: Outcome, verb: string): Record<string, unknown> {
  if (outcome.type === 'failure')
    throw new Error(`expected a result for ${verb}, got ${outcome.code}: ${outcome.message}`)
  return JsonRecord.parse(outcome.result.value)
}

function readFailure(outcome: Outcome, verb: string) {
  if (outcome.type === 'success') throw new Error(`expected a failure for ${verb}, got a result`)
  return {
    code: outcome.code,
    message: outcome.message,
    ...(outcome.raised === undefined ? {} : {raised: outcome.raised}),
  }
}

const ShotValue = z.object({width: z.number(), height: z.number(), warnings: z.array(z.string()).optional()})

function readScreenshot(outcome: Outcome) {
  if (outcome.type === 'failure') throw new Error(`expected a screenshot, got ${outcome.code}: ${outcome.message}`)
  const [file] = outcome.result.files
  if (file === undefined) throw new Error('the screenshot carried no file')
  expect({name: file.name, mime: file.mime}).toEqual({name: 'screenshot.webp', mime: 'image/webp'})
  return {...ShotValue.parse(outcome.result.value), image: file.data}
}

function decodeImage(image: Uint8Array<ArrayBuffer>): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([image], {type: 'image/webp'}))
}

describe.skipIf(inFirefox)('effects', () => {
  function installBanner(): PageEffect {
    let banner: HTMLElement | null = null
    return {
      name: 'banner',
      description: 'shows the fixture banner',
      enabled: () => banner !== null,
      set: (enabled) => {
        if (enabled === (banner !== null)) return
        if (!enabled) {
          banner?.remove()
          banner = null
          return
        }
        banner = document.createElement('div')
        banner.setAttribute('role', 'note')
        banner.textContent = 'fixture banner shown'
        document.body.appendChild(banner)
      },
    }
  }

  let driver: PageOperations

  const banner = () => page.getByText('fixture banner shown')

  const effectResult = async (input: Record<string, unknown>) =>
    readValue(await driver.execute(command('effect', input)), 'effect')

  const effectFailure = async (input: Record<string, unknown>) =>
    readFailure(await driver.execute(command('effect', input)), 'effect')

  beforeAll(() => {
    driver = makePageOperations([installBanner()])
  })

  afterAll(() => {
    driver.dispose()
  })

  describe('the page_effect verb drives registered host effects', () => {
    it('lists what exists exactly once per name, with its current state', async () => {
      expect(await effectResult({action: 'list'})).toEqual({
        effects: [{name: 'banner', description: 'shows the fixture banner', enabled: false}],
      })
    })

    it('enable, toggle, start and stop visibly change the page, and report tells the truth', async () => {
      expect(await effectResult({action: 'enable', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
      await expect.element(banner()).toBeVisible()
      expect(await effectResult({action: 'report', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
      expect(await effectResult({action: 'toggle', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
      await expect.element(banner()).not.toBeInTheDocument()
      expect(await effectResult({action: 'start', effect: 'banner'})).toEqual({effect: 'banner', enabled: true})
      await expect.element(banner()).toBeVisible()
      expect(await effectResult({action: 'stop', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
      await expect.element(banner()).not.toBeInTheDocument()
      expect(await effectResult({action: 'report', effect: 'banner'})).toEqual({effect: 'banner', enabled: false})
    })

    it('an unknown effect name fails with the declared error naming what exists', async () => {
      const failure = await effectFailure({action: 'enable', effect: 'confetti'})
      expect(failure.raised?.code).toBe('UNKNOWN_EFFECT')
      expect(failure.message).toContain('confetti')
      expect(failure.message).toContain('banner')
    })

    it('a driving action without an effect name, or list with one, fails as invalid args', async () => {
      for (const input of [{action: 'enable'}, {action: 'list', effect: 'banner'}]) {
        const failure = await effectFailure(input)
        expect(failure.code).toBe('invalid-args')
        expect(failure.message).toContain('list')
      }
    })
  })
})

describe.skipIf(inFirefox)('page tools', () => {
  let container: HTMLElement
  let reactRoot: Root
  let driver: PageOperations

  const leaf = () => page.getByRole('button', {name: /^A:/})
  const counter = () => page.getByRole('status')
  const formState = () => page.getByText(/^subscribed:/)

  const findDeclaredOutput = (verb: string) => {
    const output = Operations.find((candidate) => candidate.name === verb)?.output
    if (!output) throw new Error(`no page operation declares an output for ${verb}`)
    return output
  }

  const runForResult = async (verb: string, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const result = readValue(await driver.execute(command(verb, input)), verb)
    expect(findDeclaredOutput(verb).parse(result)).toEqual(result)
    return result
  }

  const runForFailure = async (verb: string, input: Record<string, unknown> = {}) =>
    readFailure(await driver.execute(command(verb, input)), verb)

  beforeAll(async () => {
    installReactBridge()
    container = document.createElement('div')
    container.innerHTML = `
    <input id="field" type="text" />
    <input id="secret" type="password" />
    <form id="frm"><button id="inner" type="button">inner</button></form>
    <p id="prose">hello page</p>
    <span id="failprobe">probe</span>
    <select id="sel"><option value="a">A</option><option value="b">B</option><option value="fs">Full Stack</option></select>
    <input id="locked" type="checkbox" disabled />
    <input id="qty" type="number" />
    <input id="stuck" type="checkbox" />
    <button id="hovbtn">hover me</button>
    <div id="htmlhost"><i>old</i></div>
  `
    document.body.appendChild(container)
    const mount = document.createElement('div')
    container.appendChild(mount)
    reactRoot = createRoot(mount)
    reactRoot.render(createElement(Fragment, null, createElement(FixtureApp), createElement(ControlledForm)))
    driver = makePageOperations(noEffects)
    await vi.waitFor(() => {
      if (!document.querySelector('[data-fixture="leaf"]')) throw new Error('fixture not rendered yet')
    })
  })

  afterAll(() => {
    reactRoot.unmount()
    container.remove()
    dropCursor('test-agent')
  })

  describe('target resolution', () => {
    it('explains each way a target can be missing, as an invalid-args failure', async () => {
      const missing = [
        {input: {ref: 'v999'}, message: 'stale ref v999; re-run page snapshot'},
        {input: {name: 'Nope'}, message: 'no React component named "Nope" found'},
        {input: {selector: '#missing'}, message: 'no element for selector #missing'},
        {input: {}, message: 'no target: pass ref, selector, or name'},
      ]
      for (const {input, message} of missing) {
        expect(await runForFailure('click', input)).toEqual({code: 'invalid-args', message})
      }
    })
  })

  describe('dom verbs', () => {
    it('clicks through React handlers', async () => {
      expect(await runForResult('click', {selector: '[data-fixture="leaf"]'})).toEqual({ok: true})
      await expect.element(leaf()).toMatchTextContent(':1:')
    })

    it('fills form fields with native events and masks a password value in the results', async () => {
      expect(await runForResult('fill', {selector: '#field', value: 'typed'})).toEqual({ok: true, value: 'typed'})
      expect(await runForResult('value', {selector: '#field'})).toEqual({value: 'typed'})
      expect(await runForFailure('fill', {selector: '#prose', value: 'x'})).toEqual({
        code: 'invalid-args',
        message: 'That element is not a text field.',
      })
      expect(await runForResult('fill', {selector: '#secret', value: 'hunter2'})).toEqual({ok: true, value: '***'})
      expect(await runForResult('value', {selector: '#secret'})).toEqual({value: '***'})
    })

    it('masks a password value attribute in dom and attr reads as value reads do', async () => {
      await runForResult('setattr', {selector: '#secret', attribute: 'value', value: 'hunter2'})
      expect(await runForResult('attr', {selector: '#secret', attribute: 'value'})).toEqual({value: MASKED_VALUE})
      expect(await runForResult('attr', {selector: '#field', attribute: 'type'})).toEqual({value: 'text'})
      const dom = await runForResult('dom', {selector: '#secret'})
      expect(dom.html).toContain(`value="${MASKED_VALUE}"`)
      expect(dom.html).not.toContain('hunter2')
      expect(document.querySelector('#secret')?.getAttribute('value')).toBe('hunter2')
      await runForResult('removeattr', {selector: '#secret', attribute: 'value'})
    })

    it('drives React-controlled checkboxes and radios so component state follows', async () => {
      expect(await runForResult('check', {selector: '#subscribe'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('subscribed: true')

      expect(await runForResult('check', {selector: '#subscribe'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('subscribed: true')

      expect(await runForResult('uncheck', {selector: '#subscribe'})).toEqual({ok: true, checked: false})
      await expect.element(formState()).toMatchTextContent('subscribed: false')

      expect(await runForResult('check', {selector: '#plan-pro'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('plan: pro')

      expect(await runForFailure('uncheck', {selector: '#plan-pro'})).toEqual({
        code: 'invalid-args',
        message: 'A radio is unchecked by checking another one.',
      })
      await expect.element(formState()).toMatchTextContent('plan: pro')

      expect(await runForResult('check', {selector: '#plan-free'})).toEqual({ok: true, checked: true})
      await expect.element(formState()).toMatchTextContent('plan: free')
    })

    it('mutates attributes, classes, styles, text, and structure', async () => {
      await runForResult('setattr', {selector: '#prose', attribute: 'data-mark', value: 'on'})
      expect(document.querySelector('#prose')?.getAttribute('data-mark')).toBe('on')
      expect(() => command('setattr', {selector: '#prose', value: 'on'})).toThrow(/attribute/)
      await runForResult('removeattr', {selector: '#prose', attribute: 'data-mark'})
      expect(document.querySelector('#prose')?.hasAttribute('data-mark')).toBe(false)
      await runForResult('addclass', {selector: '#prose', class: 'hot'})
      expect(document.querySelector('#prose')?.classList.contains('hot')).toBe(true)
      await runForResult('removeclass', {selector: '#prose', class: 'hot'})
      expect(document.querySelector('#prose')?.classList.contains('hot')).toBe(false)
      await runForResult('setstyle', {selector: '#prose', prop: 'color', value: 'red'})
      expect(await runForResult('attr', {selector: '#prose', attribute: 'style'})).toEqual({value: 'color: red;'})
      await runForResult('settext', {selector: '#prose', text: 'rewritten'})
      expect(document.querySelector('#prose')?.textContent).toBe('rewritten')
      await runForResult('insert', {selector: '#prose', html: '<em id="added">x</em>', position: 'after'})
      expect(document.querySelector('#added')).not.toBeNull()
      await runForResult('remove', {selector: '#added'})
      expect(document.querySelector('#added')).toBeNull()
    })

    it('reports route, existence, query matches, markup and attributes', async () => {
      document.title = 'Settings'
      expect(await runForResult('route')).toMatchObject({
        pathname: location.pathname,
        title: 'Settings',
        state: 'visible',
      })
      expect(await runForResult('exists', {selector: '#frm'})).toEqual({exists: true, count: 1})
      const query = await runForResult('query', {selector: 'input'})
      expect(query.count).toBe(8)
      expect(await runForResult('dom', {selector: '#inner'})).toEqual({
        html: '<button id="inner" type="button">inner</button>',
      })
      expect(await runForResult('attr', {selector: '#inner', attribute: 'type'})).toEqual({value: 'button'})
      expect(await runForResult('attr', {selector: '#inner', attribute: 'data-missing'})).toEqual({value: null})
    })

    it('waits for visibility and times out with an explanation', async () => {
      expect(await runForResult('wait', {selector: '#prose', state: 'visible', timeout: 500})).toEqual({
        ok: true,
        state: 'visible',
      })
      expect(await runForFailure('wait', {selector: '#missing', state: 'visible', timeout: 150})).toEqual({
        code: 'handler-error',
        message: 'wait timed out for #missing (visible)',
      })
      const cancel = new AbortController()
      const waiting = driver.execute(
        command('wait', {selector: '#late', state: 'visible', timeout: 60_000}),
        cancel.signal,
      )
      cancel.abort()
      const late = document.createElement('p')
      late.id = 'late'
      late.textContent = 'late'
      container.append(late)
      onTestFinished(() => late.remove())
      expect(await waiting).toMatchObject({type: 'failure'})
    })

    it('returns the value of a bare expression and still runs a statement body', async () => {
      expect(await runForResult('eval', {code: '2 + 3'})).toEqual({result: 5})
      expect(await runForResult('eval', {code: 'document.querySelector("#frm").tagName'})).toEqual({result: 'FORM'})
      expect(await runForResult('eval', {code: 'const a = 1; return a + 1'})).toEqual({result: 2})
      const element = await runForResult('eval', {code: 'return document.querySelector("#frm")'})
      expect(element.result).toMatchObject({tagName: 'form'})
    })

    it('refuses a result over 512000 JSON characters instead of returning it', async () => {
      const crowd = document.createElement('div')
      crowd.id = 'crowd'
      crowd.append(
        ...Array.from({length: 6000}, (_, index) => {
          const button = document.createElement('button')
          button.textContent = `crowded button ${index} with a label long enough to fill the snapshot quickly`
          return button
        }),
      )
      document.body.appendChild(crowd)
      onTestFinished(() => crowd.remove())
      expect(await runForFailure('snapshot', {selector: '#crowd'})).toEqual({
        code: 'handler-error',
        message:
          'Browser result exceeds 512000 JSON characters. Request fewer entries, reduce snapshot depth, or return only selected fields from the evaluation script. Repeating the same request will not reduce its output.',
      })
      expect(await runForResult('snapshot', {selector: '#prose'})).toMatchObject({nodes: expect.any(Array)})
    })

    it('clamps a long handler error to the reply bound so the reply still parses', async () => {
      const long = `validation failed: ${'x'.repeat(SHORT_MAX * 2)}`
      const outcome = await driver.execute(command('eval', {code: `throw new Error(${JSON.stringify(long)})`}))
      expect(Outcome.safeParse(outcome).success).toBe(true)
      const {code, message} = readFailure(outcome, 'eval')
      expect(code).toBe('handler-error')
      expect(message).toHaveLength(SHORT_MAX)
      expect(long.startsWith(message)).toBe(true)
    })

    it('injects css stylesheets', async () => {
      expect(await runForResult('css', {text: '#prose{letter-spacing:3px}'})).toEqual({ok: true})
      expect(document.querySelector('style[data-vibe-css]')?.textContent).toContain('letter-spacing')
    })
  })

  describe('react verbs through the dispatcher', () => {
    it('finds, locates, walks and inspects a component and navigates into its props by path', async () => {
      const found = await runForResult('find', {name: 'Leaf'})
      expect(found).toEqual({matches: [{ref: expect.any(String), component: 'Leaf'}], total: 1})
      const [match] = Array.isArray(found.matches) ? found.matches : []
      const located = await runForResult('locate', {ref: match.ref})
      expect(located).toMatchObject({component: 'Leaf', stack: expect.arrayContaining(['Leaf', 'Branch'])})
      expect(await runForResult('tree', {selector: '[data-fixture="root"]'})).toMatchObject({
        nodes: [{component: 'Branch', children: [{component: 'Leaf'}, {component: 'Counter'}]}],
        truncated: 0,
      })
      const full = await runForResult('inspect', {name: 'Leaf'})
      expect(full.component).toBe('Leaf')
      const byPath = await runForResult('inspect', {name: 'Leaf', path: 'props.label'})
      expect(byPath.value).toBe('A')
      expect(await runForFailure('inspect', {name: 'Leaf', path: 'props.missing.deep'})).toEqual({
        code: 'invalid-args',
        message: 'path not found: props.missing.deep',
      })
    })

    it('overrides props and validates its inputs', async () => {
      expect(() => command('override', {name: 'Counter'})).toThrow(/target/)
      expect(await runForFailure('override', {name: 'Counter', target: 'state', json: '{nope'})).toEqual({
        code: 'invalid-args',
        message: '--json is not valid JSON: {nope',
      })
      const set = await runForResult('override', {name: 'Counter', target: 'state', path: 'value', json: '77'})
      expect(set.ok).toBe(true)
      await expect.element(counter()).toMatchTextContent('77')
    })

    it('tracks renders between start and stop', async () => {
      await runForResult('track', {action: 'start'})
      await runForResult('click', {name: 'Leaf'})
      await expect.element(leaf()).toMatchTextContent(':2:')
      const report = await runForResult('track', {action: 'report'})
      const components = Array.isArray(report.components) ? report.components : []
      expect(
        components.some(
          (entry) => typeof entry === 'object' && entry !== null && 'component' in entry && entry.component === 'Leaf',
        ),
      ).toBe(true)
      const stopped = await runForResult('track', {action: 'stop'})
      expect(stopped.tracking).toBe(false)
    })
  })

  describe('act and edit-live verbs', () => {
    it('selects by value or visible label with native change events, and a missing option changes nothing', async () => {
      const changes: string[] = []
      document.querySelector('#sel')?.addEventListener('change', (event) => {
        const el = event.target
        if (el instanceof HTMLSelectElement) changes.push(el.value)
      })
      expect(await runForResult('select', {selector: '#sel', value: 'b'})).toEqual({ok: true, value: 'b'})
      expect(changes).toEqual(['b'])
      expect(await runForResult('value', {selector: '#sel'})).toEqual({value: 'b'})
      expect(await runForResult('select', {selector: '#sel', value: 'Full Stack'})).toEqual({ok: true, value: 'fs'})
      expect(await runForFailure('select', {selector: '#sel', value: 'fullstack'})).toEqual({
        code: 'invalid-args',
        message: 'No option "fullstack"; options: a "A", b "B", fs "Full Stack".',
      })
      expect(await runForResult('value', {selector: '#sel'})).toEqual({value: 'fs'})
    })

    it('fills a form field by field in order and stops at the first field that refuses', async () => {
      expect(
        await runForResult('fill_form', {
          fields: [
            {selector: '#field', type: 'text', value: 'from the form'},
            {selector: '#sel', type: 'select', value: 'A'},
            {selector: '#subscribe', type: 'check', checked: true},
          ],
        }),
      ).toEqual({ok: true})
      expect(await runForResult('value', {selector: '#field'})).toEqual({value: 'from the form'})
      expect(await runForResult('value', {selector: '#sel'})).toEqual({value: 'a'})
      await expect.element(formState()).toMatchTextContent('subscribed: true')
      expect(
        await runForFailure('fill_form', {
          fields: [
            {selector: '#field', type: 'text', value: 'second pass'},
            {selector: '#prose', type: 'text', value: 'x'},
            {selector: '#subscribe', type: 'check', checked: false},
          ],
        }),
      ).toEqual({code: 'invalid-args', message: 'That element is not a text field.'})
      expect(await runForResult('value', {selector: '#field'})).toEqual({value: 'second pass'})
      await expect.element(formState()).toMatchTextContent('subscribed: true')
      const later = Object.assign(document.createElement('input'), {id: 'later', type: 'text'})
      container.appendChild(later)
      onTestFinished(() => later.remove())
      const stop = new AbortController()
      document.querySelector('#field')?.addEventListener('input', () => stop.abort(new Error('the turn was stopped')), {
        once: true,
      })
      const fields = [
        {selector: '#field', type: 'text', value: 'before the stop'},
        {selector: '#later', type: 'text', value: 'after the stop'},
      ]
      expect(readFailure(await driver.execute(command('fill_form', {fields}), stop.signal), 'fill_form')).toEqual({
        code: 'handler-error',
        message: 'the turn was stopped',
      })
      expect(await runForResult('value', {selector: '#field'})).toEqual({value: 'before the stop'})
      expect(await runForResult('value', {selector: '#later'})).toEqual({value: ''})
    })

    it('fails instead of reporting ok when a field or box refuses the change', async () => {
      document.querySelector('#stuck')?.addEventListener('click', (event) => event.preventDefault())
      expect(await runForFailure('fill', {selector: '#qty', value: 'many'})).toEqual({
        code: 'invalid-args',
        message: 'The field rejected "many" and stayed empty.',
      })
      const pin = Object.assign(document.createElement('input'), {id: 'pin', type: 'password'})
      pin.addEventListener('input', () => (pin.value = ''))
      container.appendChild(pin)
      const refused = await runForFailure('fill', {selector: '#pin', value: 'hunter2-secret'})
      pin.remove()
      expect(refused).toEqual({code: 'invalid-args', message: 'The field rejected *** and stayed empty.'})
      expect(JSON.stringify(refused)).not.toContain('hunter2-secret')
      expect(await runForFailure('check', {selector: '#locked'})).toEqual({
        code: 'invalid-args',
        message: 'That element is disabled.',
      })
      expect(await runForFailure('check', {selector: '#stuck'})).toEqual({
        code: 'invalid-args',
        message: 'The box is still unchecked; the page prevented the change.',
      })
    })

    it('submits the form owning the target without navigating', async () => {
      const submitted: string[] = []
      document.querySelector('#frm')?.addEventListener('submit', (event) => {
        event.preventDefault()
        submitted.push('submitted')
      })
      expect(await runForResult('submit', {selector: '#inner'})).toEqual({ok: true})
      expect(submitted).toEqual(['submitted'])
    })

    it('presses keys so the page shortcuts a user would trigger fire', async () => {
      const log = document.createElement('p')
      const record = (what: string): void => {
        log.textContent = [log.textContent, what].filter(Boolean).join(', ')
      }
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'k' && (event.metaKey || event.ctrlKey)) record('opened palette')
        if (event.key === ' ' && event.target === document.body) record('played')
        if (event.key === 'a' && !event.shiftKey && event.target === document.body) record('archived')
      }
      const onFieldKeyUp = (event: KeyboardEvent): void => {
        if (event.key === 'Enter') record('searched')
      }
      container.appendChild(log)
      document.addEventListener('keydown', onKeyDown)
      document.querySelector<HTMLInputElement>('#field')?.addEventListener('keyup', onFieldKeyUp)
      onTestFinished(() => {
        log.remove()
        document.removeEventListener('keydown', onKeyDown)
        document.querySelector<HTMLInputElement>('#field')?.removeEventListener('keyup', onFieldKeyUp)
      })
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      for (const key of ['Mod+k', ' ', 'a']) expect(await runForResult('press', {key})).toEqual({ok: true})
      expect(await runForResult('press', {selector: '#field', key: 'Enter'})).toEqual({ok: true})
      await expect.element(page.getByText('opened palette, played, archived, searched')).toBeVisible()
    })

    it('reaches into open shadow roots by selector, but never into the widget own shadow root', async () => {
      const shadowButton = (text: string, hostAttribute: string): HTMLButtonElement => {
        const host = document.createElement('div')
        host.setAttribute(hostAttribute, '')
        const button = Object.assign(document.createElement('button'), {
          id: text.replaceAll(' ', '-'),
          name: 'save',
          textContent: text,
        })
        host.attachShadow({mode: 'open'}).appendChild(button)
        container.appendChild(host)
        onTestFinished(() => host.remove())
        return button
      }
      const inShadow = shadowButton('in the shadow', 'data-web-component')
      inShadow.addEventListener('click', () => (inShadow.textContent = 'clicked in the shadow'))
      shadowButton('widget button', 'data-conciv-root')
      expect(await runForResult('exists', {selector: '#in-the-shadow'})).toEqual({exists: true, count: 1})
      expect(await runForResult('click', {selector: '#in-the-shadow'})).toEqual({ok: true})
      const snapshot = await runForResult('snapshot')
      const names = (Array.isArray(snapshot.nodes) ? snapshot.nodes : []).flatMap((node) =>
        typeof node === 'object' && node !== null && 'name' in node ? [node.name] : [],
      )
      expect(names).toContain('clicked in the shadow')
      expect(names).not.toContain('widget button')
      expect(await runForResult('exists', {selector: '#widget-button'})).toEqual({exists: false, count: 0})
      const inPage = Object.assign(document.createElement('button'), {name: 'save', textContent: 'save in the page'})
      container.appendChild(inPage)
      onTestFinished(() => inPage.remove())
      expect(await runForResult('query', {selector: 'button[name="save"]'})).toMatchObject({count: 2})
    })

    it('hovers with bubbling mouseover and mouseenter', async () => {
      const seen: string[] = []
      document.querySelector('#hovbtn')?.addEventListener('mouseover', () => seen.push('over'))
      document.querySelector('#hovbtn')?.addEventListener('mouseenter', () => seen.push('enter'))
      expect(await runForResult('hover', {selector: '#hovbtn'})).toEqual({ok: true})
      expect(seen).toEqual(['over', 'enter'])
    })

    it('scrolls a far-away element into view', async () => {
      const spacer = document.createElement('div')
      spacer.style.height = '3000px'
      const landmark = document.createElement('p')
      landmark.id = 'far-down'
      landmark.textContent = 'down here'
      document.body.append(spacer, landmark)
      expect(window.scrollY).toBe(0)
      expect(await runForResult('scroll', {selector: '#far-down'})).toEqual({ok: true})
      await expect.element(page.getByText('down here')).toBeInViewport()
      window.scrollTo(0, 0)
      spacer.remove()
      landmark.remove()
    })

    it('replaces inner HTML with sethtml', async () => {
      expect(await runForResult('sethtml', {selector: '#htmlhost', html: '<em id="fresh">new</em>'})).toEqual({
        ok: true,
      })
      expect(document.querySelector('#htmlhost')?.innerHTML).toBe('<em id="fresh">new</em>')
    })
  })

  describe('actions read the page back after its next turn', () => {
    it('reports a change the app undoes in a microtask or a queued task as refused, and a kept change as made', async () => {
      const host = document.createElement('div')
      host.innerHTML = `
        <label>Microtask name <input id="microtask-name" type="text" /></label>
        <label>Task name <input id="task-name" type="text" /></label>
        <label><input id="microtask-box" type="checkbox" /> Microtask box</label>
        <select id="microtask-plan" aria-label="Microtask plan"><option value="free">Free</option><option value="pro">Pro</option></select>
        <label>Plain name <input id="plain-name" type="text" /></label>
        <label><input id="plain-box" type="checkbox" /> Plain box</label>
      `
      document.body.append(host)
      onTestFinished(() => host.remove())
      const microtaskName = host.querySelector('#microtask-name')
      const taskName = host.querySelector('#task-name')
      const microtaskBox = host.querySelector('#microtask-box')
      const microtaskPlan = host.querySelector('#microtask-plan')
      if (!(microtaskName instanceof HTMLInputElement)) throw new Error('microtask name input missing')
      if (!(taskName instanceof HTMLInputElement)) throw new Error('task name input missing')
      if (!(microtaskBox instanceof HTMLInputElement)) throw new Error('microtask box missing')
      if (!(microtaskPlan instanceof HTMLSelectElement)) throw new Error('microtask plan missing')
      microtaskName.addEventListener('input', () => queueMicrotask(() => (microtaskName.value = '')))
      taskName.addEventListener('input', () => {
        const channel = new MessageChannel()
        channel.port1.addEventListener(
          'message',
          () => {
            taskName.value = ''
            channel.port1.close()
          },
          {once: true},
        )
        channel.port1.start()
        channel.port2.postMessage(null)
        channel.port2.close()
      })
      microtaskBox.addEventListener('change', () => queueMicrotask(() => (microtaskBox.checked = false)))
      microtaskPlan.addEventListener('change', () => queueMicrotask(() => (microtaskPlan.value = 'free')))

      expect(await runForFailure('fill', {selector: '#microtask-name', value: 'Ada'})).toEqual({
        code: 'invalid-args',
        message: 'The field rejected "Ada" and stayed empty.',
      })
      await expect.element(page.getByRole('textbox', {name: 'Microtask name'})).toHaveValue('')

      expect(await runForFailure('fill', {selector: '#task-name', value: 'Ada'})).toEqual({
        code: 'invalid-args',
        message: 'The field rejected "Ada" and stayed empty.',
      })
      await expect.element(page.getByRole('textbox', {name: 'Task name'})).toHaveValue('')

      expect(await runForFailure('check', {selector: '#microtask-box'})).toEqual({
        code: 'invalid-args',
        message: 'The box is still unchecked; the page prevented the change.',
      })
      await expect.element(page.getByRole('checkbox', {name: 'Microtask box'})).not.toBeChecked()

      expect(await runForResult('select', {selector: '#microtask-plan', value: 'pro'})).toEqual({
        ok: true,
        value: 'free',
      })
      await expect.element(page.getByRole('combobox', {name: 'Microtask plan'})).toHaveValue('free')

      expect(await runForResult('fill', {selector: '#plain-name', value: 'Ada'})).toEqual({ok: true, value: 'Ada'})
      await expect.element(page.getByRole('textbox', {name: 'Plain name'})).toHaveValue('Ada')

      expect(await runForResult('check', {selector: '#plain-box'})).toEqual({ok: true, checked: true})
      await expect.element(page.getByRole('checkbox', {name: 'Plain box'})).toBeChecked()
    })
  })

  describe('rich-text editors', () => {
    const mountEditors = (html: string): HTMLElement => {
      const host = document.createElement('div')
      host.innerHTML = html
      document.body.append(host)
      onTestFinished(() => host.remove())
      return host
    }

    it('fills a plain contenteditable through a target nested inside it, and a plaintext-only editor', async () => {
      mountEditors(`
        <div id="notes" contenteditable="true" role="textbox" aria-label="Notes"><p id="notes-line">old note</p></div>
        <div id="plain" contenteditable="plaintext-only" role="textbox" aria-label="Plain notes">old</div>
      `)
      expect(await runForResult('fill', {selector: '#notes-line', value: 'Hello editor'})).toEqual({
        ok: true,
        value: 'Hello editor',
      })
      await expect.element(page.getByRole('textbox', {name: 'Notes'})).toMatchTextContent(/^Hello editor$/)
      expect(await runForResult('fill', {selector: '#plain', value: 'Plain text'})).toEqual({
        ok: true,
        value: 'Plain text',
      })
      await expect.element(page.getByRole('textbox', {name: 'Plain notes'})).toMatchTextContent(/^Plain text$/)
    })

    it('falls back to editing commands when the editor cancels synthetic beforeinput', async () => {
      const host = mountEditors(
        `<div id="guarded" contenteditable="true" role="textbox" aria-label="Guarded">draft</div>`,
      )
      host.querySelector('#guarded')?.addEventListener('beforeinput', (event) => {
        if (!event.isTrusted) event.preventDefault()
      })
      expect(await runForResult('fill', {selector: '#guarded', value: 'Typed anyway'})).toEqual({
        ok: true,
        value: 'Typed anyway',
      })
      await expect.element(page.getByRole('textbox', {name: 'Guarded'})).toMatchTextContent(/^Typed anyway$/)
    })

    it('refuses read-only editors', async () => {
      mountEditors(`
        <div id="frozen" contenteditable="false" role="textbox" aria-label="Frozen">fixed</div>
        <div id="aria-frozen" contenteditable="true" aria-readonly="true" role="textbox" aria-label="Aria frozen">fixed</div>
      `)
      const readOnly = {code: 'invalid-args', message: 'That field is read-only.'}
      expect(await runForFailure('fill', {selector: '#frozen', value: 'x'})).toEqual(readOnly)
      expect(await runForFailure('fill', {selector: '#aria-frozen', value: 'x'})).toEqual(readOnly)
      await expect.element(page.getByRole('textbox', {name: 'Frozen'})).toMatchTextContent(/^fixed$/)
      await expect.element(page.getByRole('textbox', {name: 'Aria frozen'})).toMatchTextContent(/^fixed$/)
    })

    it('reports an editor that ignores every way of typing, masking sensitive values', async () => {
      const host = mountEditors(`
        <div id="stubborn" contenteditable="true" role="textbox" aria-label="Stubborn">locked</div>
        <div id="stubborn-card" contenteditable="true" autocomplete="cc-number" role="textbox" aria-label="Card">0000</div>
      `)
      for (const editor of host.querySelectorAll('[contenteditable]')) {
        const original = editor.textContent
        editor.addEventListener('beforeinput', (event) => event.preventDefault())
        editor.addEventListener('input', () => {
          if (editor.textContent !== original) editor.textContent = original
        })
      }
      expect(await runForFailure('fill', {selector: '#stubborn', value: 'Ada'})).toEqual({
        code: 'invalid-args',
        message: 'The editor rejected "Ada"; its text does not match it.',
      })
      await expect.element(page.getByRole('textbox', {name: 'Stubborn'})).toMatchTextContent(/^locked$/)
      const refused = await runForFailure('fill', {selector: '#stubborn-card', value: '4242424242424242'})
      expect(refused).toEqual({code: 'invalid-args', message: 'The editor rejected ***; its text does not match it.'})
      expect(JSON.stringify(refused)).not.toContain('4242')
    })

    it('refuses code editors it cannot type into instead of claiming success', async () => {
      mountEditors(`
        <div class="cm-editor"><div id="cm" class="cm-content" contenteditable="true" role="textbox" aria-label="Code">let a = 1</div></div>
        <div class="monaco-editor"><textarea id="monaco" aria-label="Monaco input"></textarea></div>
      `)
      const codeEditor = {
        code: 'invalid-args',
        message: 'That is a code editor (CodeMirror or Monaco); fill cannot type into it.',
      }
      expect(await runForFailure('fill', {selector: '#cm', value: 'x'})).toEqual(codeEditor)
      expect(await runForFailure('fill', {selector: '#monaco', value: 'x'})).toEqual(codeEditor)
      await expect.element(page.getByRole('textbox', {name: 'Code'})).toMatchTextContent(/^let a = 1$/)
    })

    it('types into a real Tiptap editor so its document model follows', async () => {
      const host = mountEditors('')
      const editor = new Editor({
        element: host,
        extensions: [Document, Paragraph, Text],
        content: '<p>old draft</p>',
        editorProps: {attributes: {id: 'tiptap', role: 'textbox', 'aria-label': 'Composer'}},
      })
      onTestFinished(() => editor.destroy())
      expect(await runForResult('fill', {selector: '#tiptap', value: 'Hello Tiptap'})).toEqual({
        ok: true,
        value: 'Hello Tiptap',
      })
      expect(editor.getText()).toBe('Hello Tiptap')
      await expect.element(page.getByRole('textbox', {name: 'Composer'})).toMatchTextContent(/^Hello Tiptap$/)
    })
  })

  describe('far-away targets', () => {
    it('fills, checks and clicks far-away controls, scrolling each into view', async () => {
      const far = document.createElement('div')
      far.innerHTML = `
        <div style="height: 3000px"></div>
        <label>Far name <input id="far-name" type="text" /></label>
        <div style="height: 3000px"></div>
        <label><input id="far-box" type="checkbox" /> Far box</label>
        <div style="height: 3000px"></div>
        <button id="far-button" type="button">Far button</button>
        <p id="far-clicks">0 far clicks</p>
      `
      document.body.append(far)
      onTestFinished(() => {
        window.scrollTo(0, 0)
        far.remove()
      })
      far.querySelector('#far-button')?.addEventListener('click', () => {
        const clicks = far.querySelector('#far-clicks')
        if (clicks) clicks.textContent = `${Number.parseInt(clicks.textContent ?? '0', 10) + 1} far clicks`
      })

      expect(await runForResult('fill', {selector: '#far-name', value: 'Ada'})).toEqual({ok: true, value: 'Ada'})
      await expect.element(page.getByRole('textbox', {name: 'Far name'})).toHaveValue('Ada')
      await expect.element(page.getByRole('textbox', {name: 'Far name'})).toBeInViewport()

      expect(await runForResult('check', {selector: '#far-box'})).toEqual({ok: true, checked: true})
      await expect.element(page.getByRole('checkbox', {name: 'Far box'})).toBeChecked()
      await expect.element(page.getByRole('checkbox', {name: 'Far box'})).toBeInViewport()

      expect(await runForResult('click', {selector: '#far-button'})).toEqual({ok: true})
      await expect.element(page.getByText('1 far clicks')).toBeVisible()
      await expect.element(page.getByRole('button', {name: 'Far button'})).toBeInViewport()
    })
  })

  describe('refs across snapshots', () => {
    const refOfRole = (snapshot: Record<string, unknown>, role: string): string => {
      const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : []
      const entry = nodes.find(
        (node) => typeof node === 'object' && node !== null && 'role' in node && node.role === role,
      )
      return entry && typeof entry === 'object' && 'ref' in entry ? String(entry.ref) : ''
    }

    it('a ref from an earlier snapshot fails as stale after the page changed instead of aliasing a new element', async () => {
      const host = document.createElement('div')
      host.id = 'login-host'
      host.innerHTML = `
      <form>
        <div class="MuiFormControl-root MuiTextField-root">
          <label for="login-username">Username *</label>
          <div class="MuiInputBase-root MuiFilledInput-root"><input id="login-username" name="username" type="text" /></div>
        </div>
      </form>
    `
      container.appendChild(host)
      const username = refOfRole(await runForResult('snapshot', {selector: '#login-host'}), 'textbox')
      expect(username).not.toBe('')
      expect(await runForResult('fill', {ref: username, value: 'demo'})).toEqual({ok: true, value: 'demo'})
      host.innerHTML = `
      <nav><a href="#/a">Dashboard</a><a href="#/b">Orders</a><a href="#/c">Invoices</a><a href="#/d">Reviews</a></nav>
    `
      await runForResult('snapshot', {selector: '#login-host'})
      expect(await runForFailure('fill', {ref: username, value: 'demo'})).toEqual({
        code: 'invalid-args',
        message: `stale ref ${username}; re-run page snapshot`,
      })
      host.remove()
    })
  })

  describe('screenshot', () => {
    const runScreenshot = async (input: {exclude?: string[]} = {}) =>
      readScreenshot(await driver.execute(command('screenshot', input)))

    const decoded = (image: Uint8Array<ArrayBuffer>): Promise<ImageBitmap> => decodeImage(image)

    const centrePixel = (bitmap: ImageBitmap): number[] => {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d context to sample the screenshot')
      context.drawImage(bitmap, 0, 0)
      return Array.from(context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data)
    }

    const isRed = ([red = 0, green = 0, blue = 0]: number[]): boolean => red > 200 && green < 60 && blue < 60

    const coverViewport = (marker?: string): HTMLElement => {
      const cover = document.createElement('div')
      if (marker) cover.setAttribute(marker, '')
      cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgb(255,0,0)'
      document.body.appendChild(cover)
      onTestFinished(() => cover.remove())
      return cover
    }

    it('captures the visible viewport as a webp the size of the window', async () => {
      const shot = await runScreenshot()
      expect({width: shot.width, height: shot.height}).toEqual({width: window.innerWidth, height: window.innerHeight})
      expect(new TextDecoder().decode(shot.image.slice(8, 12))).toBe('WEBP')
      const bitmap = await decoded(shot.image)
      expect({width: bitmap.width, height: bitmap.height}).toEqual({width: shot.width, height: shot.height})
    }, 10_000)

    it('leaves the conciv widget host, effects surface and grab toast out of the capture', async () => {
      const plain = coverViewport()
      const covered = centrePixel(await decoded((await runScreenshot()).image))
      plain.remove()
      const widget = coverViewport('data-conciv-root')
      const widgetExcluded = centrePixel(await decoded((await runScreenshot()).image))
      widget.remove()
      const effects = coverViewport('data-conciv-effects')
      const effectsExcluded = centrePixel(await decoded((await runScreenshot()).image))
      effects.remove()
      coverViewport('data-conciv-toast')
      const toastExcluded = centrePixel(await decoded((await runScreenshot()).image))
      expect(isRed(covered)).toBe(true)
      expect({widget: isRed(widgetExcluded), effects: isRed(effectsExcluded), toast: isRed(toastExcluded)}).toEqual({
        widget: false,
        effects: false,
        toast: false,
      })
    }, 10_000)

    it('leaves out host-page elements the caller names and warns about a selector it cannot read', async () => {
      coverViewport('data-host-devtools')
      const shot = await runScreenshot({exclude: ['[data-host-devtools]', '[[not a selector']})
      expect({excluded: !isRed(centrePixel(await decoded(shot.image))), warnings: shot.warnings}).toEqual({
        excluded: true,
        warnings: ['ignored invalid selector: [[not a selector'],
      })
    }, 10_000)
  })

  describe('page_hmr', () => {
    type HotListener = (payload: unknown) => void

    function fakeHot() {
      const listeners = new Map<string, HotListener[]>()
      const hot: HotSurface = {
        on: (event, listener) => {
          listeners.set(event, [...(listeners.get(event) ?? []), listener])
        },
      }
      const fire = (event: string, payload: unknown = {}): void => {
        for (const listener of listeners.get(event) ?? []) listener(payload)
      }
      return {hot, fire}
    }

    it('reports the hmr tool as not applied when no update lands in time', async () => {
      expect(await runForResult('hmr', {timeout: 50})).toMatchObject({applied: false})
    })

    it('reports no hot surface as unsupported', async () => {
      expect(await watchHotUpdates(undefined)(1000)).toEqual({
        supported: false,
        applied: false,
        waitedMs: 0,
        error: null,
      })
    })

    it('waits for an update already in flight instead of reporting the one before it', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      fire('vite:afterUpdate', {type: 'update', updates: []})
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const waited = wait(500)
      setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 40)
      const result = await waited
      expect(result).toMatchObject({supported: true, applied: true, error: null})
      expect(result.waitedMs).toBeGreaterThanOrEqual(30)
    })

    it('resolves once a pending update is applied', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const waited = wait(500)
      setTimeout(() => fire('vite:afterUpdate', {type: 'update', updates: []}), 50)
      const result = await waited
      expect(result).toMatchObject({supported: true, applied: true, error: null})
      expect(result.waitedMs).toBeGreaterThanOrEqual(40)
      expect(result.waitedMs).toBeLessThan(400)
    })

    it('reports the error when the pending update fails to build', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const waited = wait(500)
      fire('vite:error', {type: 'error', err: {message: 'Unexpected token', stack: ''}})
      expect(await waited).toMatchObject({supported: true, applied: false, error: 'Unexpected token'})
    })

    it('gives up with an explanation when the pending update never lands', async () => {
      const {hot, fire} = fakeHot()
      const wait = watchHotUpdates(hot)
      fire('vite:beforeUpdate', {type: 'update', updates: []})
      const result = await wait(60)
      expect(result).toMatchObject({
        supported: true,
        applied: false,
        error: 'the hot update did not land within 60ms',
      })
      expect(result.waitedMs).toBeGreaterThanOrEqual(50)
    })
  })
})

describe('page console', () => {
  const ConsoleEntries = z.object({entries: z.array(z.object({level: z.string(), ts: z.number(), text: z.string()}))})

  const consoleRead = async (driver: PageOperations, since?: number) => {
    const input = since === undefined ? {} : {since}
    return ConsoleEntries.parse(readValue(await driver.execute(command('console', input)), 'console')).entries
  }

  const pageEvent = (type: 'error' | 'unhandledrejection'): Promise<void> =>
    new Promise((resolve) => window.addEventListener(type, () => resolve(), {once: true}))

  it('since is inclusive: an entry stamped exactly at since is returned, one past it is not', async () => {
    const driver = makePageOperations(noEffects)
    onTestFinished(() => driver.dispose())
    console.log('console-marker-inclusive')
    const marker = (await consoleRead(driver)).find((entry) => entry.text === 'console-marker-inclusive')
    if (!marker) throw new Error('the console buffer did not record the marker')
    const texts = async (since: number) => (await consoleRead(driver, since)).map((entry) => entry.text)
    expect(await texts(marker.ts)).toContain('console-marker-inclusive')
    expect(await texts(marker.ts + 1)).not.toContain('console-marker-inclusive')
  })

  it('records what the page threw, uncaught or unhandled, with its message and where it came from', async () => {
    const driver = makePageOperations(noEffects)
    onTestFinished(() => driver.dispose())
    const thrown = Promise.all([pageEvent('error'), pageEvent('unhandledrejection')])
    setTimeout(() => {
      throw new Error('page-boom-uncaught')
    })
    void Promise.reject(new Error('page-boom-unhandled'))
    await thrown
    const entries = await consoleRead(driver)
    const recorded = (message: string) =>
      entries.flatMap((entry) =>
        entry.text.includes(message) && entry.text.includes('builtin-plugins.browser.test') ? [entry.level] : [],
      )
    expect({uncaught: recorded('page-boom-uncaught'), unhandled: recorded('page-boom-unhandled')}).toEqual({
      uncaught: ['uncaught'],
      unhandled: ['unhandled'],
    })
  })
})

describe('page effects', () => {
  it('holding Alt inspects the page until Alt is released or Esc is pressed, and not while typing in a textbox', async () => {
    const highlight = makeHighlight({opener: {symbolicate: async () => null, desktop: undefined}, toast: () => {}})
    const layer = document.createElement('div')
    const field = document.createElement('input')
    field.setAttribute('aria-label', 'note')
    document.body.append(layer, field)
    const dispose = highlight.mount(layer)
    onTestFinished(() => {
      dispose()
      layer.remove()
      field.remove()
    })
    const hint = page.getByRole('status').filter({hasText: 'Inspecting'})

    expect(document.activeElement).toBe(document.body)
    await userEvent.keyboard('{Alt>}')
    await expect.element(hint).toBeVisible()
    await userEvent.keyboard('{/Alt}')
    await expect.element(hint).not.toBeInTheDocument()

    await userEvent.keyboard('{Alt>}')
    await expect.element(hint).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(hint).not.toBeInTheDocument()
    await userEvent.keyboard('{/Alt}')

    await userEvent.click(page.getByRole('textbox', {name: 'note'}))
    await userEvent.keyboard('{Alt>}')
    await expect.element(hint).not.toBeInTheDocument()
    await userEvent.keyboard('{/Alt}')
  })

  it('holding Alt over conciv’s own interface picks the page element under it, never conciv’s own', async () => {
    const highlight = makeHighlight({opener: {symbolicate: async () => null, desktop: undefined}, toast: () => {}})
    const layer = document.createElement('div')
    layer.setAttribute(PLUGIN_OVERLAY_ATTR, '')
    const surface = document.createElement('div')
    surface.setAttribute(EFFECTS_SURFACE_ATTR, '')
    surface.style.cssText = 'position:fixed;top:64px;left:32px;z-index:2147483000'
    const effect = document.createElement('strong')
    effect.textContent = 'conciv effect'
    surface.append(effect)
    const heading = document.createElement('h1')
    heading.textContent = 'Page heading'
    heading.style.cssText = 'position:fixed;top:0;left:0;margin:0;width:320px;height:160px'
    document.body.append(layer, heading, surface)
    const dispose = highlight.mount(layer)
    onTestFinished(() => {
      dispose()
      layer.remove()
      heading.remove()
      surface.remove()
    })
    const hint = page.getByRole('status').filter({hasText: 'Inspecting'})

    await userEvent.keyboard('{Alt>}')
    await expect.element(hint).toBeVisible()
    await userEvent.hover(page.getByText('conciv effect'), {force: true})
    await expect.element(page.getByText('<h1>', {exact: true})).toBeVisible()
    await expect.element(page.getByText('<strong>', {exact: true})).not.toBeInTheDocument()
    await userEvent.keyboard('{/Alt}')
    await expect.element(hint).not.toBeInTheDocument()
  })
})

describe('opening an element’s source', () => {
  it('opens the located source, symbolicates bare frames, and settles a missing source, desktop or launch', async () => {
    const launched: unknown[] = []
    const desktop = {
      launch: async (path: string, position?: {line: number; column?: number}) => void launched.push({path, position}),
      reveal: undefined,
      installed: undefined,
      pick: undefined,
    }
    const located = {component: null, stack: [], frames: [], owners: []}
    const open = (opener: Partial<SourceOpener>) =>
      Effect.runPromise(
        openSource(
          {locate: async () => located, symbolicate: async () => null, desktop, ...opener},
          document.createElement('div'),
        ),
      )
    const source = {file: 'src/app.tsx', line: 12, column: 4}

    expect(await open({locate: async () => ({...located, source})})).toBe('opened')
    expect(launched).toEqual([{path: 'src/app.tsx', position: {line: 12, column: 4}}])
    expect(
      await open({
        locate: async () => ({...located, frames: [{fileName: 'http://localhost/app.js', line: 3, column: 9}]}),
        symbolicate: async () => ({file: 'src/page.tsx', line: 30, column: 2}),
      }),
    ).toBe('opened')
    expect(launched.at(-1)).toEqual({path: 'src/page.tsx', position: {line: 30, column: 2}})
    expect(await open({})).toBe('no-source')
    expect(await open({locate: async () => null})).toBe('no-source')
    expect(await open({locate: async () => ({...located, source}), desktop: undefined})).toBe('failed')
    expect(
      await open({
        locate: async () => ({...located, source}),
        desktop: {...desktop, launch: () => Promise.reject(new Error('no editor'))},
      }),
    ).toBe('failed')
  })
})

describe('a capture in every engine', () => {
  const mountProbe = async (layout: string, fill: (box: HTMLElement) => void): Promise<void> => {
    const face = CHAT_FONTS.find((candidate) => candidate.family === 'Archivo' && candidate.weight === 600)
    if (!face) throw new Error('no Archivo 600 face to load')
    const fontRule = document.createElement('style')
    fontRule.textContent = `@font-face{font-family:'Capture Probe';font-weight:600;src:url(${face.src}) format('woff2')}`
    document.head.append(fontRule)
    await document.fonts.load('600 14px "Capture Probe"')
    const box = document.createElement('nav')
    box.style.cssText = `position:fixed;top:0;left:0;z-index:2147483647;width:100vw;height:72px;box-sizing:border-box;padding:16px;background:#fff;color:#000;font:600 14px/20px "Capture Probe";${layout}`
    fill(box)
    document.body.appendChild(box)
    onTestFinished(() => {
      box.remove()
      fontRule.remove()
    })
  }

  const capturedLines = async (): Promise<{firstLine: boolean; secondLine: boolean}> => {
    const driver = makePageOperations(noEffects)
    onTestFinished(() => driver.dispose())
    const bitmap = await decodeImage(readScreenshot(await driver.execute(command('screenshot', {}))).image)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context to sample the screenshot')
    context.drawImage(bitmap, 0, 0)
    const inked = (top: number, bottom: number): boolean =>
      context.getImageData(0, top, 300, bottom - top).data.some((value, index) => index % 4 === 0 && value < 128)
    return {firstLine: inked(16, 36), secondLine: inked(38, 70)}
  }

  it('keeps link text that sits on one line on one line in the capture', async () => {
    await mountProbe('display:flex;flex-wrap:wrap;align-items:flex-start;overflow-wrap:anywhere', (box) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;flex-wrap:nowrap;column-gap:16px'
      for (const label of ['Home', 'About', 'Form', 'Docs']) {
        const link = document.createElement('a')
        link.href = '#'
        link.textContent = label
        link.style.cssText = 'display:inline-flex;align-items:center;color:inherit;text-decoration:none'
        row.append(link)
      }
      box.append(row)
    })
    expect(await capturedLines()).toEqual({firstLine: true, secondLine: false})
  }, 10_000)

  it('keeps a wrapping paragraph inside a nowrap container wrapped in the capture', async () => {
    await mountProbe('white-space:nowrap', (box) => {
      const paragraph = document.createElement('p')
      paragraph.textContent = 'Wraps here'
      paragraph.style.cssText = 'margin:0;width:60px;white-space:normal'
      box.append(paragraph)
    })
    expect(await capturedLines()).toEqual({firstLine: true, secondLine: true})
  }, 10_000)
})

describe.skipIf(inFirefox)('the agent acts on the page like a person', () => {
  const AGENT = 'agent-session'

  function AgentPage() {
    const [name, setName] = createSignal('')
    const [count, setCount] = createSignal(0)
    const [frozen, setFrozen] = createSignal(false)
    return (
      <div>
        <Menu.Root>
          <Menu.Trigger id="actions">Actions</Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content>
              <Menu.Item value="archive">Archive</Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>
        <label>
          Name
          <input id="name" onInput={(event) => setName(event.currentTarget.value)} />
        </label>
        <p>Hello, {name()}</p>
        <button id="count" onClick={() => setCount((value) => value + 1)}>
          Count
        </button>
        <p>{count()} clicks</p>
        <button id="hidden" hidden>
          Hidden
        </button>
        <button id="disabled" disabled>
          Disabled
        </button>
        <label>
          <input id="locked" type="checkbox" disabled />
          Locked
        </label>
        <div
          id="frozen"
          role="checkbox"
          aria-label="Frozen"
          aria-checked={frozen()}
          aria-disabled="true"
          onClick={() => setFrozen((value) => !value)}
        />
      </div>
    )
  }

  it('opens a pointerdown menu, types into a focused field, shields the page, stops on two clicks, refuses what a person could not use', async () => {
    const [stopped, setStopped] = createSignal('')
    render(() => (
      <div>
        <AgentPage />
        <p>stopped {stopped()}</p>
      </div>
    ))
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    host.style.cssText = 'position: fixed; z-index: 2147483000'
    document.body.append(host)
    onTestFinished(() => host.remove())
    const unmountSimulator = mountSimulator({
      root: host.attachShadow({mode: 'open'}),
      session: () => AGENT,
      onStop: (sessionId) => {
        setStopped(sessionId)
        endTask()
      },
    })
    const driver = makePageOperations(noEffects)
    onTestFinished(() => driver.dispose())
    const act = (name: string, input: Record<string, unknown>) => driver.execute(command(name, input, AGENT))

    expect(await act('click', {selector: '#actions'})).toMatchObject({type: 'success'})
    await expect.element(page.getByRole('menuitem', {name: 'Archive'})).toBeVisible()
    await expect.element(page.getByRole('menu')).toHaveFocus()

    expect(await act('fill', {selector: '#name', value: 'Ada'})).toMatchObject({type: 'success'})
    await expect.element(page.getByRole('textbox', {name: 'Name'})).toHaveFocus()
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(page.getByText('Hello, Ada')).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'Count'}), {force: true})
    await expect.element(page.getByText('Click again to stop me')).toBeVisible()
    await expect.element(page.getByText('0 clicks')).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'Count'}), {force: true})
    await expect.element(page.getByText(`stopped ${AGENT}`)).toBeVisible()
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', {name: 'Count'}))
    await expect.element(page.getByText('1 clicks')).toBeVisible()

    expect(await act('click', {selector: '#hidden'})).toMatchObject({
      type: 'failure',
      code: 'invalid-args',
      message: 'That element is not visible.',
    })
    expect(await act('click', {selector: '#disabled'})).toMatchObject({
      type: 'failure',
      code: 'invalid-args',
      message: 'That element is disabled.',
    })
    expect(await act('check', {selector: '#locked'})).toMatchObject({
      type: 'failure',
      code: 'invalid-args',
      message: 'That element is disabled.',
    })
    expect(await act('check', {selector: '#frozen'})).toMatchObject({
      type: 'failure',
      code: 'invalid-args',
      message: 'That element is disabled.',
    })
    await expect.element(page.getByRole('checkbox', {name: 'Frozen'})).not.toBeChecked()

    unmountSimulator()
    host.remove()
    const remounted = document.createElement('div')
    remounted.setAttribute('data-conciv-root', '')
    remounted.style.cssText = 'position: fixed; z-index: 2147483000'
    document.body.append(remounted)
    onTestFinished(() => remounted.remove())
    onTestFinished(
      mountSimulator({root: remounted.attachShadow({mode: 'open'}), session: () => AGENT, onStop: endTask}),
    )
    expect(await act('fill', {selector: '#name', value: 'Grace'})).toMatchObject({type: 'success'})
    await expect.element(page.getByRole('status', {name: 'Agent is using this page'})).toBeVisible()
  })
})

describe.skipIf(inFirefox)('the agent cursor always arrives', () => {
  const AGENT = 'cursor-session'

  function mountedAgent(): void {
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    host.style.cssText = 'position: fixed; z-index: 2147483000'
    document.body.append(host)
    onTestFinished(() => host.remove())
    const unmount = mountSimulator({root: host.attachShadow({mode: 'open'}), session: () => AGENT, onStop: endTask})
    onTestFinished(unmount)
    startTask(AGENT)
    onTestFinished(endTask)
  }

  it('an aim replaced by a newer one settles instead of hanging', async () => {
    mountedAgent()
    const first = aimCursor({id: AGENT, at: windowAt({x: 10, y: 10}), look: CursorLook.AGENT})
    const second = aimCursor({id: AGENT, at: windowAt({x: 200, y: 200}), look: CursorLook.AGENT})
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
  })

  it('an aim whose cursor is dropped settles', async () => {
    mountedAgent()
    const aimed = aimCursor({id: AGENT, at: windowAt({x: 300, y: 40}), look: CursorLook.AGENT})
    dropCursor(AGENT)
    await expect(aimed).resolves.toBeUndefined()
  })

  it('an aim at a point off the screen settles at once', async () => {
    mountedAgent()
    await expect(
      aimCursor({id: AGENT, at: windowAt({x: -500, y: -500}), look: CursorLook.AGENT}),
    ).resolves.toBeUndefined()
  })
})

describe.skipIf(inFirefox)('the page plugin leaves the host page as it found it', () => {
  const AGENT = 'dispose-session'
  const cursor = () => page.getByRole('img', {name: "Agent's cursor", includeHidden: true})

  async function scrolledTo(y: number): Promise<void> {
    const scrolled = new Promise<void>((resolve) =>
      document.addEventListener('scroll', () => resolve(), {once: true, capture: true}),
    )
    window.scrollTo(0, y)
    await scrolled
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

  it('after the plugin is disposed a page scroll no longer re-lays-out the agent cursor, and the next aim follows scrolls again', async () => {
    const tall = document.createElement('div')
    tall.style.height = '4000px'
    document.body.prepend(tall)
    onTestFinished(() => tall.remove())
    onTestFinished(() => window.scrollTo(0, 0))
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    host.style.cssText = 'position: fixed; z-index: 2147483000'
    document.body.append(host)
    onTestFinished(() => host.remove())
    const shadow = host.attachShadow({mode: 'open'})
    const themed = document.createElement('style')
    themed.textContent = tokens
    shadow.append(themed)
    onTestFinished(mountSimulator({root: shadow, session: () => AGENT, onStop: endTask}))
    startTask(AGENT)
    onTestFinished(endTask)
    onTestFinished(() => dropCursor(AGENT))
    window.scrollTo(0, 0)
    const driver = makePageOperations(noEffects)
    await aimCursor({id: AGENT, at: pageAt({target: tall, point: {x: 20, y: 20}}), look: CursorLook.AGENT})
    await expect.element(cursor()).toBeVisible()
    await scrolledTo(2000)
    await expect.element(cursor()).not.toBeVisible()
    await scrolledTo(0)
    await expect.element(cursor()).toBeVisible()

    driver.dispose()
    await scrolledTo(2000)
    await expect.element(cursor()).toBeVisible()
    await scrolledTo(0)

    const again = makePageOperations(noEffects)
    onTestFinished(again.dispose)
    await aimCursor({id: AGENT, at: pageAt({target: tall, point: {x: 20, y: 20}}), look: CursorLook.AGENT})
    await expect.element(cursor()).toBeVisible()
    await scrolledTo(2000)
    await expect.element(cursor()).not.toBeVisible()
  })

  it('leaves a console wrapper installed after its own in place when disposed', () => {
    const untouched = console.info
    onTestFinished(() => {
      console.info = untouched
    })
    const driver = makePageOperations(noEffects)
    const heard: unknown[][] = []
    const later = (...args: unknown[]) => {
      heard.push(args)
    }
    console.info = later
    driver.dispose()
    expect(console.info).toBe(later)
    console.info('after dispose')
    expect(heard).toEqual([['after dispose']])
  })
})

describe.skipIf(inFirefox)('page action queue', () => {
  const AGENT = 'queue-session'
  const FIELDS = ['first', 'last', 'email', 'phone', 'city', 'zip']
  const MASK = {name: 'Agent is using this page'}

  function QueueForm(props: {heard: (event: string) => void; drafting: () => void}) {
    const field = (name: string) => (
      <label>
        {name}
        <input name={name} onInput={() => props.heard(name)} />
      </label>
    )
    return (
      <form onSubmit={(event) => event.preventDefault()}>
        {FIELDS.map(field)}
        <label>
          card
          <input name="card" autocomplete="cc-number" onInput={() => props.heard('card')} />
        </label>
        <label>
          locked
          <input name="locked" readOnly value="fixed" />
        </label>
        <label>
          <input type="checkbox" name="agree" onChange={() => props.heard('agree')} />
          agree
        </label>
        <button type="button" onKeyDown={(event) => props.heard(`key ${event.key}`)}>
          Send
        </button>
        <div id="notes" contenteditable="true" role="textbox" aria-label="Notes">
          <p id="notes-line">old note</p>
        </div>
        <div
          contenteditable="true"
          role="textbox"
          aria-label="Draft"
          onBeforeInput={(event) => {
            if (event.isTrusted) return
            event.preventDefault()
            props.drafting()
          }}
        >
          <p id="draft-line">old draft</p>
        </div>
      </form>
    )
  }

  function queuePage(drafting: () => void = () => {}) {
    const heard: string[] = []
    render(() => <QueueForm heard={(event) => heard.push(event)} drafting={drafting} />)
    const host = document.createElement('div')
    host.setAttribute('data-conciv-root', '')
    host.style.cssText = 'position: fixed; z-index: 2147483000'
    document.body.append(host)
    onTestFinished(() => host.remove())
    const unmount = mountSimulator({root: host.attachShadow({mode: 'open'}), session: () => AGENT, onStop: endTask})
    onTestFinished(unmount)
    onTestFinished(endTask)
    const driver = makePageOperations(noEffects)
    onTestFinished(driver.dispose)
    const queued = (id: string, index: number, of: number, action: Record<string, unknown>, signal?: AbortSignal) =>
      driver.execute(pageCommand({action, agentId: AGENT, timeoutMs: 5000, queued: {id, index, of}}), signal)
    const accept = (
      id: string,
      actions: Record<string, unknown>[],
      signal?: AbortSignal,
      type: 'queue' | 'queue_async' = 'queue',
    ) => queued(id, -1, actions.length, {type, actions}, signal)
    const play = (id: string, actions: Record<string, unknown>[], signal?: AbortSignal) =>
      actions.reduce<Promise<Outcome[]>>(async (done, {tool, ...input}, index) => {
        const before = await done
        return [...before, await queued(id, index, actions.length, {...input, type: String(tool).slice(5)}, signal)]
      }, Promise.resolve([]))
    const leave = () => {
      driver.dispose()
      unmount()
    }
    return {heard, accept, play, leave}
  }

  const fill = (name: string, value: string) => ({tool: 'page_fill', selector: `[name=${name}]`, value})
  const played = (value: Record<string, unknown>) => ({type: 'success', result: {value}})

  it('answers at once, then plays fill, check and press in order, each landing after the one before', async () => {
    const {heard, accept, play} = queuePage()
    const actions = [
      fill('first', 'Ada'),
      fill('last', 'Lovelace'),
      {tool: 'page_check', selector: '[name=agree]'},
      {tool: 'page_press', selector: 'button', key: 'Enter'},
    ]
    expect(await accept('q-order', actions)).toMatchObject(
      played({queueId: 'q-order', status: 'playing', done: 0, of: 4}),
    )
    expect(heard).toEqual([])
    expect(await play('q-order', actions)).toMatchObject([
      played({ok: true, value: 'Ada'}),
      played({ok: true, value: 'Lovelace'}),
      played({ok: true, checked: true}),
      played({ok: true}),
    ])
    expect(heard).toEqual(['first', 'last', 'agree', 'key Enter'])
  })

  it('a missing target and a read-only field fail on their own and the rest still play', async () => {
    const {heard, accept, play} = queuePage()
    const actions = [fill('first', 'Ada'), fill('nope', 'x'), fill('locked', 'y'), fill('email', 'ada@example.com')]
    await accept('q-skip', actions)
    expect(await play('q-skip', actions)).toMatchObject([
      {type: 'success'},
      {type: 'failure', code: 'invalid-args', message: 'no element for selector [name=nope]'},
      {type: 'failure', code: 'invalid-args', message: 'That field is read-only.'},
      played({value: 'ada@example.com'}),
    ])
    expect(heard).toEqual(['first', 'email'])
  })

  it('an async queue with no in-page run answers its handle at once and takes the mask down once it finishes', async () => {
    const {accept, play} = queuePage()
    const actions = [fill('first', 'Ada'), fill('last', 'Byron')]
    expect(await accept('q-outside', actions, undefined, 'queue_async')).toMatchObject(
      played({queueId: 'q-outside', status: 'playing', done: 0, of: 2}),
    )
    await expect.element(page.getByRole('status', MASK)).toBeInTheDocument()
    await play('q-outside', actions)
    await expect.element(page.getByRole('status', MASK)).not.toBeInTheDocument()
  })

  it('a queued fill types into a contenteditable editor', async () => {
    const {accept, play} = queuePage()
    const actions = [fill('first', 'Ada'), {tool: 'page_fill', selector: '#notes-line', value: 'Hello editor'}]
    await accept('q-editor', actions)
    expect(await play('q-editor', actions)).toMatchObject([
      played({ok: true, value: 'Ada'}),
      played({ok: true, value: 'Hello editor'}),
    ])
    await expect.element(page.getByRole('textbox', {name: 'Notes'})).toMatchTextContent(/^\s*Hello editor\s*$/)
  })

  it("a queue cut off by an unmount does not keep a later mount's mask up", async () => {
    const before = queuePage()
    const attached = new AbortController()
    await before.accept(
      'q-cut',
      [fill('first', 'Ada'), fill('last', 'Lovelace'), fill('email', 'a@b.c')],
      attached.signal,
    )
    attached.abort()
    before.leave()
    const after = queuePage()
    const next = [fill('city', 'Paris')]
    await after.accept('q-next', next)
    await after.play('q-next', next)
    await expect.element(page.getByRole('status', MASK)).not.toBeInTheDocument()
    expect(before.heard).toEqual(['city'])
  })

  it('a session switch mid-queue lands nothing more of the old queue, reports none of it, and takes the mask down', async () => {
    const {heard, accept, play} = queuePage()
    const first = new AbortController()
    const cut = [fill('first', 'Ada'), fill('last', 'Lovelace')]
    await accept('q-switched', cut, first.signal)
    first.abort()
    const second = new AbortController()
    const other = [fill('city', 'Paris')]
    await accept('q-other', other, second.signal)
    expect(await play('q-other', other, second.signal)).toMatchObject([played({ok: true, value: 'Paris'})])
    expect(await play('q-switched', cut, first.signal)).toMatchObject([{type: 'failure'}, {type: 'failure'}])
    expect(heard).toEqual(['city'])
    await expect.element(page.getByRole('status', MASK)).not.toBeInTheDocument()
  })

  it('a queue whose acceptance never reached the engine plays nothing and takes the mask down', async () => {
    const {heard, accept, play} = queuePage()
    const unsent = new AbortController()
    const actions = [fill('first', 'Ada'), fill('last', 'Byron')]
    await accept('q-unsent', actions, unsent.signal)
    unsent.abort()
    expect(await play('q-unsent', actions)).toMatchObject([{type: 'failure'}, {type: 'failure'}])
    expect(heard).toEqual([])
    await expect.element(page.getByRole('status', MASK)).not.toBeInTheDocument()
  })

  it('a session switch while a queued fill waits on the editor does not fall back to typing into it', async () => {
    const first = new AbortController()
    const {accept, play} = queuePage(() => first.abort())
    const draft = [{tool: 'page_fill', selector: '#draft-line', value: 'Hello draft'}]
    await accept('q-draft', draft, first.signal)
    await play('q-draft', draft, first.signal)
    const after = [fill('city', 'Paris')]
    await accept('q-after', after)
    await play('q-after', after)
    await expect.element(page.getByRole('textbox', {name: 'Draft'})).toMatchTextContent(/^\s*old draft\s*$/)
  })

  it('a queued fill the engine cancels while it waits on the editor stops there, and the next queue plays alone', async () => {
    const cancelled = new AbortController()
    const {heard, accept, play} = queuePage(() => cancelled.abort())
    const draft = [{tool: 'page_fill', selector: '#draft-line', value: 'Hello draft'}]
    await accept('q-cancelled', draft)
    expect(await play('q-cancelled', draft, cancelled.signal)).toMatchObject([{type: 'failure'}])
    await expect.element(page.getByRole('textbox', {name: 'Draft'})).toMatchTextContent(/^\s*old draft\s*$/)
    const after = [fill('city', 'Paris')]
    await accept('q-after-cancel', after)
    expect(await play('q-after-cancel', after)).toMatchObject([played({ok: true, value: 'Paris'})])
    expect(heard).toEqual(['city'])
    await expect.element(page.getByRole('status', MASK)).not.toBeInTheDocument()
  })

  it('masks a card number in the result', async () => {
    const {accept, play} = queuePage()
    await accept('q-mask', [fill('card', '4242424242424242')])
    expect(await play('q-mask', [fill('card', '4242424242424242')])).toMatchObject([
      played({ok: true, value: MASKED_VALUE}),
    ])
  })

  it('two clicks on the mask stop the queue: no action after the stop runs and the mask comes down', async () => {
    const {heard, accept, play} = queuePage()
    const actions = FIELDS.map((name) => fill(name, `${name} value`))
    await accept('q-stop', actions)
    await expect.element(page.getByRole('status', MASK)).toBeInTheDocument()
    await userEvent.click(page.getByRole('button', {name: 'Send'}), {force: true})
    await userEvent.click(page.getByRole('button', {name: 'Send'}), {force: true})
    expect(await play('q-stop', actions)).toEqual(
      FIELDS.map(() =>
        expect.objectContaining({
          type: 'failure',
          message: 'stopped by the user before this action',
          raised: expect.objectContaining({code: 'QUEUE_STOPPED'}),
        }),
      ),
    )
    expect(heard).toEqual([])
    await expect.element(page.getByRole('status', MASK)).not.toBeInTheDocument()
  })

  it('still finishes under reduced motion', async () => {
    const {accept, play} = queuePage()
    await cdp().send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]})
    onTestFinished(async () => {
      await cdp().send('Emulation.setEmulatedMedia', {features: []})
    })
    const actions = [fill('first', 'Ada'), fill('last', 'Byron')]
    await accept('q-reduced', actions)
    expect(await play('q-reduced', actions)).toMatchObject([{type: 'success'}, {type: 'success'}])
  })
})

describe('the page contracts another plugin reads', () => {
  it('Page shows a toast on the page and captures it without conciv’s own interface', async () => {
    pageMembers.toast('contract toast shown', 'success')
    await expect.element(page.getByText('contract toast shown')).toBeInTheDocument()
    const box = document.createElement('div')
    box.style.cssText = 'position:fixed;top:0;left:0;width:40px;height:40px;background:#fff'
    const ours = document.createElement('div')
    ours.setAttribute('data-conciv-root', '')
    ours.style.cssText = 'width:40px;height:40px;background:#000'
    box.append(ours)
    document.body.append(box)
    onTestFinished(() => box.remove())
    const {snapdom} = await import('@zumer/snapdom')
    const shot = await snapdom(box, {
      dpr: 1,
      exclude: [pageMembers.capture.exclude],
      excludeMode: 'remove',
      plugins: [...pageMembers.capture.plugins],
    })
    const bitmap = await createImageBitmap(await shot.toBlob({format: 'png'}))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context to sample the capture')
    context.drawImage(bitmap, 0, 0)
    const inked = context
      .getImageData(0, 0, bitmap.width, bitmap.height)
      .data.some((value, index) => index % 4 === 0 && value < 128)
    expect(inked).toBe(false)
  })

  describe.skipIf(inFirefox)('ReactTree', () => {
    let container: HTMLElement
    let reactRoot: Root
    const leaf = () => page.getByRole('button', {name: /^A:/})

    beforeAll(async () => {
      installReactBridge()
      container = document.createElement('div')
      document.body.append(container)
      reactRoot = createRoot(container)
      reactRoot.render(createElement(FixtureApp))
      await vi.waitFor(() => leaf().element())
    })

    afterAll(() => {
      reactRoot.unmount()
      container.remove()
    })

    it('reads the component tree, names and locates an element, and dehydrates what it finds', async () => {
      const tree = makeReactTree()
      const element = leaf().element()
      expect(tree.describe(element)).toEqual({component: 'Leaf', file: null})
      const located = await tree.locate(element)
      expect(located?.stack).toContain('Leaf')
      expect(located?.stack).toContain('Branch')
      expect(located?.owners.map((owner) => owner.component)).toContain('Leaf')
      expect(located?.owners.every((owner) => owner.ref.startsWith('v'))).toBe(true)
      expect((await tree.frames(element)).map((frame) => frame.fn)).toContain('Leaf')
      const labels = (fiber: ReactFiber | null | undefined): unknown[] => {
        if (!fiber) return []
        const props = z.object({label: z.string()}).safeParse(fiber.memoizedProps)
        return [
          ...(props.success ? [tree.dehydrate(props.data)] : []),
          ...labels(fiber.child),
          ...labels(fiber.sibling),
        ]
      }
      expect(tree.rootFibers().flatMap(labels)).toContainEqual({label: 'A'})
      expect(tree.dehydrate({label: 'A', run: function run() {}})).toEqual({label: 'A', run: 'ƒ run()'})
    })

    it('Page.pick returns the clicked element’s source and box, and null when the user presses Escape', async () => {
      const [leafFrame] = await makeReactTree().frames(leaf().element())
      expect(leafFrame?.fn).toBe('Leaf')
      const {x, y, width, height} = leaf().element().getBoundingClientRect()
      await getReactGrabAdapter()
      const picked = pageMembers.pick()
      await vi.waitFor(() => expect(picking()).toBe(true))
      await userEvent.click(leaf(), {force: true})
      const result = await picked
      expect(result?.source?.componentName).toBe(leafFrame?.fn)
      expect(leafFrame?.fileName?.endsWith(`/${result?.source?.filePath}`)).toBe(true)
      expect(Number.isInteger(result?.source?.lineNumber)).toBe(true)
      expect(result?.source?.lineNumber).toBeGreaterThan(0)
      expect(result?.rect).toEqual({x, y, width, height})
      const cancelled = pageMembers.pick()
      await vi.waitFor(() => expect(picking()).toBe(true))
      await userEvent.keyboard('{Escape}')
      expect(await cancelled).toBeNull()
    })
  })
})

describe('the page cards in the chat', () => {
  it('draws a page call as its own card, and every page tool has one', async () => {
    const claimed = pageToolCards.flatMap((entry) => entry.tools).toSorted()
    const uncarded = ['queue_async', 'tabs.list', 'fill_form']
    const drawn = Operations.flatMap((operation) =>
      uncarded.includes(operation.name) ? [] : [`${PAGE_NAMESPACE}_${operation.name}`],
    )
    expect(claimed).toEqual(drawn.toSorted())
    const route = {pathname: '/checkout', href: 'http://shop.test/checkout', title: 'Checkout'}
    render(() => <StoryTool call={storyCall('page_route', {}, route, 'r1')} />)
    await page.getByRole('button', {name: /Read the route/}).click()
    await expect.element(page.getByRole('treeitem', {name: 'pathname: "/checkout"'})).toBeVisible()
  })
})

describe('act card body nonempty', () => {
  it('a zero-input act call shows its title with nothing to open', async () => {
    render(() => <StoryTool call={storyCall('page_effect', {})} />)

    await expect.element(page.getByRole('button', {name: /Driving an effect/})).toBeDisabled()
  })

  it('shows its input while running with no result yet', async () => {
    render(() => <StoryTool call={storyCall('page_fill', {selector: '#email', value: 'ada@example.com'})} />)

    await expect.element(page.getByText('value=ada@example.com')).toBeVisible()
    await expect.element(page.getByText('#email')).toBeVisible()

    render(() => (
      <StoryTool call={{...storyCall('page_click', {selector: '#save'}, undefined, 's2'), status: 'pending'}} />
    ))
    await expect.element(page.getByRole('button', {name: /Clicking/})).toBeVisible()
  })

  it('an error-only result opens on the error', async () => {
    render(() => (
      <StoryTool
        call={storyFailedCall('page_fill', {selector: '#email', value: 'ada@example.com'}, 'element not found')}
      />
    ))

    await page.getByRole('button', {name: /page_fill/}).click()
    await expect.element(page.getByText('element not found')).toBeVisible()
  })
})

describe('console card', () => {
  it('marks the card as an error when the page threw, uncaught or unhandled', async () => {
    render(() => (
      <StoryTool
        call={storyCall(
          'page_console',
          {},
          {
            entries: [
              {level: 'log', ts: 1, text: 'booted'},
              {level: 'uncaught', ts: 2, text: 'Error: boom\n    at app.js:3:7'},
            ],
          },
        )}
      />
    ))
    await expect.element(page.getByRole('img', {name: 'failed'})).toBeInTheDocument()
  })
})

describe('card input chips', () => {
  it('read-value card shows the element as its subtitle and drops the raw selector key', async () => {
    render(() => (
      <StoryTool call={storyCall('page_text', {selector: '#headline', trim: true}, {text: 'Ship it on Friday'})} />
    ))

    await expect.element(page.getByText('#headline')).toBeVisible()
    await expect.element(page.getByText('trim=true')).toBeVisible()
    await expect.element(page.getByText(/selector=/)).not.toBeInTheDocument()
  })

  it('read-value card renders a root array result as a structured JSON tree, not a flat chip row', async () => {
    render(() => (
      <StoryTool call={storyCall('page_text', {selector: '.item'}, ['first-item-marker', 'second-item-marker'])} />
    ))

    await page.getByRole('button', {name: /Read the text/}).click()
    await expect.element(page.getByRole('treeitem', {name: /Array\(2\)/})).toBeVisible()
    await expect.element(page.getByText(/first-item-marker.*second-item-marker/).first()).toBeVisible()
  })

  it('read-bulk card shows the element as its subtitle and keeps the other input', async () => {
    render(() => (
      <StoryTool call={storyCall('page_dom', {selector: 'form', maxChars: 2000}, {html: '<form></form>'})} />
    ))

    await expect.element(page.getByText('form', {exact: true})).toBeVisible()
    await expect.element(page.getByText('maxChars=2000')).toBeVisible()
    await expect.element(page.getByText(/selector=/)).not.toBeInTheDocument()
  })

  it('react card shows the element as its subtitle and keeps the other input', async () => {
    render(() => (
      <StoryTool
        call={storyCall('page_locate', {selector: '#checkout', action: 'source'}, {component: 'CheckoutForm'})}
      />
    ))

    await expect.element(page.getByText('#checkout')).toBeVisible()
    await expect.element(page.getByText('action=source')).toBeVisible()
    await expect.element(page.getByText(/selector=/)).not.toBeInTheDocument()
  })
})

describe('read value card image', () => {
  function webpBase64(): string {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 6
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context to paint the fixture image')
    context.fillStyle = 'rgb(0, 128, 255)'
    context.fillRect(0, 0, 8, 6)
    return canvas.toDataURL('image/webp').split(',')[1] ?? ''
  }

  it('shows an image result as the picture, not as a tree of its base64 parts', async () => {
    const image = webpBase64()
    render(() => (
      <StoryTool
        call={storyCall('page_screenshot', {}, [
          {type: 'image', source: {type: 'data', value: image, mimeType: 'image/webp'}},
          {type: 'text', content: JSON.stringify({width: 8, height: 6, path: 'tmp/screenshots/shot.webp'})},
        ])}
      />
    ))

    await page.getByRole('button').first().click()
    await expect.element(page.getByRole('img', {name: 'Took a screenshot'})).toBeVisible()
    await expect.element(page.getByRole('tree')).not.toBeInTheDocument()
  })

  describe('viewer', () => {
    const THUMBNAIL = 'Open Took a screenshot'
    const VIEWER = 'Took a screenshot'

    it('clicking the thumbnail opens a dialog with the full image', async () => {
      await mountExpandedCard()

      await page.getByRole('button', {name: THUMBNAIL}).click()

      const viewer = page.getByRole('dialog', {name: VIEWER})
      await expect.element(viewer).toBeVisible()
      await expect.element(viewer.getByRole('img', {name: VIEWER})).toBeVisible()
    })

    it('escape closes the viewer and puts a visible focus back on the thumbnail', async () => {
      await mountExpandedCard()
      const thumbnail = page.getByRole('button', {name: THUMBNAIL})
      await thumbnail.click()
      await expect.element(page.getByRole('dialog', {name: VIEWER})).toBeVisible()

      await userEvent.keyboard('{Escape}')

      await expect.element(page.getByRole('dialog', {name: VIEWER})).not.toBeInTheDocument()
      await expect.element(thumbnail).toHaveFocus()
      expect(document.activeElement?.matches(':focus-visible')).toBe(true)
    })

    it('enter on the focused thumbnail opens the viewer', async () => {
      await mountExpandedCard()
      const thumbnail = page.getByRole('button', {name: THUMBNAIL})
      await userEvent.tab()
      await expect.element(thumbnail).toHaveFocus()

      await userEvent.keyboard('{Enter}')

      await expect.element(page.getByRole('dialog', {name: VIEWER})).toBeVisible()
    })

    it('the close button closes the viewer', async () => {
      await mountExpandedCard()
      await page.getByRole('button', {name: THUMBNAIL}).click()

      await page.getByRole('button', {name: 'Close'}).click()

      await expect.element(page.getByRole('dialog', {name: VIEWER})).not.toBeInTheDocument()
    })

    it('clicking the image toggles actual size, and reopening starts fitted again', async () => {
      await mountExpandedCard()
      const thumbnail = page.getByRole('button', {name: THUMBNAIL})
      await thumbnail.click()

      await page.getByRole('button', {name: 'Show actual size'}).click()
      await page.getByRole('button', {name: 'Fit to window'}).click()
      await page.getByRole('button', {name: 'Show actual size'}).click()

      await userEvent.keyboard('{Escape}')
      await expect.element(page.getByRole('dialog', {name: VIEWER})).not.toBeInTheDocument()
      await thumbnail.click()
      await expect.element(page.getByRole('button', {name: 'Show actual size'})).toBeVisible()
    })

    it('an image that cannot load says so instead of offering a broken viewer', async () => {
      await mountExpandedCard({image: 'QUJD'})

      await expect.element(page.getByText('Could not load Took a screenshot')).toBeVisible()
      await expect.element(page.getByRole('button', {name: THUMBNAIL})).not.toBeInTheDocument()
    })

    it('a failed image recovers when its source changes to one that loads', async () => {
      const [source, setSource] = createStore({image: 'QUJD'})
      await mountExpandedCard(source)
      await expect.element(page.getByText('Could not load Took a screenshot')).toBeVisible()

      setSource('image', webpBase64())

      await expect.element(page.getByRole('button', {name: THUMBNAIL})).toBeVisible()
      await expect.element(page.getByText('Could not load Took a screenshot')).not.toBeInTheDocument()
    })

    async function mountExpandedCard(source: {image: string} = {image: webpBase64()}): Promise<void> {
      render(() => (
        <StoryTool
          call={storyCall('page_screenshot', {}, [
            {type: 'image', source: {type: 'data', value: source.image, mimeType: 'image/webp'}},
            {type: 'text', content: JSON.stringify({width: 8, height: 6, path: 'tmp/screenshots/shot.webp'})},
          ])}
        />
      ))
      await page.getByRole('button').first().click()
    }
  })
})

describe('session card', () => {
  function mount(view: () => JSX.Element): void {
    render(view)
  }

  function sessionNode(parts: readonly ChatPart[]): GroupNodeGroup {
    return {
      type: 'group',
      key: PAGE_SESSION_GROUP_KEY,
      nodeKey: '',
      idKey: undefined,
      indices: parts.map((_, index) => index),
      children: [],
    }
  }

  function toolCall(
    id: string,
    name: string,
    input: Record<string, unknown>,
    state: ToolCallPart['state'],
  ): ToolCallPart {
    return {type: 'tool-call', id, name, arguments: JSON.stringify(input), input, state}
  }

  function fillCall(id: string, selector: string, value: string): ToolCallPart {
    return toolCall(id, 'page_fill', {selector, value}, 'input-complete')
  }

  function okResult(id: string): ToolResultPart {
    return {type: 'tool-result', toolCallId: id, content: '{"ok":true}', state: 'complete'}
  }

  function errorResult(id: string, message: string): ToolResultPart {
    return {type: 'tool-result', toolCallId: id, content: JSON.stringify({message}), state: 'error', error: message}
  }

  function lookup(results: Record<string, ToolResultPart>): (id: string) => ToolResultPart | undefined {
    return (id) => results[id]
  }

  async function mountSettled(
    parts: readonly ChatPart[],
    results: Record<string, ToolResultPart>,
    title: RegExp,
  ): Promise<void> {
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
    ))
    await expect.element(page.getByRole('button', {name: title})).toHaveAttribute('aria-expanded', 'true')
  }

  test('streamed act appends and token growth keep the existing step-rail rows mounted', async () => {
    const [parts, setParts] = createSignal<ToolCallPart[]>([fillCall('f1', '#name', 'Ada')])
    const results = {f1: okResult('f1')}
    mount(() => <SessionCard node={sessionNode(parts())} parts={parts} resultFor={lookup(results)} streaming={true} />)

    const rows = () => page.getByRole('listitem').elements()
    await expect.element(page.getByText('#name')).toBeVisible()
    const firstRow = rows()[0]

    setParts((previous) => [...previous, fillCall('f2', '#email', 'ada@')])
    await expect.element(page.getByText('Typing #email…')).toBeVisible()
    expect(rows()[0]).toBe(firstRow)
    const secondRow = rows()[1]

    setParts((previous) => [...previous.slice(0, 1), fillCall('f2', '#email', 'ada@example.com')])
    await expect.element(page.getByText('“ada@example.com”')).toBeVisible()
    expect(rows()[0]).toBe(firstRow)
    expect(rows()[1]).toBe(secondRow)
  })

  test('a form fill step reads the shared tool label while it runs and once it is done', async () => {
    const parts: ToolCallPart[] = [
      toolCall('ff1', 'page_fill_form', {fields: [{type: 'text', selector: '#name', value: 'Ada'}]}, 'input-complete'),
    ]
    const [results, setResults] = createSignal<Record<string, ToolResultPart>>({})
    const [streaming, setStreaming] = createSignal(true)
    mount(() => (
      <SessionCard
        node={sessionNode(parts)}
        parts={() => parts}
        resultFor={(id) => results()[id]}
        streaming={streaming()}
      />
    ))

    await expect.element(page.getByRole('listitem').getByText('Filling the form', {exact: true})).toBeVisible()
    await expect.element(page.getByText('fill_form', {exact: true})).not.toBeInTheDocument()

    setResults({ff1: okResult('ff1')})
    setStreaming(false)
    await expect.element(page.getByRole('listitem').getByText('Filled the form', {exact: true})).toBeVisible()
  })

  test('a streaming act outside the shorthand verbs still reads as a running phrase', async () => {
    const parts: ToolCallPart[] = [toolCall('h1', 'page_hover', {selector: '#menu'}, 'input-complete')]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={() => undefined} streaming={true} />
    ))

    await expect.element(page.getByText('Hovering #menu…')).toBeVisible()
  })

  const SCRIPT = "await external_page_settext({selector: '#prose', text: 'better prose'})"

  const codeRun = (id: string): ToolCallPart => toolCall(id, 'execute_typescript', {typescriptCode: SCRIPT}, 'complete')

  const THINKING: PageSessionThinkingPart[] = [{type: 'thinking', content: 'choose the field wisely'}]

  test('a settled session shows its folded reasoning and script in a collapsed flat section', async () => {
    const results = {p1: okResult('p1'), f1: okResult('f1')}
    const parts: ChatPart[] = [
      ...THINKING,
      codeRun('p1'),
      toolCall('f1', 'page_fill', {selector: '#prose', value: 'better prose'}, 'complete'),
    ]
    await mountSettled(parts, results, /Edited the page/)

    const section = page.getByRole('button', {name: 'Reasoning · script'})
    await expect.element(section).toBeVisible()
    await expect.element(page.getByText('choose the field wisely')).not.toBeInTheDocument()
    await section.click()
    await expect.element(page.getByText('choose the field wisely')).toBeVisible()
    await expect.element(page.getByText(/external_page_settext/).first()).toBeVisible()
  })

  test('an expanded session shows its step rail without a tool-input row of its own', async () => {
    const results = {f1: okResult('f1')}
    const parts: ToolCallPart[] = [toolCall('f1', 'page_fill', {selector: '#name', value: 'Ada'}, 'complete')]

    await mountSettled(parts, results, /Edited the page/)

    await expect.element(page.getByText('#name')).toBeVisible()
    await expect.element(page.getByText('no input')).not.toBeInTheDocument()
  })

  test('a session whose only error is the folded script run reports error status', async () => {
    const results = {p1: errorResult('p1', 'Script exploded'), f1: okResult('f1')}
    const parts: ToolCallPart[] = [
      codeRun('p1'),
      toolCall('f1', 'page_fill', {selector: '#prose', value: 'x'}, 'complete'),
    ]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
    ))

    await expect.element(page.getByText('Edited the page')).toBeVisible()
    expect(page.getByRole('img', {name: 'error'}).elements().length).toBeGreaterThan(0)
    expect(page.getByRole('img', {name: 'complete'}).elements()).toHaveLength(0)
  })

  test('a settled session without a folded route result shows no location pill', async () => {
    const results = {f1: okResult('f1')}
    const parts: ToolCallPart[] = [toolCall('f1', 'page_fill', {selector: '#name', value: 'Ada'}, 'complete')]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={lookup(results)} streaming={false} />
    ))

    await expect.element(page.getByText('Edited the page')).toBeVisible()
    expect(document.body.textContent).not.toContain(location.host)
  })

  const SCRIPT_LINE = "const rows = document.querySelectorAll('tr')"

  test('a script step reads its own first code line, with no duplicate value pill beside it', async () => {
    const results = {s1: okResult('s1')}
    const parts: ToolCallPart[] = [
      toolCall('s1', 'page_eval', {code: `${SCRIPT_LINE}\nreturn rows.length`}, 'complete'),
    ]

    await mountSettled(parts, results, /Ran script on the page/)

    await expect.element(page.getByRole('listitem')).toMatchTextContent(SCRIPT_LINE)
    expect(page.getByText('script', {exact: true}).query()).toBeNull()
    expect(document.body.textContent).not.toContain(`“${SCRIPT_LINE}”`)
  })

  test('a streaming session without a route result shows the current location honestly', async () => {
    const parts: ToolCallPart[] = [toolCall('f1', 'page_fill', {selector: '#name', value: 'Ada'}, 'input-complete')]
    mount(() => (
      <SessionCard node={sessionNode(parts)} parts={() => parts} resultFor={() => undefined} streaming={true} />
    ))

    await expect.element(page.getByText('Editing the page')).toBeVisible()
    expect(document.body.textContent).toContain(location.host)
  })
})

describe('grab card', () => {
  const PAYLOAD = JSON.stringify({
    text: '<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9',
    snippet: '<h1 class="title">Start simple</h1>',
    source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
    rect: {x: 0, y: 0, width: 320, height: 48},
    preview: {kind: 'dom', html: '<h1>Start simple</h1>', width: 320, height: 48},
  })

  function mount(payload: string = PAYLOAD) {
    return render(() => mountAttachment(new File([payload], GRAB_FILE_NAME, {type: GRAB_MIME}), () => <GrabCard />))
  }

  test('the card shows the snapshot and its source label', async () => {
    mount()

    await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
    await expect.element(page.getByText('Hero at src/routes/index.tsx:12', {exact: false})).toBeVisible()
  })

  test('clicking the card opens a dialog that can reveal the agent text', async () => {
    mount()

    await userEvent.click(page.getByRole('button', {name: 'Open grabbed element'}))
    await expect.element(page.getByRole('dialog', {name: 'Grabbed element'})).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'What the agent sees'}))

    await expect
      .element(page.getByText('<h1 class="title">Start simple</h1> at src/routes/index.tsx:12:9'))
      .toBeVisible()
  })

  test('a payload with no preview falls back to the agent text', async () => {
    mount(JSON.stringify({text: 'grabbed thing at a.tsx:1:1', source: null, rect: null, preview: null}))

    await expect.element(page.getByText('grabbed thing at a.tsx:1:1')).toBeVisible()
  })

  test('an unreadable payload reports that the grab could not be read', async () => {
    mount('not a grab payload at all')

    await expect.element(page.getByRole('status')).toHaveTextContent('Grabbed element could not be read')
  })

  test('an image preview renders as the snapshot image', async () => {
    mount(
      JSON.stringify({
        text: 'grabbed thing at a.tsx:1:1',
        source: null,
        rect: null,
        preview: {
          kind: 'image',
          dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
          width: 40,
          height: 20,
        },
      }),
    )

    await expect.element(page.getByRole('img', {name: 'Grabbed element snapshot'})).toBeVisible()
  })
})

describe('grab snapshot frame', () => {
  function hostileMarkup(marker: string): string {
    return `<img src="x" onerror="window.parent.document.body.insertAdjacentHTML('beforeend', '<p>${marker}</p>')">`
  }

  test('the snapshot frame renders the markup in its own document', async () => {
    render(() => (
      <GrabSnapshotFrame html="<p>Payroll Deposit clone</p>" width={200} height={40} class="max-w-full block" />
    ))

    await expect.element(page.getByTitle('Grabbed element snapshot')).toBeVisible()
  })

  test('inline handlers in captured markup never run inside the widget', async () => {
    render(() => (
      <>
        <iframe title="Unsandboxed control" srcdoc={hostileMarkup('control escaped')} />
        <GrabSnapshotFrame html={hostileMarkup('snapshot escaped')} width={200} height={40} class="max-w-full block" />
      </>
    ))

    await expect.element(page.getByText('control escaped')).toBeVisible()
    await expect.element(page.getByText('snapshot escaped')).not.toBeInTheDocument()
  })
})

describe('the tanstack cards', () => {
  const widgetSheet = document.createElement('style')
  widgetSheet.textContent = `${tokens}${utilities}`
  beforeAll(() => document.head.append(widgetSheet))
  afterAll(() => widgetSheet.remove())

  type Tool = keyof typeof tanstackCards
  type Case = {
    tool: Tool
    title: string
    input?: Record<string, unknown>
    output: unknown
    summary?: string
    restated?: string
    detail?: string
    single?: string
  }

  const failure = 'tab_unavailable: no TanStack page is attached to this session'

  function routeMatch(routeId: string, search: Record<string, unknown>) {
    const timing = {error: null, loaderData: null, updatedAt: null, isFetching: false}
    return {
      id: routeId,
      routeId,
      path: routeId === '__root__' ? '' : routeId,
      params: {},
      search,
      status: 'success',
      ...timing,
    }
  }

  const routerState = {
    location: {pathname: '/about', search: '?token=%5Bredacted%5D', hash: ''},
    matches: [routeMatch('__root__', {}), routeMatch('/about', {token: '[redacted]'})],
  }

  const routeNode = (id: string, kind: string, hasLoader: boolean) => ({id, path: id, kind, hasLoader, children: []})

  const cases: ReadonlyArray<Case> = [
    {
      tool: 'tanstack_router_state',
      title: 'Read the router state',
      output: routerState,
      summary: '/about · 2 matches',
      detail: '/about?token=%5Bredacted%5D',
    },
    {
      tool: 'tanstack_route_tree',
      title: 'Read the route tree',
      output: {
        ...routeNode('__root__', 'layout', false),
        children: [routeNode('/', 'index', false), routeNode('/about', 'static', true)],
      },
      summary: '3 routes',
      detail: '/about',
    },
    {
      tool: 'tanstack_loader_data',
      title: 'Read the loader data',
      output: {routeId: '/about', data: {greeting: 'hello', visits: 42}},
      summary: '2 keys · /about',
      detail: 'greeting',
      single: '42',
    },
    {
      tool: 'tanstack_query_cache',
      title: 'Read the query cache',
      output: {
        queries: [
          {
            key: '["todos"]',
            state: 'fresh',
            status: 'success',
            value: ['card'],
            updatedAt: Date.now(),
            error: null,
            observers: 1,
          },
          {key: '["todos",2]', state: 'error', status: 'error', value: null, error: 'Request failed with status 500'},
        ],
        mutations: [{key: '["addTodo"]', state: 'fresh', status: 'success', value: null, updatedAt: null}],
      },
      summary: '2 queries · 1 mutation',
      detail: 'Request failed with status 500',
      single: 'queries',
    },
    {
      tool: 'tanstack_query_invalidate',
      title: 'Invalidated a query',
      input: {key: '["todos"]'},
      output: {ok: true},
      summary: '["todos"]',
      restated: 'invalidated ["todos"]',
    },
    {
      tool: 'tanstack_query_refetch',
      title: 'Refetched a query',
      input: {key: '["todos"]'},
      output: {ok: true},
      summary: '["todos"]',
      restated: 'refetched ["todos"]',
    },
    {
      tool: 'tanstack_navigate',
      title: 'Navigated',
      input: {to: '/about'},
      output: {ok: true, to: '/about'},
      summary: '/about',
    },
    {tool: 'tanstack_router_invalidate', title: 'Invalidated the router', output: {ok: true}, restated: 'invalidated'},
    {tool: 'tanstack_back', title: 'Went back', output: {ok: true}, restated: 'went back'},
    {
      tool: 'tanstack_build_errors',
      title: 'Read the build errors',
      output: [
        {
          id: 'build-1',
          kind: 'build',
          message: 'Cannot find module ./missing',
          stack: null,
          source: {file: 'src/routes/about.tsx', line: 4, column: 1},
          digest: null,
          at: 1,
        },
      ],
      summary: '1 error',
      detail: 'src/routes/about.tsx:4',
    },
    {
      tool: 'tanstack_route_manifest',
      title: 'Read the route manifest',
      output: [
        {path: '/', kind: 'page', dynamic: false, file: 'src/routes/index.tsx'},
        {path: '/posts/$id', kind: 'page', dynamic: true, file: 'src/routes/posts.$id.tsx'},
      ],
      summary: '2 routes',
      detail: '/posts/$id',
    },
    {
      tool: 'tanstack_server_fn_trace',
      title: 'Read the server-function calls',
      output: {
        traces: [{id: 'posts-fn', name: 'getPosts', durationMs: 12, status: 'ok', at: 1}],
        functions: [{id: 'posts-fn', name: 'getPosts', route: '/posts', file: 'src/server/posts.ts'}],
      },
      summary: '1 call',
      detail: 'src/server/posts.ts',
    },
  ]

  const lookupCard = (name: string) => ({render: Object.entries(tanstackCards).find(([tool]) => tool === name)?.[1]})

  function mountCard(
    tool: Tool,
    input: Record<string, unknown>,
    settled?: {output: string; status: 'completed' | 'error'},
  ) {
    const [props, setProps] = createStore<ToolProps>({
      tool,
      input,
      metadata: {},
      status: settled?.status ?? 'running',
      output: settled?.status === 'completed' ? settled.output : undefined,
      error: settled?.status === 'error' ? settled.output : undefined,
    })
    render(() => <ToolDisplay id={`call-${tool}`} render={lookupCard} {...props} />)
    return setProps
  }

  const header = (title: string) => page.getByRole('button', {name: new RegExp(title)})
  const exactText = (text: string) => page.getByText(text, {exact: true})

  it("draws each tool's card on success, the error state, and the running row before the card", async () => {
    onTestFinished(cleanup)
    for (const call of cases) {
      mountCard(call.tool, call.input ?? {}, {output: JSON.stringify(call.output), status: 'completed'})
      await expect.element(header(call.title)).toBeVisible()
      if (call.summary !== undefined) await expect.element(exactText(call.summary)).toBeVisible()
      if (call.restated !== undefined) await expect.element(exactText(call.restated)).not.toBeInTheDocument()
      if (call.detail !== undefined) {
        await header(call.title).click()
        await expect.element(exactText(call.detail)).toBeVisible()
      }
      if (call.single !== undefined) await expect.element(exactText(call.single)).toBeVisible()
      cleanup()
    }

    const markers = {
      items: {__conciv: 'array', size: 3, preview: 'Array(3)'},
      lookup: {__conciv: 'Map', size: 2, preview: 'Map(2)'},
    }
    mountCard(
      'tanstack_loader_data',
      {},
      {output: JSON.stringify({routeId: '/about', data: markers}), status: 'completed'},
    )
    await header('Read the loader data').click()
    await expect.element(exactText('Array(3)')).toBeVisible()
    await expect.element(exactText('Map(2)')).toBeVisible()
    await expect.element(page.getByText(/__conciv/)).not.toBeInTheDocument()
    cleanup()

    mountCard('tanstack_back', {}, {output: JSON.stringify({ok: true}), status: 'completed'})
    await expect.element(header('Went back')).toBeDisabled()
    cleanup()

    mountCard('tanstack_router_state', {}, {output: failure, status: 'error'})
    await expect.element(page.getByRole('img', {name: 'error'})).toBeVisible()
    await header('tanstack_router_state').click()
    await expect.element(page.getByText(failure)).toBeVisible()
    await expect.element(exactText('/about · 2 matches')).not.toBeInTheDocument()
    cleanup()

    const finish = mountCard('tanstack_router_state', {})
    await expect.element(header('Reading the router state')).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'running'})).toBeVisible()
    await expect.element(exactText('/about · 2 matches')).not.toBeInTheDocument()
    finish({status: 'completed', output: JSON.stringify(routerState)})
    await expect.element(exactText('/about · 2 matches')).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'succeeded'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'running'})).not.toBeInTheDocument()
    cleanup()

    const approve = mountCard('tanstack_router_state', {})
    approve({status: 'pending'})
    await expect.element(header('Reading the router state')).toBeVisible()
  })
})

describe('the recorder cards', () => {
  const widgetSheet = document.createElement('style')
  widgetSheet.textContent = `${tokens}${utilities}`
  beforeAll(() => document.head.append(widgetSheet))
  afterAll(() => widgetSheet.remove())

  type Tool = keyof typeof recorderCards

  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const keyframe = {type: 'image', source: {type: 'data', value: PNG_1PX, mimeType: 'image/png'}}
  const log = '+0.0s [click] button "Save"\n+2.5s [navigation] /settings\n+4.1s [console] error: boom'

  const lookupRecorderCard = (name: string) => Object.entries(recorderCards).find(([tool]) => tool === name)?.[1]

  function RecorderCard(props: {tool: Tool; input: Record<string, unknown>; output: string; failed?: boolean}) {
    return (
      <ToolDisplay
        id={`call-${props.tool}`}
        render={lookupRecorderCard}
        tool={props.tool}
        input={props.input}
        metadata={{}}
        status={props.failed === true ? 'error' : 'completed'}
        output={props.failed === true ? undefined : props.output}
        error={props.failed === true ? props.output : undefined}
      />
    )
  }

  function mountCard(tool: Tool, input: Record<string, unknown>, output: string, failed?: boolean) {
    render(() => <RecorderCard tool={tool} input={input} output={output} failed={failed} />)
  }

  const header = (tool: Tool) => page.getByRole('button', {name: new RegExp(tool)})

  it('draws the pull window and its actions, the started capture, a failed stop, and the summary inside a trace', async () => {
    onTestFinished(cleanup)
    mountCard(
      'recording_pull',
      {secondsBack: 30, keyframes: 3},
      JSON.stringify([keyframe, keyframe, {type: 'text', content: log}]),
    )
    await expect.element(page.getByText('last 30s · 3 actions · 2 keyframes', {exact: true})).toBeVisible()
    await header('recording_pull').click()
    await expect.element(page.getByText('button "Save"')).toBeVisible()
    await expect.element(page.getByText('navigation', {exact: true})).toBeVisible()
    cleanup()

    mountCard('recording_start', {}, JSON.stringify({captureId: 'cap_1', startedAt: 1}))
    await expect.element(page.getByText('capture started', {exact: true})).toBeVisible()
    await header('recording_start').click()
    await expect.element(page.getByText('cap_1', {exact: true})).toBeVisible()
    cleanup()

    mountCard('recording_stop', {captureId: 'cap_9', keyframes: 0}, 'no active capture cap_9', true)
    await expect.element(page.getByRole('img', {name: 'failed'})).toBeVisible()
    await header('recording_stop').click()
    await expect.element(page.getByText('Error', {exact: true})).toBeVisible()
    await expect.element(page.getByText('no active capture cap_9')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Copy error'})).not.toBeInTheDocument()
    cleanup()

    render(() => (
      <CardChromeProvider value="embedded">
        <RecorderCard
          tool="recording_pull"
          input={{secondsBack: 30, keyframes: 3}}
          output={JSON.stringify([keyframe, {type: 'text', content: log}])}
        />
      </CardChromeProvider>
    ))
    await expect.element(page.getByText('last 30s · 3 actions · 1 keyframe', {exact: true})).toBeVisible()
  })
})

describe('the page tab the agent sees', () => {
  const tabId = `tab_${crypto.randomUUID()}`

  function keepLocation() {
    const href = location.href
    const title = document.title
    onTestFinished(() => {
      history.replaceState(null, '', href)
      document.title = title
    })
  }

  it('hides secret search, hash and router path values and keeps the rest', async () => {
    keepLocation()
    history.replaceState(null, '', '/shop?token=abc&q=shoes#access_token=xyz')
    const url = new URL(readTab(tabId).url)
    expect({
      path: url.origin + url.pathname,
      search: [...url.searchParams],
      hash: [...new URLSearchParams(url.hash.slice(1))],
    }).toEqual({
      path: `${location.origin}/shop`,
      search: [
        ['token', '[redacted]'],
        ['q', 'shoes'],
      ],
      hash: [['access_token', '[redacted]']],
    })

    history.replaceState(null, '', '/reset/param-secret-value')
    installReactBridge()
    const rootRoute = createRootRoute()
    const resetRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/reset/$token',
      component: () => createElement('h1', null, 'Reset password'),
    })
    const router = createRouter({routeTree: rootRoute.addChildren([resetRoute])})
    const mount = document.createElement('div')
    document.body.append(mount)
    const reactRoot = createRoot(mount)
    reactRoot.render(createElement(RouterProvider, {router}))
    onTestFinished(() => {
      reactRoot.unmount()
      mount.remove()
    })
    await expect.element(page.getByRole('heading', {name: 'Reset password'})).toBeVisible()
    const routed = new URL(readTab(tabId).url)
    expect(routed.pathname).toBe('/reset/[redacted]')
    expect(routed.href).not.toContain('param-secret-value')
  })

  it('fits a very long url and title inside the rpc caps', () => {
    keepLocation()
    history.replaceState(null, '', `/long?q=${'a'.repeat(20_000)}`)
    document.title = 't'.repeat(5_000)
    const read = readTab(tabId)
    expect(Tab.safeParse(read).success).toBe(true)
    expect(read.url.startsWith(`${location.origin}/long?q=aaa`)).toBe(true)
  })

  it('reports again after a pushState navigation and a title change', async () => {
    keepLocation()
    const controller = new AbortController()
    onTestFinished(() => controller.abort())
    const reported = {current: Promise.withResolvers<void>()}
    reportChanges(() => reported.current.resolve(), controller.signal)

    history.pushState(null, '', '/next')
    await reported.current.promise
    expect(readTab(tabId).url).toBe(`${location.origin}/next`)

    reported.current = Promise.withResolvers<void>()
    document.title = 'the next page'
    await reported.current.promise
    expect(readTab(tabId).title).toBe('the next page')
  })
})
