import 'virtual:uno.css'
import {afterEach, describe, expect, it, test, onTestFinished} from 'vitest'
import {fitHeight, measureTextArea} from '../src/autosize.js'
import {createSignal, For, createRoot} from 'solid-js'
import {render} from '@solidjs/testing-library'
import {page, userEvent} from 'vitest/browser'
import {createClipboardCopy} from '../src/clipboard.js'
import {ClipboardCopyButton} from '../src/clipboard-copy-button.js'
import {Dialog} from '../src/dialog.js'
import {cleanupMounts, mountStyled, mountInShadow} from './dialog-harness.js'
import {EnvironmentProvider} from '../src/environment.js'
import {createResizable, type Grow} from '../src/resize.js'
import {SKINS, type SkinName} from '../src/skins.js'
import type {SchemePair, Skin} from '../src/skin-contract.js'
import {contrastRatio, type SkinSchemeAnchorName} from './wcag.js'
import {TextArea} from '../src/text-field.js'
import {Menu} from '../src/menu.js'
import {TooltipIconButtonSlot} from '../src/tooltip-icon-button.js'
import {TruncatedText} from '../src/truncated-text.js'
import ChevronRight from 'lucide-solid/icons/chevron-right'
import {VirtualJsonTree} from '../src/virtual-json-tree.js'

describe('autosize', () => {
  const containers: HTMLElement[] = []

  function mount(css: string, value: string): HTMLTextAreaElement {
    const host = document.createElement('div')
    host.style.width = '300px'
    document.body.appendChild(host)
    containers.push(host)
    const area = document.createElement('textarea')
    area.style.cssText = `box-sizing:border-box;width:100%;resize:none;${css}`
    area.value = value
    host.appendChild(area)
    return area
  }

  afterEach(() => {
    for (const host of containers.splice(0)) host.remove()
  })

  describe('fitHeight', () => {
    const metrics = {rowHeight: 20, padding: 16, border: 2, borderBox: true}

    it('clamps to minRows when the content is shorter', () => {
      expect(fitHeight(20, metrics, 2, 5)).toEqual({height: 58, overflowY: 'hidden'})
    })

    it('grows with the content between the bounds', () => {
      expect(fitHeight(76, metrics, 1, 5)).toEqual({height: 78, overflowY: 'hidden'})
    })

    it('clamps to maxRows and scrolls once the content exceeds it', () => {
      expect(fitHeight(200, metrics, 1, 5)).toEqual({height: 118, overflowY: 'auto'})
    })

    it('subtracts padding instead of adding border under content-box', () => {
      const contentBox = {...metrics, borderBox: false}
      expect(fitHeight(76, contentBox, 1, 5)).toEqual({height: 60, overflowY: 'hidden'})
    })
  })

  describe('measureTextArea', () => {
    it('reports the padding, border and box model of the element', () => {
      const area = mount('padding:8px 12px;border:1px solid black;font:13px/20px monospace', '')
      const metrics = measureTextArea(area)
      expect(metrics).toMatchObject({padding: 16, border: 2, borderBox: true, rowHeight: 20})
    })

    it('measures a real row when line-height is normal', () => {
      const area = mount('padding:0;border:0;font:13px monospace;line-height:normal', '')
      const reference = mount('padding:0;border:0;font:13px monospace;line-height:normal', 'x')
      reference.rows = 1
      reference.style.height = 'auto'
      expect(measureTextArea(area).rowHeight).toBeCloseTo(reference.scrollHeight, 0)
      expect(measureTextArea(area).rowHeight).not.toBe(20)
    })
  })

  describe('TextArea sizing end to end', () => {
    it('never clips its content and honours maxRows with line-height normal', () => {
      const css = 'padding:8px 12px;border:1px solid black;font:13px monospace;line-height:normal'
      const area = mount(css, 'one\ntwo\nthree\nfour\nfive\nsix')
      const metrics = measureTextArea(area)
      const {height, overflowY} = fitHeight(area.scrollHeight, metrics, 1, 2)
      area.style.height = `${height}px`
      area.style.overflowY = overflowY

      const twoRows = mount(css, 'one\ntwo')
      twoRows.style.height = 'auto'
      const {height: twoRowHeight} = fitHeight(twoRows.scrollHeight, measureTextArea(twoRows), 1, 2)

      expect(height).toBeCloseTo(twoRowHeight, 0)
      expect(overflowY).toBe('auto')
    })

    it('fits exactly, leaving no dead space, when the content is under maxRows', () => {
      const area = mount('padding:8px 12px;border:1px solid black;font:13px/20px monospace', 'one\ntwo\nthree')
      const {height} = fitHeight(area.scrollHeight, measureTextArea(area), 1, 5)
      area.style.height = `${height}px`
      expect(area.scrollHeight).toBe(area.clientHeight)
    })
  })
})

