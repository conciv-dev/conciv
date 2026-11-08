import puppeteer, {type Browser, type Page} from 'puppeteer-core'
import {pageVerbError} from '@conciv/extension'
import {captureDef, screenshotNodeDef} from '@conciv/extension-page/defs'
import type {Driver} from '../driver.js'

export function cdpDriver(input: {endpoint: string}): Driver {
  const connection: {browser: Promise<Browser> | null} = {browser: null}
  const browser = (): Promise<Browser> => {
    connection.browser ??= puppeteer.connect({...target(input.endpoint), protocol: 'cdp', defaultViewport: null})
    return connection.browser
  }
  const pageAt = async (at: {href: string; verb: string}): Promise<Page> => {
    const pages = await (await browser()).pages()
    const page = pages.find((candidate) => candidate.url() === at.href)
    if (page === undefined)
      throw pageVerbError('handler-error', DRIVER, at.verb, `the browser at ${input.endpoint} has no tab on ${at.href}`)
    return page
  }
  return {
    capture: async ({href, width, height, scale, hide}) => {
      const page = await pageAt({href, verb: captureDef.name})
      await page.evaluate(hidden, {selectors: hide, visibility: 'hidden'})
      const image = await page
        .screenshot({
          type: 'png',
          encoding: 'base64',
          clip: {x: 0, y: 0, width, height, scale},
          captureBeyondViewport: true,
        })
        .finally(() => page.evaluate(hidden, {selectors: hide, visibility: ''}))
      return {image, width: Math.round(width * scale), height: Math.round(height * scale), path: 'cdp'}
    },
    node: async ({href, selector, width, height, scale, reference}) => {
      const page = await pageAt({href, verb: screenshotNodeDef.name})
      const element = await page.$(selector)
      if (element === null)
        throw pageVerbError('handler-error', DRIVER, screenshotNodeDef.name, `no element matches ${selector}`)
      const shot = await element.screenshot({type: 'png', encoding: 'base64'})
      await page.evaluate(hidden, {selectors: [selector], visibility: 'hidden'})
      const behind = await element
        .screenshot({type: 'png', encoding: 'base64'})
        .finally(() => page.evaluate(hidden, {selectors: [selector], visibility: ''}))
      const size = {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))}
      const drawn = await page.evaluate(drawBoth, {
        shot: `${PNG_DATA_URL}${shot}`,
        behind: `${PNG_DATA_URL}${behind}`,
        reference: reference ?? null,
        ...size,
      })
      return {...drawn, ...size}
    },
    close: async () => {
      const open = connection.browser
      connection.browser = null
      if (open !== null) await (await open).disconnect()
    },
  }
}

const PNG_DATA_URL = 'data:image/png;base64,'
const DRIVER = 'browser-driver'

function target(endpoint: string): {browserURL: string} | {browserWSEndpoint: string} {
  return endpoint.startsWith('ws') ? {browserWSEndpoint: endpoint} : {browserURL: endpoint}
}

function hidden(input: {selectors: string[]; visibility: string}): void {
  for (const selector of input.selectors)
    for (const element of document.querySelectorAll<HTMLElement>(selector))
      element.style.setProperty('visibility', input.visibility)
}

async function drawBoth(input: {
  shot: string
  behind: string
  reference: string | null
  width: number
  height: number
}): Promise<{image: string; reference: string | null}> {
  const draw = async (urls: string[]): Promise<string> => {
    const canvas = document.createElement('canvas')
    canvas.width = input.width
    canvas.height = input.height
    for (const url of urls) {
      const image = new Image()
      image.src = url
      await image.decode()
      canvas.getContext('2d')?.drawImage(image, 0, 0, input.width, input.height)
    }
    const data = canvas.toDataURL('image/png')
    return data.slice(data.indexOf(',') + 1)
  }
  return {
    image: await draw([input.shot]),
    reference: input.reference === null ? null : await draw([input.behind, input.reference]),
  }
}
