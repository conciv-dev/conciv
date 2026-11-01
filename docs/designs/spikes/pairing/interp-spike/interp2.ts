import {chromium} from 'playwright'
import {readFileSync, writeFileSync} from 'node:fs'

const [file, bpsArg, stepsArg] = process.argv.slice(2)
const bps = bpsArg.split(',').map(Number).sort((a, b) => a - b)
type Text = {text: string; font: string; letterSpacing: number; lineHeight: number; whiteSpace: string; mixed: boolean}
type El = {path: string; tag: string; x: number; y: number; w: number; h: number; lines: number; pad: [number, number, number, number]; txt?: Text}
type Data = {name: string; url: string; widths: number[]; byWidth: Record<number, El[]>}
const data = JSON.parse(readFileSync(file, 'utf8')) as Data

type Pred = {path: string; x: number; y: number; w: number; h: number; lines: number}

function predictAll(input: {data: Data; bps: number[]; steps: number[]}): Record<number, Pred[]> {
  const {data, bps, steps} = input
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  const widthCache = new Map<string, number>()
  const measure = (s: string, font: string, ls: number) => {
    const k = font + '|' + s
    const hit = widthCache.get(k)
    if (hit !== undefined) return hit
    ctx.font = font
    const v = ctx.measureText(s).width + ls * s.length
    widthCache.set(k, v)
    return v
  }
  const lineCount = (t: Text, contentW: number) => {
    if (t.whiteSpace === 'nowrap' || t.whiteSpace === 'pre') return 1
    const words = t.text.split(' ').flatMap((w) => w.includes('-') && w.length > 1 ? w.split('-').map((p, i, arr) => i < arr.length - 1 ? p + '-' : p).filter(Boolean) : [w])
    const space = measure(' ', t.font, t.letterSpacing)
    const out = {lines: 1, cur: 0}
    for (const word of words) {
      const ww = measure(word, t.font, t.letterSpacing)
      if (out.cur === 0) { out.cur = ww; continue }
      if (out.cur + space + ww <= contentW + 0.5) { out.cur += space + ww; continue }
      out.lines++
      out.cur = ww
    }
    return out.lines
  }
  const bracket = (w: number): [number, number] => {
    if (bps.length === 1) return [bps[0], bps[0]]
    if (w <= bps[0]) return [bps[0], bps[1]]
    if (w >= bps[bps.length - 1]) return [bps[bps.length - 2], bps[bps.length - 1]]
    return [[...bps].reverse().find((b) => b <= w) ?? bps[0], bps.find((b) => b >= w) ?? bps[bps.length - 1]]
  }
  type Node = Pred & {src: El; h0: number; y0: number; shift: number; children: Node[]}
  const result: Record<number, Pred[]> = {}
  for (const w of data.widths) {
    const [lo, hi] = bracket(w)
    const inner = steps.filter((st) => st > lo && st <= hi)
    const side = inner.length === 0 ? null : w < Math.min(...inner) ? 'lo' : w >= Math.max(...inner) ? 'hi' : (Math.abs(w - lo) <= Math.abs(hi - w) ? 'lo' : 'hi')
    const t = side === 'lo' ? 0 : side === 'hi' ? 1 : hi === lo ? 0 : (w - lo) / (hi - lo)
    const designW = side === 'lo' ? lo : side === 'hi' ? hi : null
    const b = new Map(data.byWidth[hi].map((e) => [e.path, e]))
    const nodes = new Map<string, Node>()
    for (const ea of data.byWidth[lo]) {
      const eb = b.get(ea.path)
      if (!eb) continue
      const L = (p: number, q: number) => p + (q - p) * t
      const n: Node = {path: ea.path, x: L(ea.x, eb.x), y: L(ea.y, eb.y), w: L(ea.w, eb.w), h: L(ea.h, eb.h), lines: ea.lines === eb.lines ? ea.lines : -1, src: ea, h0: 0, y0: 0, shift: 0, children: []}
      if (designW !== null) {
        const ref = side === 'lo' ? ea : eb
        if (ref.w >= designW * 0.9) n.w += w - designW
        else if (ref.x + ref.w >= designW * 0.9 && ref.x > designW * 0.1) n.x += w - designW
      }
      n.h0 = n.h; n.y0 = n.y
      nodes.set(ea.path, n)
    }
    const roots: Node[] = []
    for (const n of nodes.values()) {
      const parentPath = n.path.slice(0, n.path.lastIndexOf('.'))
      const parent = nodes.get(parentPath)
      if (parent) parent.children.push(n); else roots.push(n)
    }
    for (const p of nodes.values()) {
      const txt = p.src.txt
      if (!txt || txt.mixed || p.src.lines === 0) continue
      const eb = b.get(p.path)
      if (!eb) continue
      const contentW = p.w - p.src.pad[1] - p.src.pad[3]
      const lines = lineCount(txt, contentW)
      const modelLo = lineCount(txt, p.src.w - p.src.pad[1] - p.src.pad[3])
      const modelHi = lineCount(txt, eb.w - p.src.pad[1] - p.src.pad[3])
      const delta = (lines - (modelLo + (modelHi - modelLo) * t)) * txt.lineHeight
      p.lines = lines
      p.h += delta
    }
    const grow = (n: Node): number => {
      const own = n.h - n.h0
      if (!n.children.length) return own
      const kids = [...n.children].sort((a, c) => a.y0 - c.y0)
      const growths = kids.map(grow)
      const oldBottom = Math.max(...kids.map((k) => k.y0 + k.h0))
      const bottoms: number[] = []
      kids.forEach((k, i) => {
        const above = kids.filter((s, j) => j !== i && s.y0 + s.h0 <= k.y0 + 1)
        const shift = above.length ? Math.max(0, ...above.map((s) => (s.y0 + s.h0 + growths[kids.indexOf(s)] + s.shift) - (s.y0 + s.h0))) : 0
        k.shift = shift
        bottoms.push(k.y0 + k.h0 + growths[i] + shift)
      })
      const g = Math.max(...bottoms) - oldBottom
      if (g > 0 || own === 0) n.h = n.h0 + Math.max(own, g)
      return n.h - n.h0
    }
    roots.forEach(grow)
    const apply = (n: Node, acc: number) => {
      n.y += acc + n.shift
      n.children.forEach((c) => apply(c, acc + n.shift))
    }
    roots.forEach((r) => apply(r, 0))
    result[w] = [...nodes.values()].map(({src, h0, y0, shift, children, ...rest}) => rest)
  }
  return result
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1280, height: 800}})
await page.goto(data.url, {waitUntil: 'networkidle'})
await page.evaluate(() => document.fonts.ready)
const cssSteps = await page.evaluate(() => {
  const out = new Set<number>()
  const px = (txt: string) => { const m = txt.match(/([\d.]+)(rem|px)/); return m ? parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1) : null }
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule && r.media.mediaText.includes('width')) { const v = px(r.media.mediaText); if (v) out.add(v) }
      if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules)
    }
  }
  for (const s of Array.from(document.styleSheets)) { try { walk(s.cssRules) } catch {} }
  return [...out].sort((a, b) => a - b)
})
const steps = stepsArg ? stepsArg.split(',').map(Number) : cssSteps
console.log('steps', steps)
const preds = await page.evaluate(predictAll, {data, bps, steps})
await browser.close()