describe('clipboard', () => {
  const TEXT = 'npx @conciv/try --token abc123'
  const RESET_MS = 400

  function accept(written: string[]): (text: string) => Promise<void> {
    return (text) => {
      written.push(text)
      return Promise.resolve()
    }
  }

  const refuse = (): Promise<void> => Promise.reject(new Error('the document is not focused'))

  const copyButton = () => page.getByRole('button', {name: 'Copy'})

  const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  const throwSync = (): Promise<void> => {
    throw new Error('navigator.clipboard is unavailable in this context')
  }

  function Harness(props: {writeText: (text: string) => Promise<void>}) {
    const clipboard = createClipboardCopy({
      text: () => TEXT,
      resetMs: () => RESET_MS,
      writeText: (text) => props.writeText(text),
    })
    return (
      <>
        <button type="button" onClick={clipboard.copy}>
          Copy
        </button>
        <p>status {clipboard.status()}</p>
        <p role="status" aria-live="polite">
          {clipboard.announcement()}
        </p>
      </>
    )
  }

  async function copyOnce(writeText: (text: string) => Promise<void>): Promise<void> {
    render(() => <Harness writeText={writeText} />)
    await copyButton().click()
  }

  async function copyOnceWithButton(writeText: (text: string) => Promise<void>): Promise<void> {
    render(() => <ClipboardCopyButton text={TEXT} resetMs={RESET_MS} writeText={writeText} />)
    await copyButton().click()
  }

  it('hands the text to the clipboard and reports the copy landed', async () => {
    const written: string[] = []
    await copyOnce(accept(written))

    await expect.element(page.getByText('status copied')).toBeInTheDocument()
    expect(written).toEqual([TEXT])
  })

  it('falls back to idle once the copied window runs out', async () => {
    await copyOnce(accept([]))
    await expect.element(page.getByText('status copied')).toBeInTheDocument()

    await expect.element(page.getByText('status idle'), {timeout: RESET_MS * 6}).toBeInTheDocument()
  })

  it('reports a failure instead of pretending the copy worked when the clipboard refuses', async () => {
    await copyOnce(refuse)

    await expect.element(page.getByText('status failed')).toBeInTheDocument()
  })

  it('reports a failure when the clipboard write throws instead of rejecting', async () => {
    await copyOnce(throwSync)

    await expect.element(page.getByText('status failed')).toBeInTheDocument()
  })

  it('re-arms the copied window when the same text is copied again', async () => {
    await copyOnce(accept([]))
    await expect.element(page.getByText('status copied')).toBeInTheDocument()

    await pause(RESET_MS * 0.7)
    await copyButton().click()
    await pause(RESET_MS * 0.6)

    await expect.element(page.getByText('status copied')).toBeInTheDocument()
  })

  it('announces the copy through a live region so a pointer user hears it too', async () => {
    await copyOnce(accept([]))

    await expect.element(page.getByRole('status')).toHaveTextContent('Copied to clipboard')
  })

  it('announces a refusal through the live region', async () => {
    await copyOnce(refuse)

    await expect.element(page.getByRole('status')).toHaveTextContent('Could not copy to clipboard')
  })

  it('renames the copy button to Copied while the copy is fresh', async () => {
    const written: string[] = []
    await copyOnceWithButton(accept(written))

    await expect.element(page.getByRole('button', {name: 'Copied'})).toBeVisible()
    expect(written).toEqual([TEXT])
  })

  it('renames the copy button to Copy failed when the clipboard refuses', async () => {
    await copyOnceWithButton(refuse)

    await expect.element(page.getByRole('button', {name: 'Copy failed'})).toBeVisible()
  })

  it('announces the copy button result in its own live region', async () => {
    await copyOnceWithButton(accept([]))

    await expect.element(page.getByRole('status')).toHaveTextContent('Copied to clipboard')
  })

  it('takes keyboard focus with a visible focus ring', async () => {
    render(() => <ClipboardCopyButton text={TEXT} resetMs={RESET_MS} writeText={accept([])} />)
    const button = copyButton()

    await userEvent.tab()

    await expect.element(button).toHaveFocus()
    expect(button.element().matches(':focus-visible')).toBe(true)
  })

  it('tells the caller when a copy landed so the caller can advance its own flow', async () => {
    function View() {
      const [told, setTold] = createSignal('')
      return (
        <>
          <ClipboardCopyButton
            text={TEXT}
            resetMs={RESET_MS}
            writeText={accept([])}
            onCopied={() => setTold('the caller was told')}
          />
          <p>{told()}</p>
        </>
      )
    }
    render(() => <View />)

    await copyButton().click()

    await expect.element(page.getByText('the caller was told')).toBeVisible()
  })
})

