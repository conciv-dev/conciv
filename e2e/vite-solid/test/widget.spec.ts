import {join} from 'node:path'
import {test} from '@playwright/test'
import {
  collectFailures,
  expectPluginBundleReloadsInPlace,
  expectWidgetBoots,
  loginWidget,
} from '@conciv/e2e-utils/widget'

test('widget boots from dist in a solid vite app', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
})

test('a rebuilt project plugin bundle reloads in the open widget without a page reload', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectPluginBundleReloadsInPlace(
    page,
    failures,
    join(import.meta.dirname, '../conciv/plugins/live-line/plugin-experimental.js'),
  )
})
