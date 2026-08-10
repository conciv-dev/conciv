import {readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const capture = JSON.parse(await readFile(join(here, 'capture.json'), 'utf8'))

const html = `<title>Page session card — spike</title>
<style>
  :root {
    --ground: #0b0c0f; --card: #141619; --line: rgba(255,255,255,.08); --line-2: rgba(255,255,255,.14);
    --text: #e9ebee; --muted: #8b93a0; --faint: #5c6470; --accent: #5b9dff; --ok: #39d98a;
    --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; }
  body { background: var(--ground); color: var(--text); font-family: var(--sans); margin: 0; padding: 48px 20px 96px; -webkit-font-smoothing: antialiased; }
  .stage { max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px; }
  .stage-head h1 { font-size: 17px; font-weight: 600; margin: 0 0 6px; letter-spacing: -0.01em; }
  .stage-head p { font-size: 13px; color: var(--muted); margin: 0; line-height: 1.5; }
  .exhibit-label { font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); margin: 0 0 10px; }

  .psc { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .psc-chrome { display: flex; align-items: center; gap: 10px; padding: 9px 12px; }
  .psc-dots { display: flex; gap: 5px; flex-shrink: 0; }
  .psc-dots span { width: 8px; height: 8px; border-radius: 50%; opacity: .55; }
  .psc-dots span:nth-child(1) { background: #f5655b; }
  .psc-dots span:nth-child(2) { background: #f6bd4f; }
  .psc-dots span:nth-child(3) { background: #43c465; }
  .psc-url { flex: 1; min-width: 0; font-family: var(--mono); font-size: 11px; color: var(--muted); background: rgba(255,255,255,.045); border-radius: 99px; padding: 4px 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .psc-live { font-family: var(--mono); font-size: 10px; color: var(--accent); display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; }
  .psc-live i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .3; } }

  .psc-screen { position: relative; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); aspect-ratio: 800 / 520; overflow: hidden; background: #0e1013; }
  .psc-cam { position: absolute; top: 0; left: 0; width: 800px; height: 520px; transform-origin: 0 0; transition: transform 700ms cubic-bezier(.32,.72,0,1); }
  .psc-cam img.frame { position: absolute; top: 0; left: 0; width: 800px; height: 520px; opacity: 0; transition: opacity 260ms ease; }
  .psc-cam img.frame.show { opacity: 1; }

  .psc-pointer { position: absolute; width: 18px; height: 18px; z-index: 30; transition: left 550ms cubic-bezier(.4,0,.2,1), top 550ms cubic-bezier(.4,0,.2,1); filter: drop-shadow(0 2px 5px rgba(20,40,90,.45)); pointer-events: none; }
  .psc-ripple { position: absolute; z-index: 29; width: 36px; height: 36px; margin: -18px; border-radius: 50%; border: 2px solid var(--accent); opacity: 0; pointer-events: none; }
  .psc-ripple.go { animation: ripple 480ms ease-out; }
  @keyframes ripple { 0% { opacity: .85; transform: scale(.25); } 100% { opacity: 0; transform: scale(1.25); } }
  .psc-highlight { position: absolute; z-index: 25; pointer-events: none; border: 1.5px solid var(--accent); border-radius: 7px; box-shadow: 0 0 0 3px rgba(91,157,255,.18); opacity: 0; transition: all 420ms cubic-bezier(.32,.72,0,1); }
  .psc-highlight.on { opacity: 1; }
  .psc-trail { position: absolute; width: 7px; height: 7px; margin: -3.5px; border-radius: 50%; background: var(--accent); pointer-events: none; z-index: 28; }

  .psc-status { display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 12.5px; }
  .psc-verb { font-family: var(--mono); font-size: 11px; color: var(--accent); background: rgba(91,157,255,.1); border-radius: 5px; padding: 2.5px 7px; flex-shrink: 0; min-width: 52px; text-align: center; }
  .psc-target { flex: 1; min-width: 0; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .psc-count { font-family: var(--mono); font-size: 11px; color: var(--faint); flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .psc-playbtn { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--line-2); background: transparent; color: var(--text); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px; padding: 0; transition: background 150ms; }
  .psc-playbtn:hover { background: rgba(255,255,255,.07); }
  .psc-playbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  .psc-steps { border-top: 1px solid var(--line); padding: 6px 0; }
  .psc-step { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 14px; background: transparent; border: none; text-align: left; color: var(--muted); font-size: 12.5px; font-family: var(--sans); cursor: pointer; transition: background 150ms, color 150ms; }
  .psc-step:hover { background: rgba(255,255,255,.03); }
  .psc-step:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .psc-step .g { width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0; border: 1px solid var(--line); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: var(--faint); transition: all 150ms; }
  .psc-step .v { font-family: var(--mono); font-size: 10.5px; width: 58px; flex-shrink: 0; color: var(--faint); }
  .psc-step .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .psc-step .val { font-family: var(--mono); font-size: 10.5px; color: var(--faint); max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .psc-step.done { color: var(--text); }
  .psc-step.done .g { color: var(--ok); border-color: rgba(57,217,138,.35); }
  .psc-step.active { color: var(--text); background: rgba(91,157,255,.07); }
  .psc-step.active .g { border-color: var(--accent); color: var(--accent); }
  .psc-step.pending .g { opacity: .5; }

  .psc-summary { display: flex; align-items: center; gap: 10px; padding: 10px 14px; font-size: 12.5px; cursor: pointer; background: transparent; border: none; width: 100%; color: var(--text); font-family: var(--sans); text-align: left; }
  .psc-summary:hover { background: rgba(255,255,255,.03); }
  .psc-summary .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); flex-shrink: 0; }
  .psc-summary .s-title { flex: 1; }
  .psc-summary .s-meta { font-family: var(--mono); font-size: 11px; color: var(--faint); }
  .psc-summary .chev { color: var(--faint); font-size: 10px; }

  .shimmer { background: linear-gradient(100deg, var(--muted) 40%, var(--text) 50%, var(--muted) 60%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: shine 1.8s linear infinite; }
  @keyframes shine { to { background-position: -200% 0; } }
  .note { font-size: 12px; color: var(--faint); line-height: 1.55; margin: 10px 2px 0; }
  @media (prefers-reduced-motion: reduce) {
    .psc-cam, .psc-pointer, .psc-highlight, .psc-cam img.frame { transition: none; }
    .psc-live i, .shimmer { animation: none; }
  }
</style>

<div class="stage">
  <div class="stage-head">
    <h1>Page session card — visual spike (real screenshots)</h1>
    <p>The screen is now a stack of actual Chromium screenshots, one per action — captured with Playwright exactly the way the recorder's keyframe renderer would produce them. Camera, pointer and highlight animate over the stills. This is the honest floor of what ships.</p>
  </div>

  <section>
    <p class="exhibit-label">A · Expanded, replay over stills</p>
    <div class="psc">
      <div class="psc-chrome">
        <span class="psc-dots"><span></span><span></span><span></span></span>
        <span class="psc-url">localhost:3000/form</span>
        <span class="psc-live" id="liveBadge" hidden><i></i>replay</span>
      </div>
      <div class="psc-screen" id="screenA"><div class="psc-cam" id="camA"></div></div>
      <div class="psc-status">
        <button class="psc-playbtn" id="playBtn" aria-label="Play replay">▶</button>
        <span class="psc-verb" id="sVerb">—</span>
        <span class="psc-target" id="sTarget">Ready</span>
        <span class="psc-count" id="sCount">0/7</span>
      </div>
      <div class="psc-steps" id="stepRail"></div>
    </div>
    <p class="note">Each step: camera eases onto the element, pointer moves, click ripple, then the screenshot swaps to the post-action frame. Click a step to seek.</p>
  </section>

  <section>
    <p class="exhibit-label">B · Collapsed, settled</p>
    <div class="psc">
      <div class="psc-chrome">
        <span class="psc-dots"><span></span><span></span><span></span></span>
        <span class="psc-url">localhost:3000/form</span>
      </div>
      <div class="psc-screen"><div class="psc-cam" id="camB"></div></div>
      <button class="psc-summary">
        <span class="dot"></span>
        <span class="s-title">Filled the profile form</span>
        <span class="s-meta">7 actions · 12s</span>
        <span class="chev">▾</span>
      </button>
    </div>
    <p class="note">Poster = the final keyframe with the action trail. One line tells the story; expand for the rail.</p>
  </section>

  <section>
    <p class="exhibit-label">C · While the AI is driving</p>
    <div class="psc">
      <div class="psc-chrome">
        <span class="psc-dots"><span></span><span></span><span></span></span>
        <span class="psc-url">localhost:3000/form</span>
        <span class="psc-live"><i></i>acting</span>
      </div>
      <div class="psc-steps" style="border-top:none">
        <div class="psc-step done"><span class="g">✓</span><span class="v">fill</span><span class="t">Full name</span><span class="val">“Omri Katz”</span></div>
        <div class="psc-step done"><span class="g">✓</span><span class="v">fill</span><span class="t">Email</span><span class="val">“omri@payzen.com”</span></div>
        <div class="psc-step done"><span class="g">✓</span><span class="v">select</span><span class="t">Role</span><span class="val">Full Stack</span></div>
        <div class="psc-step active"><span class="g">◌</span><span class="v">check</span><span class="t shimmer">Checking “Accept terms”…</span></div>
      </div>
    </div>
    <p class="note">No screen while driving — the live page is right behind the widget. Steps append; the active row shimmers.</p>
  </section>
</div>

<script>
  const DATA = ${JSON.stringify(capture)}
  const PAGE_W = DATA.viewport.width
  const PAGE_H = DATA.viewport.height
  const FRAMES = DATA.frames
  const STEPS = FRAMES.slice(1).map((frame) => ({...frame.step, rect: frame.rect}))

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, reduced ? 0 : ms)) }

  function fitCamera(screen, cam, rect) {
    const sw = screen.clientWidth
    const sh = screen.clientHeight
    const scale = Math.min(sw / rect.w, sh / rect.h)
    const tx = -rect.x * scale + (sw - rect.w * scale) / 2
    const ty = -rect.y * scale + (sh - rect.h * scale) / 2
    cam.style.transform = \`translate(\${tx}px, \${ty}px) scale(\${scale})\`
  }
  function fullView() { return {x: 0, y: 0, w: PAGE_W, h: PAGE_H} }
  function zoomRectFor(rect) {
    const padX = 150, padY = 110
    const w = Math.max(rect.width + padX * 2, 360)
    const h = Math.max(rect.height + padY * 2, 240)
    const x = Math.min(Math.max(rect.x - (w - rect.width) / 2, 0), Math.max(PAGE_W - w, 0))
    const y = Math.min(Math.max(rect.y - (h - rect.height) / 2, 0), Math.max(PAGE_H - h, 0))
    return {x, y, w, h}
  }

  function mountFrames(cam) {
    return FRAMES.map((frame, i) => {
      const img = document.createElement('img')
      img.className = 'frame'
      img.alt = frame.label
      img.src = 'data:image/jpeg;base64,' + frame.img
      if (i === 0) img.classList.add('show')
      cam.appendChild(img)
      return img
    })
  }
  function showFrame(imgs, index) {
    imgs.forEach((img, i) => img.classList.toggle('show', i <= index))
  }
  function overlay(cam, className) {
    const el = document.createElement('div')
    el.className = className
    cam.appendChild(el)
    return el
  }
  function makePointer(cam) {
    const el = document.createElement('div')
    el.className = 'psc-pointer'
    el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" stroke="#3d7de0" stroke-width="1.6" d="M5 3l14 7.5-6.2 1.6L9 19z"/></svg>'
    el.style.left = '390px'
    el.style.top = '80px'
    cam.appendChild(el)
    return el
  }

  const screenA = document.getElementById('screenA')
  const camA = document.getElementById('camA')
  const imgsA = mountFrames(camA)
  const pointer = makePointer(camA)
  const ripple = overlay(camA, 'psc-ripple')
  const highlight = overlay(camA, 'psc-highlight')
  const rail = document.getElementById('stepRail')
  const sVerb = document.getElementById('sVerb')
  const sTarget = document.getElementById('sTarget')
  const sCount = document.getElementById('sCount')
  const playBtn = document.getElementById('playBtn')
  const liveBadge = document.getElementById('liveBadge')

  STEPS.forEach((step, i) => {
    const row = document.createElement('button')
    row.className = 'psc-step pending'
    row.innerHTML =
      \`<span class="g">\${i + 1}</span><span class="v">\${step.verb}</span>\` +
      \`<span class="t">\${step.target}</span>\` +
      (step.value ? \`<span class="val">“\${step.value}”</span>\` : '')
    row.addEventListener('click', () => startReplay(i))
    rail.appendChild(row)
  })
  const rows = Array.from(rail.children)

  function markRows(activeIndex) {
    rows.forEach((row, i) => {
      row.className = 'psc-step ' + (i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending')
      row.querySelector('.g').textContent = i < activeIndex ? '✓' : i + 1
    })
  }

  let runToken = 0

  async function playStep(index, token) {
    const step = STEPS[index]
    const rect = step.rect
    markRows(index)
    sVerb.textContent = step.verb
    sTarget.textContent = step.target
    sCount.textContent = \`\${index + 1}/\${STEPS.length}\`

    fitCamera(screenA, camA, zoomRectFor(rect))
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    pointer.style.left = cx + 'px'
    pointer.style.top = cy + 'px'
    highlight.style.left = (rect.x - 4) + 'px'
    highlight.style.top = (rect.y - 4) + 'px'
    highlight.style.width = (rect.width + 8) + 'px'
    highlight.style.height = (rect.height + 8) + 'px'
    highlight.classList.add('on')
    await sleep(680)
    if (token !== runToken) return

    ripple.style.left = cx + 'px'
    ripple.style.top = cy + 'px'
    ripple.classList.remove('go')
    void ripple.offsetWidth
    ripple.classList.add('go')
    await sleep(240)
    if (token !== runToken) return

    showFrame(imgsA, index + 1)
    await sleep(620)
  }

  async function startReplay(fromIndex) {
    runToken += 1
    const token = runToken
    liveBadge.hidden = false
    playBtn.textContent = '❚❚'
    showFrame(imgsA, fromIndex)
    fitCamera(screenA, camA, fullView())
    await sleep(500)
    for (let i = fromIndex; i < STEPS.length; i++) {
      if (token !== runToken) return
      await playStep(i, token)
    }
    if (token !== runToken) return
    highlight.classList.remove('on')
    fitCamera(screenA, camA, fullView())
    markRows(STEPS.length)
    sVerb.textContent = 'done'
    sTarget.textContent = 'Filled the profile form'
    sCount.textContent = \`\${STEPS.length}/\${STEPS.length}\`
    liveBadge.hidden = true
    playBtn.textContent = '▶'
  }

  playBtn.addEventListener('click', () => startReplay(0))

  const camB = document.getElementById('camB')
  const imgsB = mountFrames(camB)
  showFrame(imgsB, FRAMES.length - 1)
  STEPS.forEach((step, i) => {
    const dot = overlay(camB, 'psc-trail')
    dot.style.left = (step.rect.x + step.rect.width / 2) + 'px'
    dot.style.top = (step.rect.y + step.rect.height / 2) + 'px'
    dot.style.opacity = String(0.25 + (0.65 * (i + 1)) / STEPS.length)
  })

  function layoutAll() {
    fitCamera(document.getElementById('screenA'), camA, fullView())
    fitCamera(camB.parentElement, camB, fullView())
  }
  layoutAll()
  addEventListener('resize', layoutAll)
  setTimeout(() => startReplay(0), 900)
</script>
`

const out = join(here, 'page-session-card-spike.html')
await writeFile(out, html)
console.log(`wrote ${out} (${Math.round(html.length / 1024)}KB)`)
