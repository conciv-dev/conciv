import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './max-test-timeout.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const spec = '/repo/e2e/app/test/home.spec.ts'
const config = '/repo/e2e/app/playwright.config.ts'
const vitestConfig = '/repo/packages/app/vitest.config.ts'
const overExpect = (value) => ({messageId: 'overCap', data: {kind: 'expect', cap: '10000', value}})
const overTest = (value) => ({messageId: 'overCap', data: {kind: 'test', cap: '30000', value}})
const unresolvable = (kind, cap) => ({messageId: 'unresolvable', data: {kind, cap}})
const slowOver = (value) => ({messageId: 'slowOverCap', data: {cap: '30000', value}})
const slowUnresolvable = {messageId: 'slowUnresolvable', data: {cap: '30000'}}

tester.run('max-test-timeout', rule, {
  valid: [
    {name: 'an expect timeout at the cap', code: 'await expect(x).toBeVisible({timeout: 10_000})', filename: spec},
    {name: 'expect.poll at the cap', code: 'await expect.poll(read, {timeout: 10_000}).toBe(1)', filename: spec},
    {
      name: 'a config expect timeout at the cap',
      code: 'export default defineConfig({expect: {timeout: 10_000}})',
      filename: config,
    },
    {
      name: 'a config test timeout at the cap',
      code: 'export default defineConfig({timeout: 30_000})',
      filename: config,
    },
    {
      name: 'a vitest testTimeout at the cap',
      code: 'defineConfig({test: {testTimeout: 30_000, hookTimeout: 30_000}})',
      filename: vitestConfig,
    },
    {name: 'a test timeout option at the cap', code: "test('runs', {timeout: 30_000}, run)", filename: spec},
    {name: 'a numeric third argument at the cap', code: "it('runs', run, 30_000)", filename: spec},
    {name: 'test.setTimeout at the cap', code: 'test.setTimeout(30_000)', filename: spec},
    {
      name: 'a const at the cap',
      code: 'const wait = 10_000\nawait expect(x).toBeVisible({timeout: wait})',
      filename: spec,
    },
    {
      name: 'arithmetic of consts at the cap',
      code: 'const second = 1000\ntest.setTimeout(30 * second)',
      filename: spec,
    },
    {
      name: 'a webServer timeout',
      code: "export default defineConfig({timeout: 30_000, webServer: {command: 'vite', timeout: 180_000}})",
      filename: config,
    },
    {name: 'a page.goto timeout', code: "await page.goto('/', {timeout: 120_000})", filename: spec},
    {name: 'launch options', code: 'await chromium.launch({timeout: 120_000})', filename: spec},
    {name: 'a data matcher given an object', code: 'expect(options).toEqual({timeout: 90_000})', filename: spec},
    {name: 'an expect subject', code: 'expect({timeout: 90_000}).toBeTruthy()', filename: spec},
    {
      name: 'a describe with an options object and no timeout',
      code: "test.describe('group', {tag: '@a'}, () => {})",
      filename: spec,
    },
    {name: 'test.slow with a short file timeout', code: 'test.setTimeout(10_000)\ntest.slow()', filename: spec},
    {
      name: 'a vitest poll timeout at the cap',
      code: 'defineConfig({test: {expect: {poll: {timeout: 10_000}}}})',
      filename: vitestConfig,
    },
    {name: 'a poll timeout outside expect', code: 'run({poll: {timeout: 60_000}})', filename: vitestConfig},
    {name: 'a factory call that is not the config', code: 'await start({timeout: 120_000})', filename: config},
  ],
  invalid: [
    {
      name: 'a vitest poll timeout over the cap',
      code: 'defineConfig({test: {expect: {poll: {timeout: 10_001}}}})',
      filename: vitestConfig,
      errors: [overExpect('10001')],
    },
    {
      name: 'a config factory option exported as the config',
      code: "export default await e2eConfig('app', {dir, timeout: 150_000})",
      filename: config,
      errors: [overTest('150000')],
    },
    {
      name: 'a config factory option passed into defineConfig',
      code: "export default defineConfig(await e2eConfig('app', {timeout: 60_000}), {webServer: {timeout: 180_000}})",
      filename: config,
      errors: [overTest('60000')],
    },
    {
      name: 'a matcher timeout over the cap',
      code: 'await expect(x).toBeVisible({timeout: 10_001})',
      filename: spec,
      errors: [overExpect('10001')],
    },
    {
      name: 'a negated matcher timeout over the cap',
      code: 'await expect(x).not.toHaveText("a", {timeout: 20_000})',
      filename: spec,
      errors: [overExpect('20000')],
    },
    {
      name: 'expect.poll over the cap',
      code: 'await expect.poll(read, {timeout: 60_000}).toBe(1)',
      filename: spec,
      errors: [overExpect('60000')],
    },
    {
      name: 'a config expect timeout over the cap',
      code: 'export default defineConfig({expect: {timeout: 10_001}})',
      filename: config,
      errors: [overExpect('10001')],
    },
    {
      name: 'a project expect timeout over the cap',
      code: "defineConfig({projects: [{name: 'a', expect: {timeout: 15_000}}]})",
      filename: config,
      errors: [overExpect('15000')],
    },
    {
      name: 'a config test timeout over the cap',
      code: 'export default defineConfig({timeout: 30_001})',
      filename: config,
      errors: [overTest('30001')],
    },
    {
      name: 'a project test timeout over the cap',
      code: "defineConfig({projects: [{name: 'a', timeout: 60_000}]})",
      filename: config,
      errors: [overTest('60000')],
    },
    {
      name: 'a shared const object spread into the config',
      code: 'function build() {\n  const shared = {timeout: 90_000, workers: 1}\n  return defineConfig({...shared})\n}',
      filename: config,
      errors: [overTest('90000')],
    },
    {
      name: 'vitest timeouts over the cap',
      code: 'defineConfig({test: {testTimeout: 30_001, hookTimeout: 60_000}})',
      filename: vitestConfig,
      errors: [overTest('30001'), overTest('60000')],
    },
    {
      name: 'a test timeout option over the cap',
      code: "test('runs', {timeout: 30_001}, run)",
      filename: spec,
      errors: [overTest('30001')],
    },
    {
      name: 'a describe timeout option over the cap',
      code: "describe('group', {timeout: 45_000}, () => {})",
      filename: spec,
      errors: [overTest('45000')],
    },
    {
      name: 'a numeric third argument over the cap',
      code: "test('runs', run, 60_000)",
      filename: spec,
      errors: [overTest('60000')],
    },
    {
      name: 'test.setTimeout over the cap',
      code: 'test.setTimeout(30_001)',
      filename: spec,
      errors: [overTest('30001')],
    },
    {
      name: 'describe.configure over the cap',
      code: 'test.describe.configure({timeout: 120_000})',
      filename: spec,
      errors: [overTest('120000')],
    },
    {
      name: 'a const over the cap',
      code: 'const wait = 20_000\nawait expect(x).toBeVisible({timeout: wait})',
      filename: spec,
      errors: [overExpect('20000')],
    },
    {
      name: 'an imported value',
      code: "import {wait} from './wait'\nawait expect(x).toBeVisible({timeout: wait})",
      filename: spec,
      errors: [unresolvable('expect', '10000')],
    },
    {
      name: 'a let binding',
      code: 'let wait = 5000\ntest.setTimeout(wait)',
      filename: spec,
      errors: [unresolvable('test', '30000')],
    },
    {
      name: 'an env read',
      code: 'export default defineConfig({timeout: Number(process.env.TIMEOUT)})',
      filename: config,
      errors: [unresolvable('test', '30000')],
    },
    {
      name: 'a shorthand of an unresolvable const',
      code: 'function build(options) {\n  const timeout = options.timeout ?? 90_000\n  return defineConfig({timeout, expect: {timeout}})\n}',
      filename: config,
      errors: [unresolvable('test', '30000'), unresolvable('expect', '10000')],
    },
    {
      name: 'test.slow with the config timeout',
      code: "test.slow()\ntest('runs', run)",
      filename: spec,
      errors: [slowUnresolvable],
    },
    {
      name: 'test.slow over the cap',
      code: 'test.setTimeout(20_000)\ntest.slow()',
      filename: spec,
      errors: [slowOver('60000')],
    },
    {
      name: 'test.slow with an unresolvable file timeout',
      code: "import {wait} from './wait'\ntest.setTimeout(wait)\ntest.slow()",
      filename: spec,
      errors: [unresolvable('test', '30000'), slowUnresolvable],
    },
  ],
})
