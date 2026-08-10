import {createRequire} from 'node:module'
import {writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const {chromium} = require('playwright')

const STEPS = [
  {verb: 'fill', target: 'Full name', selector: '#name', value: 'Omri Katz', kind: 'fill'},
  {verb: 'fill', target: 'Email', selector: '#email', value: 'omri@payzen.com', kind: 'fill'},
  {verb: 'fill', target: 'Age', selector: '#age', value: '34', kind: 'fill'},
  {verb: 'select', target: 'Role', selector: '#role', value: 'Full Stack', kind: 'select'},
  {verb: 'check', target: 'Accept the terms of service', selector: '#terms', kind: 'check'},
  {verb: 'check', target: 'Subscribe to the newsletter', selector: '#news', kind: 'check'},
  {verb: 'fill', target: 'Bio', selector: '#bio', value: 'Building web tools at Payzen.', kind: 'fill'},
]

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({viewport: {width: 800, height: 520}, deviceScaleFactor: 2})
  await page.goto(`file://${join(here, 'fake-form.html')}`)

  const frames = []
  const shot = async () => (await page.screenshot({type: 'jpeg', quality: 82})).toString('base64')

  frames.push({label: 'initial', img: await shot(), rect: null})

  for (const step of STEPS) {
    const el = page.locator(step.selector)
    if (step.kind === 'fill') await el.fill(step.value)
    if (step.kind === 'select') await el.selectOption({label: step.value})
    if (step.kind === 'check') await el.check()
    const box = await el.boundingBox()
    frames.push({
      label: `${step.verb} ${step.target}`,
      img: await shot(),
      rect: box,
      step: {verb: step.verb, target: step.target, value: step.value ?? null},
    })
  }

  await browser.close()
  await writeFile(join(here, 'capture.json'), JSON.stringify({viewport: {width: 800, height: 520}, frames}))
  console.log(`captured ${frames.length} frames`)
}

await main()
