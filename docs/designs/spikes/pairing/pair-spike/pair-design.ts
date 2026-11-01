import {readFileSync} from 'node:fs'
import {PNG} from 'pngjs'

type Box = {x: number; y: number; w: number; h: number}
type DNode = {id: number; kind: 'text' | 'frame'; box: Box; text?: string; fill?: number[]; parent: number | null}
type Dom = {path: string; x: number; y: number; w: number; h: number; lineRects: Box[]; txt?: {text: string}}
const INTERP = '/private/tmp/claude-501/-Users-omrikatz-Public-web-mono/1371b864-cc6b-48a6-823b-ade1fe762a3e/scratchpad/interp-spike'
const NAME = process.env.PAGE ?? 'site'
const truthAll = JSON.parse(readFileSync(`${INTERP}/raw/${NAME}-truth.json`, 'utf8')) as {byWidth: Record<string, Dom[]>}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const bigrams = (s: string) => { const o = new Set<string>(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o }
const lev = (a: string, b: string) => { const m = a.length, n = b.length; const d = Array.from({length: m + 1}, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n] }
const dice = (a: string, b: string) => { if (!a || !b) return 0; if (a === b) return 1; if (a.length < 4 || b.length < 4) return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length)); const A = bigrams(a), B = bigrams(b); let n = 0; for (const g of A) if (B.has(g)) n++; return 2 * n / (A.size + B.size) }
const iou = (a: Box, b: Box) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (w <= 0 || h <= 0) return 0; const i = w * h; return i / (a.w * a.h + b.w * b.h - i) }
const inside = (r: Box, e: Box) => { const w = Math.min(r.x + r.w, e.x + e.w) - Math.max(r.x, e.x), h = Math.min(r.y + r.h, e.y + e.h) - Math.max(r.y, e.y); return w <= 0 || h <= 0 ? 0 : (w * h) / (r.w * r.h) }
const ahash = (png: PNG, b: Box): number[] => {
  const out: number[] = []
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
    const x0 = Math.floor(b.x + (gx * b.w) / 8), x1 = Math.max(x0 + 1, Math.floor(b.x + ((gx + 1) * b.w) / 8)), y0 = Math.floor(b.y + (gy * b.h) / 8), y1 = Math.max(y0 + 1, Math.floor(b.y + ((gy + 1) * b.h) / 8))
    let sum = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue; const i = (y * png.width + x) * 4; sum += (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; n++ }
    out.push(n ? sum / n : 0)
  }
  const mean = out.reduce((a, b) => a + b, 0) / out.length
  return out.map((v) => (v > mean ? 1 : 0))
}
const pixelScore = (a: number[], b: number[]) => 1 - a.reduce((s, v, i) => s + (v === b[i] ? 0 : 1), 0) / a.length

export function loadDesign(w: number) {
  const d = JSON.parse(readFileSync(`${INTERP}/png/${NAME}-design-${w}.json`, 'utf8')) as {width: number; height: number; text: {text: string; box: Box}[]; frames: {box: Box; fill?: number[]}[]}
  const frames: DNode[] = d.frames.map((f, i) => ({id: i, kind: 'frame', box: f.box, fill: f.fill, parent: null}))
  const texts: DNode[] = d.text.filter((t) => norm(t.text).length > 0).map((t, i) => ({id: frames.length + i, kind: 'text', box: t.box, text: t.text, parent: null}))
  const all = [...frames, ...texts]
  for (const n of all) { const ps = frames.filter((f) => f !== n && inside(n.box, f.box) >= 0.9 && f.box.w * f.box.h > n.box.w * n.box.h).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h); n.parent = ps[0]?.id ?? null }
  const dom = truthAll.byWidth[String(w)]
  const truth = new Map<number, string | null>()
  for (const n of all) {
    if (n.kind === 'text') {
      let best: Dom | null = null, bs = 0
      for (const e of dom) for (const lr of e.lineRects ?? []) { const s = iou(n.box, lr); if (s > bs) { bs = s; best = e } }
      if (best && bs >= 0.3) { truth.set(n.id, best.path); continue }
      const host = dom.filter((e) => inside(n.box, e) >= 0.8 && e.w < 600 && e.h < 400).sort((a, b) => a.w * a.h - b.w * b.h)[0]
      truth.set(n.id, host?.path ?? null)
    } else { let best: Dom | null = null, bs = 0; for (const e of dom) { const s = iou(n.box, e); if (s > bs) { bs = s; best = e } } truth.set(n.id, best && bs >= 0.6 ? best.path : null) }
  }
  return {all, truth, png: PNG.sync.read(readFileSync(`${INTERP}/png/shots/${NAME}-${w}.png`)), width: d.width, height: d.height}
}

