import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import plugin from './plugin.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const renderImport = "import {render} from 'solid-js/web'"
const renderError = {messageId: 'solidWebRenderInTest', data: {name: 'render'}}

tester.run('solid-test-render', plugin.rules['solid-test-render'], {
  valid: [
    {name: 'a source file', code: renderImport, filename: '/repo/src/view.tsx'},
    {name: 'a testing folder', code: renderImport, filename: '/repo/testing/view.tsx'},
    {name: 'a folder ending in test', code: renderImport, filename: '/repo/mytest/view.tsx'},
    {name: 'an mjs file in a test folder', code: renderImport, filename: '/repo/test/view.mjs'},
    {name: 'an mts test file', code: renderImport, filename: '/repo/view.test.mts'},
    {name: 'the host fixture entry', code: renderImport, filename: '/repo/test/fixtures/host/main.tsx'},
    {name: 'the host fixture entry, Windows', code: renderImport, filename: '/repo\\test\\fixtures\\host\\main.tsx'},
    {name: 'render from solid-js', code: "import {render} from 'solid-js'", filename: '/repo/view.test.tsx'},
    {
      name: 'createRoot from solid-js/web',
      code: "import {createRoot} from 'solid-js/web'",
      filename: '/repo/view.test.tsx',
    },
    {
      name: 'a path repeating /test/ 80000 times',
      code: renderImport,
      filename: `/repo/test/${'/test/'.repeat(80_000)}view.mjs`,
    },
  ],
  invalid: [
    {name: 'a test folder', code: renderImport, filename: '/repo/test/view.ts', errors: [renderError]},
    {name: 'a test folder, Windows', code: renderImport, filename: '/repo\\test\\view.tsx', errors: [renderError]},
    {name: 'a .test.js file', code: renderImport, filename: '/repo/view.test.js', errors: [renderError]},
    {name: 'a .spec.tsx file', code: renderImport, filename: '/repo/view.spec.tsx', errors: [renderError]},
    {
      name: 'another host fixture file',
      code: renderImport,
      filename: '/repo/test/fixtures/host/other.tsx',
      errors: [renderError],
    },
    {
      name: 'hydrate',
      code: "import {hydrate} from 'solid-js/web'",
      filename: '/repo/view.test.ts',
      errors: [{messageId: 'solidWebRenderInTest', data: {name: 'hydrate'}}],
    },
  ],
})
