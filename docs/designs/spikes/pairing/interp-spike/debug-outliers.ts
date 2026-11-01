import {chromium} from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1600, height: 1000}})
await p.goto('file://' + process.cwd() + '/viewer2-site.html'); await p.waitForTimeout(500)
await p.evaluate(() => {
  const g = globalThis as unknown as {errDetail: unknown[]}
  g.errDetail = []
  const orig = Array.prototype.push
  void orig
})
for (const w of ['600', '900', '440']) {
  await p.fill('#w', w); await p.dispatchEvent('#w', 'input'); await p.waitForTimeout(600)
  const rows = await p.evaluate((w) => {
    const g = globalThis as unknown as Record<string, unknown>
    const byWidth = g.byWidth as Record<string, {path: string; lineRects?: {x: number; y: number; w: number; h: number}[]}[]>
    const ocrAll = g.ocrAll as Record<string, {text: string; box: {x: number; y: number; w: number; h: number}}[]>
    const design = g.design as Record<string, {text: {text: string; box: {x: number; y: number; w: number; h: number}}[]}>
    const d = +(document.querySelector('#d') as HTMLSelectElement).value
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const domD = new Map(byWidth[d].map((e) => [e.path, e])), domW = new Map(byWidth[w].map((e) => [e.path, e]))
    const iou = (a: {x: number; y: number; w: number; h: number}, b: {x: number; y: number; w: number; h: number}) => { const ww = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), hh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (ww <= 0 || hh <= 0) return 0; const i = ww * hh; return i / (a.w * a.h + b.w * b.h - i) }
    const out: string[] = []
    for (const r of design[d].text) {
      let best: {path: string; i: number; r: {x: number; y: number; w: number; h: number}} | null = null, bs = 0
      for (const e of byWidth[d]) (e.lineRects ?? []).forEach((lr, i) => { const s = iou(r.box, lr); if (s > bs) { bs = s; best = {path: e.path, i, r: lr} } })
      if (!best || bs < 0.3) continue
      const A = domD.get(best.path), B = domW.get(best.path)
      if (!A?.lineRects || !B?.lineRects || A.lineRects.length !== B.lineRects.length) continue
      const a = A.lineRects[best.i], bb = B.lineRects[best.i]
      const pr = {x: r.box.x + bb.x - a.x, y: r.box.y + bb.y - a.y, w: r.box.w + bb.w - a.w, h: r.box.h + bb.h - a.h}
      let bo: {text: string; box: {x: number; y: number; w: number; h: number}} | null = null, bd = 1e9
      for (const o of ocrAll[w]) { const n1 = norm(r.text), n2 = norm(o.text); const A2 = new Set(Array.from({length: n1.length - 1}, (_, i) => n1.slice(i, i + 2))), B2 = new Set(Array.from({length: n2.length - 1}, (_, i) => n2.slice(i, i + 2))); let c = 0; for (const x of A2) if (B2.has(x)) c++; if (2 * c / (A2.size + B2.size) < 0.6) continue; const dd = Math.hypot(o.box.x - pr.x, o.box.y - pr.y); if (dd < bd) { bd = dd; bo = o } }
      if (!bo || bd >= 150) continue
      const err = Math.max(Math.abs(pr.x - bo.box.x), Math.abs(pr.y - bo.box.y), Math.abs(pr.x + pr.w - bo.box.x - bo.box.w), Math.abs(pr.y + pr.h - bo.box.y - bo.box.h))
      if (err > 6) out.push(JSON.stringify({text: r.text.slice(0, 24), err: Math.round(err), pred: [pr.x, pr.y, pr.w, pr.h].map(Math.round), ocrW: [bo.box.x, bo.box.y, bo.box.w, bo.box.h].map(Math.round), ocrWtext: bo.text.slice(0, 24), lineA: [a.x, a.w].map(Math.round), lineB: [bb.x, bb.w].map(Math.round), path: best.path}))
    }
    return out
  }, w)
  console.log('== width', w); for (const r of rows) console.log(r)
}
await b.close()
