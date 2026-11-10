import react from '@vitejs/plugin-react'
import type {Page} from 'playwright'
import {EXTENSIONS_ROUTE} from '@conciv/extension-compiler/extensions'

export async function injectWidget(input: {page: Page; apiBase: string}): Promise<void> {
  await input.page.evaluate((base) => {
    const metas = `<meta name="conciv-api-base" content="${base}"><meta name="conciv-widget" content="{}">`
    document.head.insertAdjacentHTML('beforeend', metas)
  }, input.apiBase)
  await input.page.addScriptTag({type: 'module', content: WIDGET_BOOT})
}

const WIDGET_BOOT = `${react.preambleCode.replace('__BASE__', '/')}\nawait import(${JSON.stringify(EXTENSIONS_ROUTE)})`