describe('dialog layout', () => {
  const ROWS = Array.from({length: 60}, (_, index) => `session ${index}`)
  const LONG_COMMAND = `claude --resume ${'abcdefghij'.repeat(40)}`

  afterEach(() => {
    cleanupMounts()
  })

  function scrollableAncestors(from: Element, stop: Element): Element[] {
    const chain: Element[] = []
    for (let node: Element | null = from; node !== null && node !== stop.parentElement; node = node.parentElement) {
      chain.push(node)
    }
    return chain
  }

  it('keeps the footer and the last row reachable when the content is taller than the viewport', async () => {
    const clicked: string[] = []
    mountStyled(() => (
      <Dialog
        open
        title="Connect a running session"
        footer={
          <button type="button" onClick={() => clicked.push('done')}>
            Done
          </button>
        }
      >
        <For each={ROWS}>{(row) => <p>{row}</p>}</For>
        <button type="button" onClick={() => clicked.push('last')}>
          Follow the last session
        </button>
      </Dialog>
    ))

    await userEvent.click(page.getByRole('button', {name: 'Follow the last session'}))
    await userEvent.click(page.getByRole('button', {name: 'Done'}))

    expect(clicked).toEqual(['last', 'done'])
  })

  it('scrolls a long command sideways inside the dialog instead of widening the layout', async () => {
    const host = mountStyled(() => (
      <Dialog open title="Connect a running session">
        <code>{LONG_COMMAND}</code>
      </Dialog>
    ))
    await expect.element(page.getByText(LONG_COMMAND)).toBeVisible()

    const command = host.querySelector('code')
    const content = page.getByRole('dialog').element()
    const layerBehind = content.parentElement
    if (command === null) throw new Error('the dialog rendered no command')
    if (layerBehind === null) throw new Error('the dialog rendered no layer behind it')
    const scrolled = scrollableAncestors(command, content).map((element) => {
      element.scrollLeft = 400
      return element.scrollLeft
    })
    layerBehind.scrollLeft = 400

    expect(scrolled.some((offset) => offset > 0)).toBe(true)
    expect(layerBehind.scrollLeft).toBe(0)
  })
})