const index = (els: El[]) => new Map(els.map((e) => [e.path, e]))
const pct = (arr: number[], p: number) => arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN
const rows: string[] = ['| width | dist to bp | matched | edge err med / p95 / max | y err p95 | within 2px | line-count wrong |', '|---|---|---|---|---|---|---|']
const summary: {dist: number; p95: number; within: number}[] = []
for (const w of data.widths) {
  const truth = index(data.byWidth[w])
  const dist = Math.min(...bps.map((b) => Math.abs(b - w)))
  const errs: number[] = [], yerrs: number[] = []
  let within = 0, wrongLines = 0, matched = 0
  for (const p of preds[w]) {
    const tr = truth.get(p.path)
    if (!tr) continue
    matched++
    const m = Math.max(Math.abs(p.x - tr.x), Math.abs(p.y - tr.y), Math.abs(p.x + p.w - tr.x - tr.w), Math.abs(p.y + p.h - tr.y - tr.h))
    errs.push(m); yerrs.push(Math.abs(p.y - tr.y))
    if (m <= 2) within++
    if (tr.lines > 0 && p.lines !== tr.lines) wrongLines++
  }
  rows.push(`| ${w} | ${dist} | ${matched}/${truth.size} | ${pct(errs, .5).toFixed(1)} / ${pct(errs, .95).toFixed(1)} / ${pct(errs, 1).toFixed(0)} | ${pct(yerrs, .95).toFixed(1)} | ${matched ? Math.round(100 * within / matched) : 0}% | ${wrongLines} |`)
  summary.push({dist, p95: pct(errs, .95), within: matched ? within / matched : 0})
}
const bucket = (lo: number, hi: number) => { const v = summary.filter((s) => s.dist >= lo && s.dist < hi); return v.length ? `${pct(v.map((s) => s.p95), .5).toFixed(1)} / ${Math.round(100 * pct(v.map((s) => s.within), .5))}% (n=${v.length})` : '-' }
const head = [`# ${data.name}: lerp + text-wrap + CSS-step prediction vs Chromium truth`, '', `Breakpoints used as "designs": ${bps.join(', ')}. Boxes are linearly interpolated per DOM path, then every text element's line count is re-predicted with canvas measureText at the interpolated content width (greedy word wrap); the height delta grows every ancestor and pushes every box below it down.`, '', '## p95 edge error / within-2px share (median over widths) by distance from nearest breakpoint', '', '| dist to bp | lerp+wrap |', '|---|---|', ...[[0,1],[1,41],[41,101],[101,201],[201,900]].map(([a,b]) => `| ${a}–${b-1} px | ${bucket(a,b)} |`), '', '## Per width', '']
const stem = file.replace('-truth.json', '')
writeFileSync(`${stem}-interp3-${bps.join('-')}.md`, [...head, ...rows].join('\n'))
writeFileSync(`${stem}-pred3-${bps.join('-')}.json`, JSON.stringify(preds))
console.log(head.join('\n'))
