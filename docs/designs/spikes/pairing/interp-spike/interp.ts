import {readFileSync, writeFileSync} from 'node:fs'

const [file, bpsArg] = process.argv.slice(2)
const bps = bpsArg.split(',').map(Number).sort((a, b) => a - b)
type El = {path: string; tag: string; x: number; y: number; w: number; h: number; lines: number}
const data = JSON.parse(readFileSync(file, 'utf8')) as {name: string; widths: number[]; byWidth: Record<number, El[]>}
const index = (els: El[]) => new Map(els.map((e) => [e.path, e]))

function bracket(w: number): [number, number] {
  if (w <= bps[0]) return [bps[0], bps[0]]
  if (w >= bps[bps.length - 1]) return [bps[bps.length - 1], bps[bps.length - 1]]
  const hi = bps.find((b) => b >= w) ?? bps[bps.length - 1]
  const lo = [...bps].reverse().find((b) => b <= w) ?? bps[0]
  return [lo, hi]
}

function predict(w: number, mode: 'lerp' | 'snap'): Map<string, El> {
  const [lo, hi] = bracket(w)
  const a = index(data.byWidth[lo]), b = index(data.byWidth[hi])
  const t = hi === lo ? 0 : (w - lo) / (hi - lo)
  const out = new Map<string, El>()
  for (const [path, ea] of a) {
    const eb = b.get(path)
    if (!eb) continue
    if (mode === 'snap') {
      const near = Math.abs(w - lo) <= Math.abs(hi - w) ? ea : eb
      const dw = w - (near === ea ? lo : hi)
      out.set(path, {...near, w: near.w + (near.w >= (near === ea ? lo : hi) * 0.9 ? dw : 0)})
      continue
    }
    const L = (p: number, q: number) => p + (q - p) * t
    out.set(path, {path, tag: ea.tag, x: L(ea.x, eb.x), y: L(ea.y, eb.y), w: L(ea.w, eb.w), h: L(ea.h, eb.h), lines: ea.lines === eb.lines ? ea.lines : -1})
  }
  return out
}

const pct = (arr: number[], p: number) => arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(p * arr.length))] : NaN
const rows: string[] = ['| width | dist to bp | mode | matched | edge err med / p95 / max | y err p95 | within 2px | line-count wrong |', '|---|---|---|---|---|---|---|---|']
const summary: Record<string, {dist: number; p95: number}[]> = {lerp: [], snap: []}
for (const w of data.widths) {
  const truth = index(data.byWidth[w])
  const dist = Math.min(...bps.map((b) => Math.abs(b - w)))
  for (const mode of ['lerp', 'snap'] as const) {
    const pred = predict(w, mode)
    const errs: number[] = [], yerrs: number[] = []
    let within = 0, wrongLines = 0, matched = 0
    for (const [path, p] of pred) {
      const tr = truth.get(path)
      if (!tr) continue
      matched++
      const e = [Math.abs(p.x - tr.x), Math.abs(p.y - tr.y), Math.abs(p.x + p.w - tr.x - tr.w), Math.abs(p.y + p.h - tr.y - tr.h)]
      const m = Math.max(...e)
      errs.push(m); yerrs.push(Math.abs(p.y - tr.y))
      if (m <= 2) within++
      if (tr.lines > 0 && p.lines !== tr.lines) wrongLines++
    }
    rows.push(`| ${w} | ${dist} | ${mode} | ${matched}/${truth.size} | ${pct(errs, .5).toFixed(1)} / ${pct(errs, .95).toFixed(1)} / ${pct(errs, 1).toFixed(0)} | ${pct(yerrs, .95).toFixed(1)} | ${matched ? Math.round(100 * within / matched) : 0}% | ${wrongLines} |`)
    summary[mode].push({dist, p95: pct(errs, .95)})
  }
}
const bucket = (mode: 'lerp' | 'snap', lo: number, hi: number) => { const v = summary[mode].filter((s) => s.dist >= lo && s.dist < hi).map((s) => s.p95); return v.length ? `${pct(v, .5).toFixed(1)} (n=${v.length})` : '-' }
const head = [`# ${data.name}: interpolated target tree vs Chromium truth`, '', `Breakpoints used as "designs": ${bps.join(', ')}. Every other width is predicted from the two bracketing breakpoints. lerp = linear interpolation of x,y,w,h per DOM path; snap = nearest breakpoint's tree with only the viewport-wide boxes stretched.`, '', '## p95 edge error (median over widths) by distance from nearest breakpoint', '', '| dist to bp | lerp | snap |', '|---|---|---|', ...[[0,1],[1,41],[41,101],[101,201],[201,900]].map(([a,b]) => `| ${a}–${b-1} px | ${bucket('lerp',a,b)} | ${bucket('snap',a,b)} |`), '', '## Per width', '']
writeFileSync(file.replace('-truth.json', `-interp-${bps.join('-')}.md`), [...head, ...rows].join('\n'))
console.log([...head].join('\n'))