describe('dialog', () => {
  const LAYERING = '.fixed{position:fixed}.inset-0{inset:0}'

  const styleDisposers: (() => void)[] = []
  const hosts: HTMLElement[] = []
  const frameRestorers: (() => void)[] = []

  function mount(dismissable: boolean): void {
    const style = document.createElement('style')
    style.textContent = LAYERING
    document.head.appendChild(style)
    styleDisposers.push(() => style.remove())
    const [closes, setCloses] = createSignal<boolean[]>([])
    render(() => (
      <Dialog
        open
        onOpenChange={(open) => setCloses((asked) => [...asked, open])}
        dismissable={dismissable}
        label="Sample dialog"
      >
        <p>a body of text</p>
        <ul>
          <For each={closes()}>{(open) => <li>asked to close, open {String(open)}</li>}</For>
        </ul>
      </Dialog>
    ))
  }

  const closeRequests = (): string[] =>
    page
      .getByRole('listitem')
      .elements()
      .map((item) => item.textContent ?? '')

  const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const nextTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))

  async function waitForOutsideDismissToArm(): Promise<void> {
    await nextFrame()
    await nextFrame()
    await nextTask()
  }

  function starveFrames(delay: number): void {
    const original = window.requestAnimationFrame
    const pending: number[] = []
    window.requestAnimationFrame = (callback) =>
      original(() => {
        pending.push(window.setTimeout(() => callback(performance.now()), delay))
      })
    frameRestorers.push(() => {
      window.requestAnimationFrame = original
      for (const timer of pending.splice(0)) window.clearTimeout(timer)
    })
  }

  async function clickBehindTheDialog(): Promise<void> {
    await waitForOutsideDismissToArm()
    const content = page.getByRole('dialog').element()
    const positioner = content.parentElement
    if (!(positioner instanceof HTMLElement)) throw new Error('the dialog rendered no layer behind it')
    const layer = positioner.getBoundingClientRect()
    const away = content.getBoundingClientRect().bottom + 40
    await userEvent.click(page.elementLocator(positioner), {
      position: {x: 8, y: Math.min(away, layer.height - 8)},
      force: true,
    })
  }

  afterEach(() => {
    for (const restore of frameRestorers.splice(0)) restore()
    for (const dispose of styleDisposers.splice(0)) dispose()
    for (const host of hosts.splice(0)) host.remove()
    cleanupMounts()
  })

  it('lets escape close a dismissable dialog', async () => {
    mount(true)
    await expect.element(page.getByText('a body of text')).toBeVisible()

    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByText('asked to close, open false')).toBeVisible()
    expect(closeRequests()).toEqual(['asked to close, open false'])
  })

  it('lets a click behind the dialog close a dismissable dialog', async () => {
    mount(true)
    await expect.element(page.getByText('a body of text')).toBeVisible()

    await clickBehindTheDialog()
    await expect.element(page.getByText('asked to close, open false')).toBeVisible()
    expect(closeRequests()).toEqual(['asked to close, open false'])
  })

  it('still closes on a click behind it when the browser starves the arming frames', async () => {
    starveFrames(150)
    mount(true)
    await expect.element(page.getByText('a body of text')).toBeVisible()

    await clickBehindTheDialog()
    await expect.element(page.getByText('asked to close, open false')).toBeVisible()
    expect(closeRequests()).toEqual(['asked to close, open false'])
  })

  it('holds a non-dismissable dialog open through escape and clicks behind it', async () => {
    mount(false)
    await expect.element(page.getByText('a body of text')).toBeVisible()

    await userEvent.keyboard('{Escape}')
    await clickBehindTheDialog()
    await expect.element(page.getByText('a body of text')).toBeVisible()
    expect(closeRequests()).toEqual([])
  })

  it('announces itself as a plain dialog unless the caller asks for an interrupt', async () => {
    mountStyled(() => (
      <Dialog open title="Connect a running session">
        <p>a body of text</p>
      </Dialog>
    ))

    await expect.element(page.getByRole('dialog')).toBeVisible()
  })

  it('announces itself as an alertdialog when the caller asks for an interrupt', async () => {
    mountStyled(() => (
      <Dialog open role="alertdialog" title="Stop this run?">
        <p>a body of text</p>
      </Dialog>
    ))

    await expect.element(page.getByRole('alertdialog')).toBeVisible()
  })

  it('takes its accessible name from the visible heading', async () => {
    mountStyled(() => (
      <Dialog open title="Connect a running session">
        <p>a body of text</p>
      </Dialog>
    ))

    await expect.element(page.getByRole('heading', {name: 'Connect a running session'})).toBeVisible()
    await expect.element(page.getByRole('dialog', {name: 'Connect a running session'})).toBeVisible()
  })

  it('moves focus to the element the caller nominates, inside a shadow root', async () => {
    const shadow = mountInShadow((root) => (
      <EnvironmentProvider value={() => root}>
        <Dialog open title="Connect a running session" initialFocus={() => root.querySelector<HTMLElement>('.pick')}>
          <button type="button" class="pick">
            Pick this session
          </button>
          <button type="button">Cancel</button>
        </Dialog>
      </EnvironmentProvider>
    ))

    await expect.element(page.elementLocator(shadow.host)).toHaveFocus()
    expect(shadow.activeElement?.textContent?.trim()).toBe('Pick this session')
  })

  it('gives focus back to the opener when it closes, inside a shadow root', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open'
    document.body.appendChild(opener)
    hosts.push(opener)
    opener.focus()
    const [open, setOpen] = createSignal(true)

    const shadow = mountInShadow((root) => (
      <EnvironmentProvider value={() => root}>
        <Dialog open={open()} onOpenChange={setOpen} title="Connect a running session">
          <button type="button">Pick this session</button>
        </Dialog>
      </EnvironmentProvider>
    ))
    await expect.element(page.elementLocator(shadow.host)).toHaveFocus()
    expect(shadow.activeElement?.textContent?.trim()).toBe('Pick this session')

    setOpen(false)
    await expect.element(page.getByRole('button', {name: 'Open'})).toHaveFocus()
  })
})

