import {GRAB_FILE_NAME, GRAB_MIME, grabToPayload} from '@conciv/grab/grab-attachment'
import type {Grab, GrabProvider} from '@conciv/grab'
import type {PersistedAttachment} from '@conciv/contract'

export const HERO_GRAB: Grab = {
  text: '<h1 class="title">Payroll Deposit</h1> at src/routes/index.tsx:12:9',
  snippet: '<h1 class="title">Payroll Deposit</h1>',
  preview: {kind: 'dom', html: '<p>Payroll Deposit clone</p>', width: 200, height: 40},
  source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
  rect: {x: 0, y: 0, width: 200, height: 40},
}

export const PRICING_GRAB: Grab = {
  text: '<table class="plans">Pricing</table> at src/routes/pricing.tsx:4:1',
  snippet: '<table class="plans">Pricing</table>',
  preview: {kind: 'dom', html: '<p>Pricing table clone</p>', width: 200, height: 40},
  source: {componentName: 'Pricing', filePath: 'src/routes/pricing.tsx', lineNumber: 4},
  rect: {x: 0, y: 0, width: 200, height: 40},
}

export const HERO_LABEL = 'Hero at src/routes/index.tsx:12'

export const PRICING_LABEL = 'Pricing at src/routes/pricing.tsx:4'

export function tallGrab(componentName: string, height: number): Grab {
  return {
    text: `<section>${componentName}</section> at src/routes/${componentName}.tsx:1:1`,
    snippet: `<section>${componentName}</section>`,
    preview: {kind: 'dom', html: `<p>${componentName} clone</p>`, width: 200, height},
    source: {componentName, filePath: `src/routes/${componentName}.tsx`, lineNumber: 1},
    rect: {x: 0, y: 0, width: 200, height},
  }
}

export function persistedGrab(id: string, grab: Grab): PersistedAttachment {
  const bytes = new TextEncoder().encode(JSON.stringify(grabToPayload(grab)))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return {id, type: 'document', name: GRAB_FILE_NAME, contentType: GRAB_MIME, data: btoa(binary)}
}

export function grabProviderFor(...grabs: Grab[]): GrabProvider {
  const queue = [...grabs]
  const take = async (): Promise<Grab> => (queue.length > 1 ? (queue.shift() ?? HERO_GRAB) : (queue[0] ?? HERO_GRAB))
  return () => ({pick: take, comment: take, cancel: () => {}, isActive: () => false})
}
