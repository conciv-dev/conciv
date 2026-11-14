import {afterAll, beforeAll, describe, expect, it, onTestFinished, vi} from 'vitest'
import {page, server, userEvent} from 'vitest/browser'
import {render} from '@solidjs/testing-library'
import {createSignal} from 'solid-js'
import {installReactBridge} from '@conciv/page'
import {Menu} from '@conciv/ui-kit-system'
import {z} from 'zod'
import {CHAT_FONTS} from '@conciv/ui-kit-chat/theme/fonts'
import {createElement, Fragment} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {Editor} from '@tiptap/core'
import {Document} from '@tiptap/extension-document'
import {Paragraph} from '@tiptap/extension-paragraph'
import {Text} from '@tiptap/extension-text'
import {makePageOperations, type PageOperations} from '../src/page/operations.js'
import {Command, Operations, type Outcome} from '../src/page/rpc.js'
import {watchHotUpdates, type HotSurface} from '../src/page/hmr.js'
import {endTask, mountSimulator, startTask} from '../src/page/simulator.js'
import {aimCursor, CursorLook, dropCursor, windowAt} from '../src/page/agent-cursor.js'
import {ControlledForm, FixtureApp} from './fixtures/react-app.js'

const inFirefox = server.browser === 'firefox'

const noContributions = {list: () => []}

const JsonRecord = z.record(z.string(), z.unknown())

function command(verb: string, input: Record<string, unknown>, agentId = 'test-agent'): Command {
  return Command.parse({action: {type: verb, ...input}, agentId, timeoutMs: 5000})
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
    driver = makePageOperations(noContributions)
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
      await runForResult('settext', {selector: '#prose', text: 'rewritten'})
      expect(document.querySelector('#prose')?.textContent).toBe('rewritten')
      await runForResult('insert', {selector: '#prose', html: '<em id="added">x</em>', position: 'after'})
      expect(document.querySelector('#added')).not.toBeNull()
      await runForResult('remove', {selector: '#added'})
      expect(document.querySelector('#added')).toBeNull()
    })

    it('reports route, existence, and query matches', async () => {
      document.title = 'Settings'
      expect(await runForResult('route')).toMatchObject({
        pathname: location.pathname,
        title: 'Settings',
        state: 'visible',
      })
      expect(await runForResult('exists', {selector: '#frm'})).toEqual({exists: true, count: 1})
      const query = await runForResult('query', {selector: 'input'})
      expect(query.count).toBe(8)
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
    })

    it('returns the value of a bare expression and still runs a statement body', async () => {
      expect(await runForResult('eval', {code: '2 + 3'})).toEqual({result: 5})
      expect(await runForResult('eval', {code: 'document.querySelector("#frm").tagName'})).toEqual({result: 'FORM'})
      expect(await runForResult('eval', {code: 'const a = 1; return a + 1'})).toEqual({result: 2})
      const element = await runForResult('eval', {code: 'return document.querySelector("#frm")'})
      expect(element.result).toMatchObject({tagName: 'form'})
    })

    it('injects css stylesheets', async () => {
      expect(await runForResult('css', {text: '#prose{letter-spacing:3px}'})).toEqual({ok: true})
      expect(document.querySelector('style[data-vibe-css]')?.textContent).toContain('letter-spacing')
    })
  })

  describe('react verbs through the dispatcher', () => {
    it('inspects a component and navigates into its props by path', async () => {
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
    const driver = makePageOperations(noContributions)
    onTestFinished(() => driver.dispose())
    console.log('console-marker-inclusive')
    const marker = (await consoleRead(driver)).find((entry) => entry.text === 'console-marker-inclusive')
    if (!marker) throw new Error('the console buffer did not record the marker')
    const texts = async (since: number) => (await consoleRead(driver, since)).map((entry) => entry.text)
    expect(await texts(marker.ts)).toContain('console-marker-inclusive')
    expect(await texts(marker.ts + 1)).not.toContain('console-marker-inclusive')
  })

  it('records what the page threw, uncaught or unhandled, with its message and where it came from', async () => {
    const driver = makePageOperations(noContributions)
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
    const driver = makePageOperations(noContributions)
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
    const driver = makePageOperations(noContributions)
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
