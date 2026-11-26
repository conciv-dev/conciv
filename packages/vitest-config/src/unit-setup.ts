import {afterEach, beforeEach, inject} from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    concivPollTimeoutMs: number
    concivViewport: {width: number; height: number}
  }
}

function describeElement(element: Element): string {
  const role = element.getAttribute('role')
  if (role) return `<${element.localName} role="${role}">`
  if (element.id) return `<${element.localName} id="${element.id}">`
  return `<${element.localName}>`
}

function failOnLeftoverBody(): void {
  const first = document.body.firstElementChild
  if (!first) return
  const count = document.body.childElementCount
  document.body.replaceChildren()
  throw new Error(
    `this test left ${count} element(s) in document.body after cleanup, the first ${describeElement(first)}. ` +
      'Render through @internal/frontend-test-utils, which removes what it renders when the test ends. ' +
      'The leftovers were removed so later files start on an empty page.',
  )
}

async function watchTheDom(): Promise<void> {
  if (typeof document === 'undefined') return
  await import('@testing-library/jest-dom/vitest')
  const {cleanup, configure} = await import('@solidjs/testing-library')
  configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})
  beforeEach(({onTestFinished}) => onTestFinished(failOnLeftoverBody))
  afterEach(cleanup)
}

await watchTheDom()
