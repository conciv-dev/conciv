import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/no-module-state.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const sourceFile = '/repo/packages/backend/src/run.ts'

tester.run('no-module-state', rule, {
  valid: [
    {
      name: 'a collection made inside a function',
      code: 'export function make() { return new Map() }',
      filename: sourceFile,
    },
    {
      name: 'a let inside a function',
      code: 'export function count() { let total = 0; return total }',
      filename: sourceFile,
    },
    {name: 'a module const that is no collection', code: "const NAME = 'run'", filename: sourceFile},
    {name: 'a read of globalThis', code: 'const host = globalThis.location', filename: sourceFile},
    {name: 'a local named globalThis', code: 'function run(globalThis) { globalThis.x = 1 }', filename: sourceFile},
    {name: 'a test file', code: 'const seen = new Set()', filename: '/repo/packages/backend/src/run.test.ts'},
    {name: 'a test folder', code: 'let seen = 0', filename: '/repo/packages/backend/test/unit/run.unit.test.ts'},
    {name: 'a src test folder', code: 'let seen = 0', filename: '/repo/packages/backend/src/test/helper.ts'},
    {name: 'a script', code: 'let seen = 0', filename: '/repo/packages/publish/scripts/run.ts'},
    {name: 'a config file', code: 'let seen = 0', filename: '/repo/packages/backend/src/uno.config.ts'},
    {
      name: 'an engine made inside the entry start function, and a module call that makes no state',
      code: "function start() { const engine = createBrowserEngine({apiBase: ''}) }\nconst Context = createContext()",
      filename: sourceFile,
    },
    {name: 'a file outside packages and apps', code: 'let seen = 0', filename: '/repo/e2e/vite-react/src/main.ts'},
  ],
  invalid: [
    {
      name: 'a module Map, Set, WeakMap and WeakSet, and a Set inside a module object literal',
      code: "const a = new Map()\nexport const b = new Set<string>()\nconst c = new WeakMap() as WeakMap<object, string>\nvar d = new WeakSet()\nexport const e = {name: 'run', inner: {seen: new Set(['x'])}}",
      filename: sourceFile,
      errors: [
        {messageId: 'moduleCollection'},
        {messageId: 'moduleCollection'},
        {messageId: 'moduleCollection'},
        {messageId: 'moduleCollection'},
        {messageId: 'moduleCollection'},
      ],
    },
    {
      name: 'a module let, with or without a collection assigned later',
      code: 'let cache\ncache = new Map()\nexport let count = 0',
      filename: '/repo/apps/conciv/src/state.tsx',
      errors: [{messageId: 'moduleLet'}, {messageId: 'moduleLet'}],
    },
    {
      name: 'an engine, connection, store and queue made at module scope',
      code: "const engine = createBrowserEngine({apiBase: ''})\nexport const connection = makeEngineConnection(base) as Connection\nconst drafts = openDraftStore()\nconst work = makeQueue<string>()",
      filename: '/repo/packages/frontend-defaults/src/entry-standalone.tsx',
      errors: [
        {messageId: 'moduleStatefulCall'},
        {messageId: 'moduleStatefulCall'},
        {messageId: 'moduleStatefulCall'},
        {messageId: 'moduleStatefulCall'},
      ],
    },
    {
      name: 'every assignment to a globalThis property',
      code: 'globalThis.a = 1\nglobalThis.b ??= 2\nglobalThis.c ||= 3\nexport function set() { globalThis["d"] = 4 }',
      filename: '/repo/packages/plugins/page/src/host.js',
      errors: [
        {messageId: 'globalThisWrite'},
        {messageId: 'globalThisWrite'},
        {messageId: 'globalThisWrite'},
        {messageId: 'globalThisWrite'},
      ],
    },
  ],
})
