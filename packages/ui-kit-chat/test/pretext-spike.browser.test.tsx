import 'virtual:uno.css'
import {it} from 'vitest'
import tokensCss from '../src/theme/tokens.css?inline'
import concivCss from '../src/theme/conciv.css?inline'
import systemTokensCss from '../../ui-kit-system/src/tokens.css?inline'
import wixMadeforNormal from '@fontsource-variable/wix-madefor-text/files/wix-madefor-text-latin-wght-normal.woff2?inline'
import wixMadeforItalic from '@fontsource-variable/wix-madefor-text/files/wix-madefor-text-latin-wght-italic.woff2?inline'
import {layout, measureNaturalWidth, prepareWithSegments, type PreparedTextWithSegments} from '@chenglou/pretext'

const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

function registerFonts(): void {
  if (document.querySelector('style[data-conciv-fonts]')) return
  const style = document.createElement('style')
  style.setAttribute('data-conciv-fonts', '')
  style.textContent = [
    {style: 'normal', src: wixMadeforNormal},
    {style: 'italic', src: wixMadeforItalic},
  ]
    .map(
      (face) =>
        `@font-face{font-family:'Wix Madefor Text';font-style:${face.style};font-weight:400 800;src:url(${face.src}) format('woff2-variations');unicode-range:${LATIN_RANGE}}`,
    )
    .join('\n')
  document.head.appendChild(style)
}

const USER_BUBBLE_CLASS =
  'px-3 py-1.5 rounded-[var(--chat-radius-md)] max-w-[80%] [background:var(--chat-accent)] [color:var(--chat-on-accent)] [overflow-wrap:anywhere] self-end anim-msg'
const ASSISTANT_ROOT_CLASS = 'flex flex-col gap-1.5 min-w-0 w-full [color:var(--chat-text)] self-stretch relative'
const VIEWPORT_CLASS = 'px-3 py-3 flex flex-1 flex-col gap-3 min-h-0 relative overflow-y-auto'
const THREAD_ROOT_CLASS = 'flex flex-col h-full min-h-0 [color:var(--chat-text)] [font-family:var(--chat-font)]'

type Style = {
  font: string
  fallbackFont: string
  fontFamily: string
  fontSize: number
  fontWeight: string
  letterSpacing: number
  lineHeightRaw: string
  lineHeightPx: number
  lineHeightProbe: number
  lineHeightGuess: number
  whiteSpace: string
  overflowWrap: string
  wordBreak: string
  boxSizing: string
  maxWidth: number
  padTop: number
  padBottom: number
  padLeft: number
  padRight: number
  borderTop: number
  borderBottom: number
  borderLeft: number
  borderRight: number
}

type Sample = {cls: string; text: string}

function collectDocumentCss(): string {
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) parts.push(rule.cssText)
    } catch {
      continue
    }
  }
  return parts.join('\n')
}