describe('resize', () => {
  const press = (key: string): KeyboardEvent => new KeyboardEvent('keydown', {key, cancelable: true})

  function withResizable<T>(
    opts: {grow: Grow; initial?: number; min?: number; storageKey: string},
    run: (r: ReturnType<typeof createResizable>) => T,
  ): T {
    return createRoot((dispose) => {
      const resizable = createResizable({
        initial: opts.initial ?? 200,
        min: opts.min ?? 100,
        storageKey: opts.storageKey,
        grow: () => opts.grow,
      })
      const result = run(resizable)
      dispose()
      return result
    })
  }

  describe('createResizable keyboard resizing', () => {
    const cases: {grow: Grow; growKey: string; shrinkKey: string}[] = [
      {grow: 'right', growKey: 'ArrowRight', shrinkKey: 'ArrowLeft'},
      {grow: 'left', growKey: 'ArrowLeft', shrinkKey: 'ArrowRight'},
      {grow: 'down', growKey: 'ArrowDown', shrinkKey: 'ArrowUp'},
      {grow: 'up', growKey: 'ArrowUp', shrinkKey: 'ArrowDown'},
    ]

    for (const {grow, growKey, shrinkKey} of cases) {
      it(`grow=${grow}: ${growKey} grows, ${shrinkKey} shrinks, both prevent default`, () => {
        withResizable({grow, storageKey: `test-resize-${grow}`}, (r) => {
          const growEvent = press(growKey)
          r.onKeyDown(growEvent)
          expect(r.size()).toBe(224)
          expect(growEvent.defaultPrevented).toBe(true)
          const shrinkEvent = press(shrinkKey)
          r.onKeyDown(shrinkEvent)
          expect(r.size()).toBe(200)
          expect(shrinkEvent.defaultPrevented).toBe(true)
        })
      })
    }

    it('ignores cross-axis and unrelated keys', () => {
      withResizable({grow: 'right', storageKey: 'test-resize-cross'}, (r) => {
        for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'a']) {
          const event = press(key)
          r.onKeyDown(event)
          expect(r.size()).toBe(200)
          expect(event.defaultPrevented).toBe(false)
        }
      })
    })

    it('clamps shrinking at min', () => {
      withResizable({grow: 'right', initial: 110, min: 100, storageKey: 'test-resize-clamp'}, (r) => {
        r.onKeyDown(press('ArrowLeft'))
        expect(r.size()).toBe(100)
        r.onKeyDown(press('ArrowLeft'))
        expect(r.size()).toBe(100)
      })
    })

    it('persists the keyboard-set size for the next instance', () => {
      const storageKey = `test-resize-persist-${Date.now()}`
      withResizable({grow: 'down', storageKey}, (r) => {
        r.onKeyDown(press('ArrowDown'))
        expect(r.size()).toBe(224)
      })
      withResizable({grow: 'down', storageKey}, (r) => {
        expect(r.size()).toBe(224)
      })
    })

    it('clamps the initial size to max, so a restored value never exceeds the current cap', () => {
      createRoot((dispose) => {
        const resizable = createResizable({
          initial: 300,
          min: 100,
          max: () => 220,
          storageKey: 'test-resize-initial-max-clamp',
          grow: () => 'right',
        })
        expect(resizable.size()).toBe(220)
        dispose()
      })
    })

    it('lets a lower max cap win even when it falls below min', () => {
      createRoot((dispose) => {
        const resizable = createResizable({
          initial: 300,
          min: 400,
          max: () => 380,
          storageKey: 'test-resize-max-below-min',
          grow: () => 'right',
        })
        expect(resizable.size()).toBe(380)
        dispose()
      })
    })
  })
})