type Kind = 'heading' | 'label' | 'body' | 'media' | 'container'
const kindOf = (n: DNode): Kind => n.kind === 'frame' ? (n.box.w * n.box.h < 3600 ? 'media' : 'container') : n.box.h >= 26 ? 'heading' : n.box.h <= 13 ? 'label' : 'body'
const W = {text: 0.35, kind: 0.1, structure: 0.25, style: 0.1, pixel: 0.1, order: 0.1}
const VOTERS = 6

export function pairDesigns(A: ReturnType<typeof loadDesign>, B: ReturnType<typeof loadDesign>) {
  const pairs = new Map<number, number | 'ambiguous' | null>()
  const byIdA = new Map(A.all.map((n) => [n.id, n])), byIdB = new Map(B.all.map((n) => [n.id, n]))
  const hashA = new Map<number, number[]>(), hashB = new Map<number, number[]>()
  const h = (m: Map<number, number[]>, png: PNG, n: DNode) => { const c = m.get(n.id); if (c) return c; const v = ahash(png, n.box); m.set(n.id, v); return v }
  const taken: Record<'text' | 'frame', Set<number>> = {text: new Set(), frame: new Set()}
  const scale: number[] = Array(VOTERS).fill(1)
  const ancestor = (n: DNode): DNode | null => { let cur = n.parent === null ? null : byIdA.get(n.parent) ?? null; while (cur) { if (typeof pairs.get(cur.id) === 'number') return cur; cur = cur.parent === null ? null : byIdA.get(cur.parent) ?? null } return null }
  const score = (a: DNode) => {
    const anc = ancestor(a)
    const ancB = anc === null ? null : byIdB.get(pairs.get(anc.id) as number) ?? null
    const ka = kindOf(a)
    const cands = B.all.filter((b) => b.kind === a.kind && !taken[a.kind].has(b.id))
    const rel = (y: number, top: number, hh: number) => hh > 0 ? Math.min(1, Math.max(0, (y - top) / hh)) : 0.5
    return cands.map((b) => {
      const text = a.kind === 'text' ? dice(norm(a.text ?? ''), norm(b.text ?? '')) : null
      const kb = kindOf(b)
      const kind = ka === kb ? 1 : (ka === 'heading' && kb === 'body') || (ka === 'body' && kb === 'heading') || (ka === 'label' && kb === 'body') || (ka === 'body' && kb === 'label') ? 0.5 : 0
      const structure = ancB ? (inside(b.box, ancB.box) >= 0.9 ? 1 : 0) : 0.5
      const order = anc && ancB ? 1 - Math.abs(rel(a.box.y + a.box.h / 2, anc.box.y, anc.box.h) - rel(b.box.y + b.box.h / 2, ancB.box.y, ancB.box.h)) : 1 - Math.abs(a.box.y / A.height - b.box.y / B.height)
      const style = a.kind === 'frame' ? (a.fill && b.fill ? 1 - Math.min(1, Math.hypot(a.fill[0] - b.fill[0], a.fill[1] - b.fill[1], a.fill[2] - b.fill[2]) / 120) : 0.3) : 1 - Math.min(1, Math.abs(Math.log(a.box.h / b.box.h)) / 0.7)
      const pixel = a.box.w >= 8 && a.box.h >= 8 && b.box.w >= 8 && b.box.h >= 8 ? pixelScore(h(hashA, A.png, a), h(hashB, B.png, b)) : null
      const votes: (number | null)[] = [text, kind, structure, style, pixel, order]
      const ws = [W.text, W.kind, W.structure, W.style, W.pixel, W.order]
      const used = votes.map((v, i) => [ws[i] * scale[i], v] as const).filter((v): v is readonly [number, number] => v[1] !== null)
      const total = used.reduce((s, [w, v]) => s + w * v, 0) / Math.max(1e-6, used.reduce((s, [w]) => s + w, 0))
      return {b, total, votes}
    }).sort((x, y) => y.total - x.total)
  }
  const ordered = [...A.all.filter((n) => n.kind === 'frame').sort((x, y) => y.box.w * y.box.h - x.box.w * x.box.h), ...A.all.filter((n) => n.kind === 'text')]
  const agree = Array(VOTERS).fill(0), seen = Array(VOTERS).fill(0)
  for (const a of ordered) { const sc = score(a); if (sc.length < 2) continue; for (let i = 0; i < VOTERS; i++) { const r = sc.filter((c) => c.votes[i] !== null).sort((x, y) => (y.votes[i] ?? 0) - (x.votes[i] ?? 0)); if (r.length < 2 || (r[0].votes[i] ?? 0) - (r[1].votes[i] ?? 0) < 0.05) continue; seen[i]++; if (r[0].b.id === sc[0].b.id) agree[i]++ } }
  for (let i = 0; i < VOTERS; i++) scale[i] = seen[i] >= 5 ? Math.max(0.1, agree[i] / seen[i]) : 0.5
  const pending = new Set(ordered.map((n) => n.id))
  while (pending.size) {
    const best = [...pending].map((id) => { const a = byIdA.get(id)!; const sc = score(a); return {a, sc, top: sc[0]?.total ?? 0, gap: sc.length > 1 ? sc[0].total - sc[1].total : 1} }).sort((x, y) => (y.top + y.gap) - (x.top + x.gap))[0]
    pending.delete(best.a.id)
    const exact = best.sc.filter((c) => c.votes[0] === 1)
    if (exact.length === 1 && scale[0] >= 0.5) { pairs.set(best.a.id, exact[0].b.id); taken[best.a.kind].add(exact[0].b.id); continue }
    const totals = best.sc.map((c) => c.total).sort((x, y) => x - y); const median = totals[Math.floor(totals.length / 2)] ?? 0
    if (!best.sc.length || best.top < 0.3 || (best.sc.length > 2 && best.top < median + 0.1)) { pairs.set(best.a.id, null); continue }
    const dominated = best.sc.length < 2 || best.sc[1].votes.every((v, i) => { const w = best.sc[0].votes[i]; return scale[i] < 0.3 || v === null || w === null || w >= v - 0.05 })
    if (best.gap < 0.08 && !dominated) { pairs.set(best.a.id, 'ambiguous'); continue }
    pairs.set(best.a.id, best.sc[0].b.id); taken[best.a.kind].add(best.sc[0].b.id)
  }
  return {pairs, scale}
}

