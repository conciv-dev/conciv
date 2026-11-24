import {afterEach, beforeEach, inject} from 'vitest'
import {cleanup, configure} from '@solidjs/testing-library'
import '@testing-library/jest-dom/vitest'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})

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
      'Render through Testing Library render, which removes it when the test ends. ' +
      'The leftovers were removed so later files start on an empty page.',
  )
}

beforeEach(({onTestFinished}) => onTestFinished(failOnLeftoverBody))

afterEach(cleanup)