describe('skin contrast', () => {
  const SCHEMES = ['light', 'dark'] as const

  const BODY_TEXT_MINIMUM = 4.5
  const NON_TEXT_MINIMUM = 3

  const BODY_INK: SkinSchemeAnchorName[] = ['chat-text', 'chat-text-hi', 'chat-text-2']
  const FAINT_INK: SkinSchemeAnchorName[] = ['chat-text-3', 'chat-dim']
  const STATUS: SkinSchemeAnchorName[] = ['chat-accent', 'chat-danger', 'chat-success', 'chat-warn']
  const BACKDROPS: SkinSchemeAnchorName[] = ['chat-panel', 'chat-ground']

  const skinNames = Object.keys(SKINS).filter((name): name is SkinName => name in SKINS)

  function half(pair: SchemePair, scheme: (typeof SCHEMES)[number]): string {
    return scheme === 'light' ? pair.light : pair.dark
  }

  function ratio(
    skin: Skin,
    scheme: (typeof SCHEMES)[number],
    ink: SkinSchemeAnchorName,
    surface: SkinSchemeAnchorName,
  ): number {
    return contrastRatio(half(skin.pairs[ink], scheme), half(skin.pairs[surface], scheme))
  }

  describe.each(skinNames)('the %s skin meets WCAG contrast on every colour pair', (name) => {
    const skin = SKINS[name]

    describe.each(SCHEMES)('in the %s scheme', (scheme) => {
      test.each(BODY_INK.flatMap((ink) => BACKDROPS.map((surface) => [ink, surface] as const)))(
        'body ink %s reads on %s',
        (ink, surface) => {
          expect(ratio(skin, scheme, ink, surface)).toBeGreaterThanOrEqual(BODY_TEXT_MINIMUM)
        },
      )

      test.each(FAINT_INK.flatMap((ink) => BACKDROPS.map((surface) => [ink, surface] as const)))(
        'faint ink %s reads on %s',
        (ink, surface) => {
          expect(ratio(skin, scheme, ink, surface)).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
        },
      )

      test.each(STATUS.flatMap((ink) => BACKDROPS.map((surface) => [ink, surface] as const)))(
        'status colour %s is distinguishable on %s',
        (ink, surface) => {
          expect(ratio(skin, scheme, ink, surface)).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
        },
      )

      test('ink on an accent fill reads', () => {
        expect(ratio(skin, scheme, 'chat-on-accent', 'chat-accent')).toBeGreaterThanOrEqual(BODY_TEXT_MINIMUM)
      })

      test('the focus ring separates from the panel it floats over', () => {
        expect(ratio(skin, scheme, 'chat-accent', 'chat-panel')).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
      })
    })
  })
})

describe('text field', () => {
  const NEWLINES2 = 'one\ntwo'
  const NEWLINES3 = 'one\ntwo\nthree'
  const NEWLINES5 = 'one\ntwo\nthree\nfour\nfive'

  function mount(width: string, ui: () => ReturnType<typeof TextArea>): {host: HTMLElement; area: HTMLTextAreaElement} {
    const host = document.createElement('div')
    host.style.width = width
    document.body.appendChild(host)
    render(ui, {container: host})
    const area = host.querySelector('textarea')
    if (!area) throw new Error('TextArea did not render a textarea')
    area.style.width = '100%'
    return {host, area}
  }

  const settle = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  describe('TextArea autosize', () => {
    it('fits a single row on mount and reports the height it set', () => {
      const heights: number[] = []
      const {area} = mount('300px', () => <TextArea value="one" onHeightChange={(h) => heights.push(h)} />)
      expect(area.scrollHeight).toBe(area.clientHeight)
      expect(heights).toEqual([Number.parseFloat(area.style.height)])
    })

    it('grows to fit wrapped content without clipping it', () => {
      const {area} = mount('300px', () => <TextArea value={NEWLINES3} maxRows={5} />)
      expect(area.scrollHeight).toBe(area.clientHeight)
      expect(area.style.overflowY).toBe('hidden')
    })

    it('stops at maxRows and scrolls instead of clipping', () => {
      const short = mount('300px', () => <TextArea value={NEWLINES2} maxRows={2} />)
      const tall = mount('300px', () => <TextArea value={NEWLINES5} maxRows={2} />)
      expect(tall.area.clientHeight).toBe(short.area.clientHeight)
      expect(tall.area.style.overflowY).toBe('auto')
      expect(tall.area.scrollHeight).toBeGreaterThan(tall.area.clientHeight)
    })

    it('never drops below minRows', () => {
      const one = mount('300px', () => <TextArea value="" minRows={1} />)
      const three = mount('300px', () => <TextArea value="" minRows={3} />)
      expect(three.area.clientHeight).toBeGreaterThan(one.area.clientHeight)
      expect(three.area.style.overflowY).toBe('hidden')
    })

    it('refits when its width changes, leaving no dead space', async () => {
      const {host, area} = mount('160px', () => (
        <TextArea value="the quick brown fox jumps over the lazy dog" maxRows={9} />
      ))
      await settle()
      const narrowHeight = area.clientHeight

      host.style.width = '600px'
      await settle()
      expect(area.clientHeight).toBeLessThan(narrowHeight)
      expect(area.scrollHeight).toBe(area.clientHeight)

      host.style.width = '160px'
      await settle()
      expect(area.clientHeight).toBe(narrowHeight)
      expect(area.scrollHeight).toBe(area.clientHeight)
    })

    it('reports a height only when the height actually changes', async () => {
      const heights: number[] = []
      const {host} = mount('600px', () => <TextArea value="one" onHeightChange={(h) => heights.push(h)} />)
      await settle()

      host.style.width = '500px'
      await settle()
      expect(heights).toHaveLength(1)
    })
  })
})