function num(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function makeHost(width: number): {shadow: ShadowRoot; viewport: HTMLElement; host: HTMLElement} {
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:700px;overflow:hidden;`
  document.body.appendChild(host)
  const shadow = host.attachShadow({mode: 'open'})
  const style = document.createElement('style')
  style.textContent = `${systemTokensCss}\n${tokensCss}\n${concivCss}\n${collectDocumentCss()}\n:host{display:block;font-size:16px}\n*{box-sizing:border-box}`
  shadow.appendChild(style)
  const root = document.createElement('div')
  root.className = `chat-theme-conciv ${THREAD_ROOT_CLASS}`
  const viewport = document.createElement('div')
  viewport.className = VIEWPORT_CLASS
  root.appendChild(viewport)
  shadow.appendChild(root)
  return {shadow, viewport, host}
}

function lineBoxes(textHolder: HTMLElement): number {
  const range = document.createRange()
  range.selectNodeContents(textHolder)
  const tops = new Set<number>()
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.height === 0 && rect.width === 0) continue
    tops.add(Math.round(rect.top * 10) / 10)
  }
  return tops.size
}

function userRow(text: string, extraClass = ''): HTMLElement {
  const bubble = document.createElement('div')
  bubble.className = `${USER_BUBBLE_CLASS} ${extraClass}`
  const span = document.createElement('span')
  span.textContent = text
  bubble.appendChild(span)
  return bubble
}

function assistantRow(text: string, extraClass = ''): HTMLElement {
  const root = document.createElement('div')
  root.className = ASSISTANT_ROOT_CLASS
  const prose = document.createElement('div')
  prose.className = `prose-pw ${extraClass}`
  const p = document.createElement('p')
  p.textContent = text
  prose.appendChild(p)
  root.appendChild(prose)
  return root
}

function canvasFont(computed: CSSStyleDeclaration): string {
  const weight = computed.fontWeight
  const style = computed.fontStyle === 'normal' ? '' : `${computed.fontStyle} `
  return `${style}${weight} ${computed.fontSize} ${computed.fontFamily}`
}

function readStyle(box: HTMLElement, textHolder: HTMLElement, probeHeight: number): Style {
  const boxStyle = getComputedStyle(box)
  const textStyle = getComputedStyle(textHolder)
  const fontSize = num(textStyle.fontSize)
  const lineHeightRaw = textStyle.lineHeight
  const lineHeightPx = lineHeightRaw.endsWith('px') ? num(lineHeightRaw) : Number.NaN
  const fallbackFamily = textStyle.fontFamily
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => !entry.toLowerCase().includes('wix madefor'))
    .join(', ')
  return {
    font: canvasFont(textStyle),
    fallbackFont: `${textStyle.fontWeight} ${textStyle.fontSize} ${fallbackFamily}`,
    fontFamily: textStyle.fontFamily,
    fontSize,
    fontWeight: textStyle.fontWeight,
    letterSpacing: textStyle.letterSpacing === 'normal' ? 0 : num(textStyle.letterSpacing),
    lineHeightRaw,
    lineHeightPx,
    lineHeightProbe: probeHeight,
    lineHeightGuess: fontSize * 1.2,
    whiteSpace: textStyle.whiteSpace,
    overflowWrap: textStyle.overflowWrap,
    wordBreak: textStyle.wordBreak,
    boxSizing: boxStyle.boxSizing,
    maxWidth: boxStyle.maxWidth.endsWith('px') ? num(boxStyle.maxWidth) : Number.POSITIVE_INFINITY,
    padTop: num(boxStyle.paddingTop),
    padBottom: num(boxStyle.paddingBottom),
    padLeft: num(boxStyle.paddingLeft),
    padRight: num(boxStyle.paddingRight),
    borderTop: num(boxStyle.borderTopWidth),
    borderBottom: num(boxStyle.borderBottomWidth),
    borderLeft: num(boxStyle.borderLeftWidth),
    borderRight: num(boxStyle.borderRightWidth),
  }
}

function prepareText(text: string, style: Style): PreparedTextWithSegments {
  return prepareWithSegments(text, style.font, {
    whiteSpace: style.whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal',
    letterSpacing: style.letterSpacing,
    wordBreak: style.wordBreak === 'keep-all' ? 'keep-all' : 'normal',
  })
}

function capContentWidth(style: Style, containerContentWidth: number, fraction: number): number {
  const capOuter = Math.min(containerContentWidth * fraction, style.maxWidth)
  const chrome = style.padLeft + style.padRight + style.borderLeft + style.borderRight
  return style.boxSizing === 'border-box' ? capOuter - chrome : capOuter
}

function estimate(
  prepared: PreparedTextWithSegments,
  style: Style,
  contentCap: number,
  lineHeight: number,
  shrinkToFit: boolean,
): {height: number; lineCount: number; usedWidth: number} {
  const natural = measureNaturalWidth(prepared)
  const usedWidth = shrinkToFit ? Math.min(natural, contentCap) : contentCap
  const result = layout(prepared, usedWidth, lineHeight)
  return {
    height: result.height + style.padTop + style.padBottom + style.borderTop + style.borderBottom,
    lineCount: result.lineCount,
    usedWidth,
  }
}

function baseSamples(): Sample[] {
  return [
    {cls: 'short', text: 'ok'},
    {cls: 'short', text: 'Hi there'},
    {cls: 'short', text: 'thanks!'},
    {cls: 'short', text: 'yes please'},
    {cls: 'short', text: 'Can you fix the build?'},
    {cls: 'short', text: 'run the tests again'},
    {cls: 'medium', text: 'Please add a changeset and rerun the release workflow when CI is green.'},
    {cls: 'medium', text: 'The widget bundle must externalize every extension subpath, otherwise popovers render at 0,0.'},
    {cls: 'medium', text: 'I looked at the diff and the only thing missing is the zod default on the search param.'},
    {cls: 'medium', text: 'Why does the scroll jump when a new assistant message starts streaming into the transcript?'},
    {cls: 'medium', text: 'Rebuild the embed bundle first; the integration tests load the prebuilt global file.'},
    {cls: 'medium', text: 'Can you check whether the resize observer is still attached after the route change?'},
    {
      cls: 'long',
      text: 'The transcript virtualizer has to keep one sizing owner per row, so a row that is estimated by pretext must never also be measured by measureElement, and a row that is measured must never be handed an estimate that fights the measured value. Mixing the two produces a scroll position that oscillates while the model streams tokens into the last row.',
    },
    {
      cls: 'long',
      text: 'When the user scrolls up to read history, the follow machine must release the viewport entirely, and every scroll write from the virtualizer core has to be suppressed except the prepend anchoring path, which is the only adjustment that preserves the visual position of the anchor row across a history page load.',
    },
    {
      cls: 'long',
      text: 'Pretext side-steps DOM measurement by implementing its own line breaking over canvas-measured segment widths; the accuracy therefore depends entirely on whether the font string, the letter spacing, the white space mode and the word break mode fed into prepare agree exactly with what the browser used when it laid out the same string.',
    },
    {
      cls: 'long',
      text: 'A long paragraph of ordinary chat prose with commas, semicolons; parentheses (like these), quotes "like these", and a trailing sentence that pushes the whole thing well past a single wrapped line so that the line count is high enough for any per-line error to accumulate visibly in the total height.',
    },
    {cls: 'emoji', text: 'shipped it 🚀'},
    {cls: 'emoji', text: '👨‍👩‍👧‍👦 family emoji plus a flag 🇯🇵 and a skin tone 👍🏽 in one line'},
    {cls: 'emoji', text: '🎉🎉🎉 nice work on the fix, that was a nasty one 😅 let us ship it 🚢'},
    {cls: 'emoji', text: '🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵🧵'},
    {cls: 'cjk', text: '构建失败了，请检查依赖版本。'},
    {cls: 'cjk', text: 'このメッセージは日本語のテキストで、折り返しの挙動を確認するために十分な長さがあります。'},
    {cls: 'cjk', text: '한국어 문장을 포함한 메시지입니다. 줄 바꿈이 올바르게 계산되는지 확인합니다.'},
    {cls: 'cjk', text: '混合 text with 中文 and English words 交替 出现 to test 断行 behaviour 在同一行内。'},
    {cls: 'code', text: 'pnpm turbo run test --filter=@conciv/ui-kit-chat'},
    {cls: 'code', text: 'const {height, lineCount} = layout(prepared, width, lineHeight)'},
    {cls: 'code', text: 'git rebase --onto main feat/conciv-skills-pack~3 feat/conciv-skills-pack'},
    {cls: 'code', text: 'error TS7016: Could not find a declaration file for module "@conciv/protocol/tool-view-types"'},
    {cls: 'unbroken', text: 'supercalifragilisticexpialidociousantidisestablishmentarianismpneumonoultramicroscopic'},
    {cls: 'unbroken', text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
    {cls: 'unbroken', text: 'short then WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW end'},
    {cls: 'url', text: 'https://tanstack.com/virtual/latest/docs/pretext'},
    {cls: 'url', text: 'see https://github.com/chenglou/pretext/blob/main/src/layout.ts#L120 for the details'},
    {cls: 'url', text: 'https://raw.githubusercontent.com/TanStack/virtual/main/docs/pretext.md?query=1&other=2'},
    {cls: 'empty', text: ''},
    {cls: 'empty', text: ' '},
    {cls: 'empty', text: '      '},
    {cls: 'rtl', text: 'بدأت الرحلة نحو الذكاء الاصطناعي العام'},
    {cls: 'rtl', text: 'mixed עברית and english in one message line'},
    {cls: 'punct', text: 'A. B. C. D. E. F. G. H. I. J. K. L. M. N. O. P. Q. R. S. T. U. V.'},
    {cls: 'punct', text: 'one—two–three…four "five" ‘six’ seven; eight: nine, ten.'},
  ]
}

function boundarySamples(style: Style, contentCap: number, lineHeight: number): Sample[] {
  const words = [
    'alpha',
    'bravo',
    'charlie',
    'delta',
    'echo',
    'foxtrot',
    'golf',
    'hotel',
    'india',
    'juliet',
    'kilo',
    'lima',
    'mike',
    'november',
    'oscar',
    'papa',
  ]
  const out: Sample[] = []
  for (const filler of ['x', 'm', 'i']) {
    let text = ''
    let index = 0
    while (measureNaturalWidth(prepareText(text + (text ? ' ' : '') + words[index % words.length], style)) < contentCap) {
      text = text + (text ? ' ' : '') + words[index % words.length]
      index += 1
      if (index > 40) break
    }
    for (let extra = 0; extra <= 8; extra += 1) {
      const candidate = `${text} ${filler.repeat(extra + 1)}`
      const width = measureNaturalWidth(prepareText(candidate, style))
      if (Math.abs(width - contentCap) <= 12) out.push({cls: 'boundary', text: candidate})
    }
    const shrink = text.slice(0, Math.max(0, text.length - 1))
    if (Math.abs(measureNaturalWidth(prepareText(shrink, style)) - contentCap) <= 12) {
      out.push({cls: 'boundary', text: shrink})
    }
  }
  void lineHeight
  return out.slice(0, 12)
}

type Row = {
  cls: string
  text: string
  actual: number
  estProbe: number
  estFallback: number
  estGuess: number
  estCircular: number
  lineCountEst: number
  lineCountActual: number
}

function stats(values: number[]): {mean: number; p95: number; max: number} {
  if (values.length === 0) return {mean: 0, p95: 0, max: 0}
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
  return {mean, p95, max: sorted[sorted.length - 1] ?? 0}
}

function fmt(value: number): string {
  return value.toFixed(2)
}

it('pretext accuracy matrix for conciv chat bubbles', async () => {
  registerFonts()
  await document.fonts.load('400 16px "Wix Madefor Text"')
  await document.fonts.ready
  const report: string[] = []
  report.push(`FONT LOADED check=${document.fonts.check('400 16px "Wix Madefor Text"')}`)

  for (const width of [420, 720]) {
    for (const role of ['user', 'user-pinned-lh', 'assistant', 'assistant-anywhere'] as const) {
      const isUser = role === 'user' || role === 'user-pinned-lh'
      const extra = role === 'user-pinned-lh'
        ? 'leading-[1.45]'
        : role === 'assistant-anywhere'
          ? '[overflow-wrap:anywhere]'
          : ''
      const {viewport, host} = makeHost(width)

      const probeRow = isUser ? userRow('Probe', extra) : assistantRow('Probe', extra)
      viewport.appendChild(probeRow)
      const probeBox = isUser ? probeRow : (probeRow.firstElementChild as HTMLElement)
      const probeText = isUser ? (probeRow.firstElementChild as HTMLElement) : probeBox.firstElementChild as HTMLElement
      const probeLineHeight =
        probeText.getBoundingClientRect().height ||
        num(getComputedStyle(probeText).fontSize) * 1.2
      const style = readStyle(probeBox, probeText, probeLineHeight)

      const viewportStyle = getComputedStyle(viewport)
      const containerContent =
        viewport.clientWidth - num(viewportStyle.paddingLeft) - num(viewportStyle.paddingRight)
      const fraction = isUser ? 0.8 : 1
      const cap = capContentWidth(style, containerContent, fraction)
      const lhProbe = Number.isFinite(style.lineHeightPx) ? style.lineHeightPx : style.lineHeightProbe
      const lhGuess = Number.isFinite(style.lineHeightPx) ? style.lineHeightPx : style.lineHeightGuess

      const samples = [...baseSamples(), ...boundarySamples(style, cap, lhProbe)]

      const nodes = samples.map((sample) => {
        const node = isUser ? userRow(sample.text, extra) : assistantRow(sample.text, extra)
        viewport.appendChild(node)
        return node
      })

      const rows: Row[] = samples.map((sample, index) => {
        const node = nodes[index] as HTMLElement
        const box = isUser ? node : (node.firstElementChild as HTMLElement)
        const actual = box.getBoundingClientRect().height
        const renderedContentWidth =
          box.getBoundingClientRect().width - style.padLeft - style.padRight - style.borderLeft - style.borderRight
        const prepared = prepareText(sample.text, style)
        const preparedFallback = prepareWithSegments(sample.text, style.fallbackFont, {
          whiteSpace: style.whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal',
          letterSpacing: style.letterSpacing,
          wordBreak: style.wordBreak === 'keep-all' ? 'keep-all' : 'normal',
        })
        const probeEstimate = estimate(prepared, style, cap, lhProbe, isUser)
        const fallbackEstimate = estimate(preparedFallback, style, cap, lhProbe, isUser)
        const guessEstimate = estimate(prepared, style, cap, lhGuess, isUser)
        const circular = layout(prepared, Math.max(renderedContentWidth, 1), lhProbe)
        const textHolder = isUser ? (node.firstElementChild as HTMLElement) : (box.firstElementChild as HTMLElement)
        const actualLines = lineBoxes(textHolder)
        return {
          cls: sample.cls,
          text: sample.text,
          actual,
          estProbe: probeEstimate.height,
          estFallback: fallbackEstimate.height,
          estGuess: guessEstimate.height,
          estCircular:
            Math.max(circular.height, circular.lineCount === 0 ? lhProbe : 0) +
            style.padTop +
            style.padBottom,
          lineCountEst: probeEstimate.lineCount,
          lineCountActual: actualLines,
        }
      })

      report.push('')
      report.push(`=== ${role} @ container ${width}px ===`)
      report.push(
        `AUDIT font=${JSON.stringify(style.font)} lineHeightRaw=${style.lineHeightRaw} lineHeightProbe=${fmt(style.lineHeightProbe)} lineHeightGuess=${fmt(style.lineHeightGuess)} letterSpacing=${style.letterSpacing} whiteSpace=${style.whiteSpace} overflowWrap=${style.overflowWrap} wordBreak=${style.wordBreak} boxSizing=${style.boxSizing} padY=${style.padTop}/${style.padBottom} padX=${style.padLeft}/${style.padRight} border=${style.borderTop}/${style.borderLeft}`,
      )
      report.push(
        `WIDTH viewport.clientWidth=${viewport.clientWidth} containerContent=${fmt(containerContent)} maxWidthComputed=${style.maxWidth} capContent=${fmt(cap)} probeRenderedWidth=${fmt(probeBox.getBoundingClientRect().width)}`,
      )

      const classes = [...new Set(rows.map((row) => row.cls))]
      for (const cls of classes) {
        const group = rows.filter((row) => row.cls === cls)
        const errProbe = group.map((row) => Math.abs(row.estProbe - row.actual))
        const errGuess = group.map((row) => Math.abs(row.estGuess - row.actual))
        const errCirc = group.map((row) => Math.abs(row.estCircular - row.actual))
        const errFallback = group.map((row) => Math.abs(row.estFallback - row.actual))
        const p = stats(errProbe)
        const g = stats(errGuess)
        const c = stats(errCirc)
        const f = stats(errFallback)
        const flips = group.filter((row) => row.lineCountEst !== row.lineCountActual)
        const over = flips.filter((row) => row.lineCountEst > row.lineCountActual).length
        const signed = group.map((row) => row.estProbe - row.actual)
        const under = signed.filter((value) => value < -0.05).length
        const above = signed.filter((value) => value > 0.05).length
        report.push(
          `${cls.padEnd(9)} n=${String(group.length).padStart(2)} probe(mean/p95/max)=${fmt(p.mean)}/${fmt(p.p95)}/${fmt(p.max)}  guessLH=${fmt(g.mean)}/${fmt(g.p95)}/${fmt(g.max)}  circular=${fmt(c.mean)}/${fmt(c.p95)}/${fmt(c.max)}  fallbackFont=${fmt(f.mean)}/${fmt(f.p95)}/${fmt(f.max)}  lineFlips=${flips.length}(over ${over}/under ${flips.length - over})  sign(+${above}/-${under})`,
        )
      }
      const allProbe = stats(rows.map((row) => Math.abs(row.estProbe - row.actual)))
      const allGuess = stats(rows.map((row) => Math.abs(row.estGuess - row.actual)))
      report.push(
        `ALL       n=${rows.length} probe=${fmt(allProbe.mean)}/${fmt(allProbe.p95)}/${fmt(allProbe.max)}  guess=${fmt(allGuess.mean)}/${fmt(allGuess.p95)}/${fmt(allGuess.max)}`,
      )
      const worst = [...rows].sort((a, b) => Math.abs(b.estProbe - b.actual) - Math.abs(a.estProbe - a.actual)).slice(0, 8)
      for (const row of worst) {
        report.push(
          `  WORST ${row.cls} err=${fmt(row.estProbe - row.actual)} actual=${fmt(row.actual)} est=${fmt(row.estProbe)} linesEst=${row.lineCountEst} linesActual=${row.lineCountActual} text=${JSON.stringify(row.text.slice(0, 70))}`,
        )
      }

      host.remove()
    }
  }

  console.log(report.join('\n'))
})
