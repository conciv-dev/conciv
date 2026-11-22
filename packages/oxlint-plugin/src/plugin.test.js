import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import plugin from './plugin.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const renderImport = "import {render} from 'solid-js/web'"
const renderError = {messageId: 'solidWebRenderInTest', data: {name: 'render'}}
const domTest = '/repo/src/view.dom.test.tsx'

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

tester.run('no-delegated-focus', plugin.rules['no-delegated-focus'], {
  valid: [
    {name: 'a focus handler Solid does not delegate', code: '<input onFocus={open} />', filename: 'view.tsx'},
    {name: 'a native focusin listener', code: '<input on:focusin={open} />', filename: 'view.tsx'},
  ],
  invalid: [
    {
      name: 'onFocusIn',
      code: '<input onFocusIn={open} />',
      filename: 'view.tsx',
      errors: [{messageId: 'delegatedFocus', data: {name: 'onFocusIn'}}],
    },
    {
      name: 'onfocusout',
      code: '<input onfocusout={close} />',
      filename: 'view.tsx',
      errors: [{messageId: 'delegatedFocus', data: {name: 'onfocusout'}}],
    },
  ],
})

tester.run('tool-card-shell', plugin.rules['tool-card-shell'], {
  valid: [
    {
      name: 'inside the chat kit',
      code: "import {CollapsibleCard} from '@conciv/ui-kit-chat'",
      filename: '/repo/packages/ui-kit-chat/src/tools/card.tsx',
    },
    {
      name: 'a public kit part',
      code: "import {CardShell} from '@conciv/ui-kit-chat/tools'",
      filename: '/repo/apps/conciv/src/card.tsx',
    },
    {
      name: 'another package with the kit name as a prefix',
      code: "import {CollapsibleCard} from '@conciv/ui-kit-chat-tools'",
      filename: '/repo/apps/conciv/src/card.tsx',
    },
  ],
  invalid: [
    {
      name: 'the internal card outside the kit',
      code: "import {CollapsibleCard} from '@conciv/ui-kit-chat/tools'",
      filename: '/repo/apps/conciv/src/card.tsx',
      errors: [{messageId: 'collapsibleCardOutsideKit'}],
    },
  ],
})

tester.run('user-event-only', plugin.rules['user-event-only'], {
  valid: [
    {
      name: 'the IME guard',
      code: "import {fireEvent} from '@solidjs/testing-library'\nfireEvent.keyDown(input, {isComposing: true})",
      filename: domTest,
    },
    {
      name: 'the IME guard through a namespace',
      code: "import * as dom from '@testing-library/dom'\ndom.fireEvent.keyDown(input, {isComposing: true})",
      filename: domTest,
    },
    {
      name: 'a file that is not a dom test',
      code: "import {fireEvent} from '@solidjs/testing-library'\nfireEvent.click(button)",
      filename: '/repo/src/view.browser.test.tsx',
    },
    {
      name: 'fireEvent from another module',
      code: "import {fireEvent} from './events'\nfireEvent.click(button)",
      filename: domTest,
    },
  ],
  invalid: [
    {
      name: 'a fireEvent call',
      code: "import {fireEvent} from '@solidjs/testing-library'\nfireEvent.click(button)",
      filename: domTest,
      errors: [{messageId: 'fireEvent'}],
    },
    {
      name: 'an unused fireEvent import',
      code: "import {fireEvent} from '@testing-library/dom'",
      filename: domTest,
      errors: [{messageId: 'fireEvent'}],
    },
    {
      name: 'fireEvent imported under another name',
      code: "import {fireEvent as fe} from '@solidjs/testing-library'\nfe.click(button)",
      filename: domTest,
      errors: [{messageId: 'fireEvent'}],
    },
    {
      name: 'fireEvent through a namespace',
      code: "import * as dom from '@testing-library/dom'\ndom.fireEvent.click(button)",
      filename: domTest,
      errors: [{messageId: 'fireEvent'}],
    },
    {
      name: 'a keyDown that is not composing',
      code: "import {fireEvent} from '@solidjs/testing-library'\nfireEvent.keyDown(input, {isComposing: false})",
      filename: domTest,
      errors: [{messageId: 'fireEvent'}],
    },
  ],
})