describe('tooltip icon button', () => {
  const NAME = 'Terminal options for Claude Code'

  function mount(): void {
    render(() => (
      <Menu.Root>
        <TooltipIconButtonSlot tooltip={NAME}>
          {(buttonProps) => (
            <Menu.Trigger
              asChild={(triggerProps) => (
                <button {...buttonProps()} {...triggerProps()}>
                  <span aria-hidden="true">T</span>
                </button>
              )}
            />
          )}
        </TooltipIconButtonSlot>
        <Menu.Positioner>
          <Menu.Content aria-label={NAME}>
            <Menu.Item value="open">Open in Claude Code</Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>
    ))
  }

  function mountPlain(): void {
    render(() => (
      <TooltipIconButtonSlot tooltip={NAME}>
        {(buttonProps) => (
          <button {...buttonProps()}>
            <span aria-hidden="true">T</span>
          </button>
        )}
      </TooltipIconButtonSlot>
    ))
  }

  function tooltipTriggerOf(button: Element): HTMLElement {
    const trigger = button.closest('[data-scope="tooltip"][data-part="trigger"]')
    if (!(trigger instanceof HTMLElement)) throw new Error('the button is not wrapped by a tooltip trigger')
    return trigger
  }

  it('keeps the tooltip machine identity off the menu trigger', async () => {
    mount()
    const button = page.getByRole('button', {name: NAME})
    await expect.element(button).toBeVisible()
    await expect.element(button).toHaveAttribute('data-scope', 'menu')

    const trigger = tooltipTriggerOf(button.element())
    expect(trigger.getAttribute('data-scope')).toBe('tooltip')
    expect(trigger.getAttribute('data-part')).toBe('trigger')
    expect(trigger.id).not.toBe('')
    expect(trigger.id).not.toBe(button.element().id)
  })

  it('opens the tooltip when the button takes keyboard focus', async () => {
    mount()
    const button = page.getByRole('button', {name: NAME})
    await expect.element(button).toBeVisible()

    await userEvent.tab()

    await expect.element(page.getByRole('tooltip')).toBeVisible()
  })

  it('hides the tooltip once the menu it opens is showing', async () => {
    mount()
    const button = page.getByRole('button', {name: NAME})
    await userEvent.hover(button)
    await expect.element(page.getByRole('tooltip')).toBeVisible()

    await button.click()

    await expect.element(page.getByRole('menu')).toBeVisible()
    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
  })

  it('drives the menu from the keyboard without stranding the tooltip', async () => {
    mount()
    const button = page.getByRole('button', {name: NAME})
    await expect.element(button).toBeVisible()

    await userEvent.tab()
    await expect.element(page.getByRole('tooltip')).toBeVisible()

    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('menu')).toBeVisible()
    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('menu')).not.toBeInTheDocument()
    await expect.element(button).toHaveFocus()
  })

  it('describes the button by the tooltip it shows, not the wrapper around it', async () => {
    mountPlain()
    const button = page.getByRole('button', {name: NAME})
    await userEvent.hover(button)

    const tooltip = page.getByRole('tooltip')
    await expect.element(tooltip).toBeVisible()
    await expect.element(button).toHaveAttribute('aria-describedby', tooltip.element().id)
  })

  it('takes the tooltip away when the button is pressed', async () => {
    mountPlain()
    const button = page.getByRole('button', {name: NAME})
    await userEvent.hover(button)
    await expect.element(page.getByRole('tooltip')).toBeVisible()

    await button.click()

    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('truncated text', () => {
  const LONG = 'I accept the terms and conditions. Required. Validation runs on submit and again on blur.'
  const SHORT = 'Submit'

  const ROW = 'flex min-w-0 max-w-40'
  const TEXT = 'flex-1 min-w-0'

  function mount(): Element {
    const {container, unmount} = render(() => (
      <ul class="m-0 p-0 list-none flex flex-row gap-2">
        <li class={ROW} aria-label="clipped row">
          <TruncatedText class={TEXT} text={LONG} />
        </li>
        <li class={ROW} aria-label="fitting row">
          <TruncatedText class={TEXT} text={SHORT} />
        </li>
      </ul>
    ))
    onTestFinished(unmount)
    return container
  }

  const clippedRow = () => page.getByRole('listitem', {name: 'clipped row'})
  const fittingRow = () => page.getByRole('listitem', {name: 'fitting row'})

  function spanReading(host: Element, text: string): HTMLElement {
    for (const node of host.querySelectorAll('[data-scope="tooltip"][data-part="trigger"]')) {
      if (node instanceof HTMLElement && node.textContent === text) return node
    }
    throw new Error(`no truncating span reads "${text}"`)
  }

  it('reveals the whole string in a tooltip when the text is clipped', async () => {
    mount()

    await clippedRow().hover()

    const tooltip = page.getByRole('tooltip')
    await expect.element(tooltip).toBeVisible()
    await expect.element(tooltip).toHaveTextContent(LONG)
  })

  it('grows no tooltip for text that fits its box', async () => {
    mount()

    await clippedRow().hover()
    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG)

    await fittingRow().hover()

    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps the clipped string whole for assistive technology', async () => {
    const host = mount()

    expect(spanReading(host, LONG).textContent).toBe(LONG)
  })

  it('adds no tab stop to the rows it sits in', async () => {
    const host = mount()

    expect(spanReading(host, LONG).hasAttribute('tabindex')).toBe(false)
  })

  it('leaves no dangling description on a span that never reveals anything', async () => {
    const host = mount()

    await clippedRow().hover()
    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG)

    await fittingRow().hover()
    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()

    expect(spanReading(host, SHORT).hasAttribute('aria-describedby')).toBe(false)
  })
})

