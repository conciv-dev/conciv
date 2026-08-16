import {afterEach, beforeAll, expect, test} from 'vitest'
import pageFont from '@fontsource-variable/wix-madefor-text/files/wix-madefor-text-latin-wght-normal.woff2?inline'
import {captureElement} from '../src/react-grab/capture-element.js'

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:"

const PAGE_FAMILY = "'PageBrand', monospace"

const BADGE = 'TanStack Start base template'

const PILL = 'About This Starter'

const frames: HTMLIFrameElement[] = []

const hosts: HTMLElement[] = []

beforeAll(async () => {
  const style = document.createElement('style')
  style.textContent = `@font-face{font-family:'PageBrand';src:url(${pageFont}) format('woff2');font-weight:100 900;font-display:block}`
  document.head.appendChild(style)
  await document.fonts.load('700 11px PageBrand')
  await document.fonts.load('600 12px PageBrand')
  await document.fonts.ready
  if (!document.fonts.check('700 11px PageBrand')) throw new Error('the page webfont did not load')
})

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
  for (const host of hosts.splice(0)) host.remove()
})

async function renderSnapshot(html: string, width: number, height: number): Promise<Document> {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.width = String(Math.ceil(width))
  frame.height = String(Math.ceil(height))
  frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>html{background:#fff}body{margin:0}</style></head><body>${html}</body></html>`
  document.body.appendChild(frame)
  frames.push(frame)
  await new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), {once: true})
  })
  const doc = frame.contentDocument
  if (!doc) throw new Error('the snapshot frame has no document')
  await doc.fonts.ready
  return doc
}

function mountReplica(): HTMLElement {
  const host = document.createElement('div')
  host.style.cssText = `position:absolute;top:0;left:0;font-family:${PAGE_FAMILY};background:#fff;padding:16px`
  host.innerHTML = `
    <span data-role="badge" style="display:inline-flex;align-items:center;border:1px solid #ccd;border-radius:999px;padding:4px 11px;font-size:11px;font-weight:700;letter-spacing:0.1em;line-height:16px;text-transform:uppercase;font-family:${PAGE_FAMILY}">${BADGE}</span>
    <span data-role="pill" style="display:inline-flex;align-items:center;border:1px solid #ccd;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;letter-spacing:0.01em;line-height:16px;font-family:${PAGE_FAMILY}">${PILL}</span>
  `
  document.body.appendChild(host)
  hosts.push(host)
  return host
}

function lineCount(root: ParentNode, role: string): number {
  const element = root.querySelector(`[data-role="${role}"]`)
  if (!element) throw new Error(`no element for role ${role}`)
  const text = element.firstChild
  if (!text) throw new Error(`no text node for role ${role}`)
  const range = (element.ownerDocument ?? document).createRange()
  range.selectNodeContents(element)
  return range.getClientRects().length
}

function textWidth(root: ParentNode, role: string): number {
  const element = root.querySelector(`[data-role="${role}"]`)
  if (!element) throw new Error(`no element for role ${role}`)
  const range = (element.ownerDocument ?? document).createRange()
  range.selectNodeContents(element)
  return [...range.getClientRects()].reduce((total, rect) => total + rect.width, 0)
}

test('a captured run keeps its line count when the frame falls back to another font', async () => {
  const host = mountReplica()
  await document.fonts.ready
  expect(lineCount(host, 'badge')).toBe(1)
  expect(lineCount(host, 'pill')).toBe(1)

  const preview = await captureElement(host)
  const snapshot = await renderSnapshot(preview.html, preview.width + 60, preview.height + 120)

  expect(lineCount(snapshot, 'badge')).toBe(1)
  expect(lineCount(snapshot, 'pill')).toBe(1)
})

test('a run the frame can render itself is left untouched', async () => {
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;top:0;left:0;font-family:monospace;padding:8px'
  host.innerHTML = `<span data-role="system" style="font-family:monospace;font-size:12px">${PILL}</span>`
  document.body.appendChild(host)
  hosts.push(host)
  await document.fonts.ready

  const preview = await captureElement(host)

  expect(preview.html).toContain('letter-spacing: normal')
})

test('a captured run keeps its advance width when the frame falls back to another font', async () => {
  const host = mountReplica()
  await document.fonts.ready
  const liveBadge = textWidth(host, 'badge')
  const livePill = textWidth(host, 'pill')

  const preview = await captureElement(host)
  const snapshot = await renderSnapshot(preview.html, preview.width + 60, preview.height + 120)

  expect(textWidth(snapshot, 'badge')).toBeCloseTo(liveBadge, 0)
  expect(textWidth(snapshot, 'pill')).toBeCloseTo(livePill, 0)
})