const widths = process.env.NO_MAIN ? [] : (process.env.WIDTHS ?? '1280,780,400').split(',').map(Number)
const designs = Object.fromEntries(widths.map((w) => [w, loadDesign(w)]))
if (widths.length) console.log('| from | to | nodes | truth twin exists | correct | wrong | ambiguous | abstained (twin exists) | abstained (no twin) | false pair (no twin) |\n|---|---|---|---|---|---|---|---|---|---|')
for (const a of widths) for (const b of widths) {
  if (a === b) continue
  const A = designs[a], B = designs[b]
  const {pairs} = pairDesigns(A, B)
  const pathToB = new Map<string, number>(); for (const [id, p] of B.truth) if (p) pathToB.set(p, id)
  const c = {exists: 0, correct: 0, wrong: 0, amb: 0, absExists: 0, absNone: 0, falseNone: 0}
  const wrongs: string[] = []
  for (const n of A.all) {
    const tp = A.truth.get(n.id) ?? null
    const twin = tp ? pathToB.get(tp) ?? null : null
    const p = pairs.get(n.id) ?? null
    if (twin !== null) c.exists++
    if (p === 'ambiguous') { c.amb++; continue }
    if (p === null) { if (twin !== null) c.absExists++; else c.absNone++; continue }
    if (twin === null) { c.falseNone++; continue }
    if (B.truth.get(p) === tp) c.correct++; else { c.wrong++; if (wrongs.length < 4) wrongs.push(`"${n.text ?? 'frame'}" -> "${B.all.find((m) => m.id === p)?.text ?? 'frame'}" (twin "${B.all.find((m) => m.id === twin)?.text ?? 'frame'}")`) }
  }
  console.log(`| ${a} | ${b} | ${A.all.length} | ${c.exists} | ${c.correct} | ${c.wrong} | ${c.amb} | ${c.absExists} | ${c.absNone} | ${c.falseNone} |`)
  if (wrongs.length) console.log('  wrong:', wrongs.join(' · '))
}