describe('virtual json tree', () => {
  const SHELL = 'json-tree w-full max-h-[13.75rem] overflow-auto text-[0.6875rem]'
  const LABELS = Array.from({length: 100}, (_, index) => `row-${index}`)

  const FIRST_LEAF = '0: "row-0"'
  const LAST_LEAF = '99: "row-99"'

  function payload(): unknown {
    return {items: LABELS, summary: {total: LABELS.length}}
  }

  function mount(defaultExpandedDepth: number): void {
    render(() => (
      <VirtualJsonTree
        data={payload()}
        defaultExpandedDepth={defaultExpandedDepth}
        collapseStringsAfterLength={60}
        maxPreviewItems={5}
        groupArraysAfterLength={20}
        class={SHELL}
        arrow={<ChevronRight size={12} aria-hidden="true" />}
      />
    ))
  }

  it('keeps only the rows near the viewport in the DOM when every branch is open', async () => {
    mount(2)

    await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

    const rows = page.getByRole('treeitem').all()
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.length).toBeLessThan(40)

    await expect.element(page.getByRole('treeitem', {name: LAST_LEAF})).not.toBeInTheDocument()
  })

  it('opens the top level and leaves the deeper branches closed', async () => {
    mount(1)

    await expect.element(page.getByRole('treeitem', {name: /^items:/})).toHaveAttribute('aria-expanded', 'false')
    await expect.element(page.getByRole('treeitem', {name: /^summary:/})).toHaveAttribute('aria-expanded', 'false')
    await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).not.toBeInTheDocument()
  })

  it('shows the children of a hundred-child branch when it is opened', async () => {
    mount(1)

    await page.getByRole('button', {name: /^items:/}).click()

    await expect.element(page.getByRole('treeitem', {name: /^items:/})).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

    const rows = page.getByRole('treeitem').all()
    expect(rows.length).toBeLessThan(40)
  })

  it('brings the last row into the window when focus jumps to the end of the tree', async () => {
    mount(2)
    await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

    await userEvent.tab()
    await userEvent.keyboard('{End}')

    await expect.element(page.getByRole('treeitem', {name: LAST_LEAF})).toBeVisible()
    await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).not.toBeInTheDocument()
  })

  it('opens and closes the focused branch from the keyboard', async () => {
    mount(1)
    await expect.element(page.getByRole('tree')).toBeVisible()

    await userEvent.tab()
    await userEvent.keyboard('{ArrowDown}')

    const control = page.getByRole('button', {name: /^items:/})
    await expect.element(control).toHaveFocus()
    expect(control.element().matches(':focus-visible')).toBe(true)

    await userEvent.keyboard('{ArrowRight}')
    await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).toBeVisible()

    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(page.getByRole('treeitem', {name: FIRST_LEAF})).not.toBeInTheDocument()
    await expect.element(control).toHaveFocus()
  })
})
