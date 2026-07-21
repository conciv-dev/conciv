import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import {BuildErrorsCard} from '../src/tool/build-errors-card.js'
import {RouteManifestCard} from '../src/tool/route-manifest-card.js'

const BUILD_ERRORS = JSON.stringify([
  {
    id: 'build:/app/src/routes/about.tsx:12:8:1',
    kind: 'build',
    message: "Expected ';' but found '='",
    stack: null,
    source: {file: '/app/src/routes/about.tsx', line: 12, column: 8},
    digest: null,
    at: 1,
  },
])

const ROUTE_MANIFEST = JSON.stringify([
  {path: '/', kind: 'layout', dynamic: false, file: '/app/src/routes/__root'},
  {path: '/', kind: 'page', dynamic: false, file: '/app/src/routes/index'},
  {path: '/posts/$postId', kind: 'page', dynamic: true, file: '/app/src/routes/posts.$postId'},
])

describe('BuildErrorsCard (real browser)', () => {
  it('renders a loading affordance while the tool is running', async () => {
    mountToolCard(BuildErrorsCard, {name: 'tanstack_build_errors'})
    await expect.element(page.getByText('reading…')).toBeVisible()
  })

  it('lists the build error message and location on success', async () => {
    mountToolCard(BuildErrorsCard, {name: 'tanstack_build_errors', content: BUILD_ERRORS})
    await expect.element(page.getByText('1 error')).toBeVisible()
    await page.getByRole('button', {name: /tanstack_build_errors/}).click()
    await expect.element(page.getByText("Expected ';' but found '='")).toBeVisible()
    await expect.element(page.getByText('/app/src/routes/about.tsx:12')).toBeVisible()
  })

  it('shows a clean state when there are no build errors', async () => {
    mountToolCard(BuildErrorsCard, {name: 'tanstack_build_errors', content: JSON.stringify([])})
    await expect.element(page.getByText('no errors')).toBeVisible()
    await page.getByRole('button', {name: /tanstack_build_errors/}).click()
    await expect.element(page.getByText('No build errors')).toBeVisible()
  })

  it('renders the error message when the tool fails', async () => {
    mountToolCard(BuildErrorsCard, {
      name: 'tanstack_build_errors',
      content: JSON.stringify({code: 'handler-error', message: 'bundler bridge unavailable'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_build_errors/}).click()
    await expect.element(page.getByText('bundler bridge unavailable')).toBeVisible()
  })
})

describe('RouteManifestCard (real browser)', () => {
  it('renders a loading affordance while the tool is running', async () => {
    mountToolCard(RouteManifestCard, {name: 'tanstack_route_manifest'})
    await expect.element(page.getByText('reading…')).toBeVisible()
  })

  it('lists the routes with kind and dynamic markers on success', async () => {
    mountToolCard(RouteManifestCard, {name: 'tanstack_route_manifest', content: ROUTE_MANIFEST})
    await expect.element(page.getByText('3 routes')).toBeVisible()
    await page.getByRole('button', {name: /tanstack_route_manifest/}).click()
    await expect.element(page.getByText('/posts/$postId')).toBeVisible()
    await expect.element(page.getByText('layout')).toBeVisible()
    await expect.element(page.getByText('dynamic')).toBeVisible()
  })

  it('renders the error message when the tool fails', async () => {
    mountToolCard(RouteManifestCard, {
      name: 'tanstack_route_manifest',
      content: JSON.stringify({code: 'handler-error', message: 'routeTree.gen not found'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_route_manifest/}).click()
    await expect.element(page.getByText('routeTree.gen not found')).toBeVisible()
  })
})
