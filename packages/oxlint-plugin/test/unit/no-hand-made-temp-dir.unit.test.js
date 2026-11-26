import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/no-hand-made-temp-dir.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const testFile = '/repo/packages/backend/src/run.test.ts'
const fsImports =
  "import {cp, mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises'\nimport {tmpdir} from 'node:os'\n"
const handMade = [{messageId: 'handMadeTempDir'}]

tester.run('no-hand-made-temp-dir', rule, {
  valid: [
    {
      name: 'a source file',
      code: `${fsImports}await mkdtemp(tmpdir())`,
      filename: '/repo/packages/backend/src/run.ts',
    },
    {
      name: 'the temp-dir helper',
      code: `${fsImports}await mkdtemp(tmpdir())`,
      filename: '/repo/packages/vitest-config/src/temp-dir.test.ts',
    },
    {name: 'a read from the temp dir', code: `${fsImports}await readFile(tmpdir())`, filename: testFile},
    {name: 'a copy out of the temp dir', code: `${fsImports}await cp(tmpdir(), target)`, filename: testFile},
    {name: 'a folder outside the temp dir', code: `${fsImports}await mkdir(root)`, filename: testFile},
    {
      name: 'a tmpdir that is not from os',
      code: "import {mkdir} from 'node:fs/promises'\nimport {tmpdir} from './paths'\nawait mkdir(tmpdir())",
      filename: testFile,
    },
    {name: 'another process event', code: "process.on('beforeExit', clean)", filename: testFile},
    {name: 'a local process', code: "const process = emitter\nprocess.on('exit', clean)", filename: testFile},
  ],
  invalid: [
    {
      name: 'a named fs call on tmpdir()',
      code: `${fsImports}await mkdtemp(join(tmpdir(), 'run-'))`,
      filename: testFile,
      errors: handMade,
    },
    {
      name: 'fs and os module objects',
      code: "import fs from 'node:fs'\nimport * as os from 'os'\nfs.mkdirSync(os.tmpdir())",
      filename: testFile,
      errors: handMade,
    },
    {
      name: 'process.env.TMPDIR',
      code: `${fsImports}await writeFile(join(process.env.TMPDIR, 'a.txt'), '')`,
      filename: testFile,
      errors: handMade,
    },
    {
      name: 'a /tmp template',
      code: `${fsImports}await mkdir(\`/tmp/run-\${id}\`)`,
      filename: testFile,
      errors: handMade,
    },
    {
      name: 'a copy into the temp dir',
      code: `${fsImports}await cp(source, '/tmp/copy')`,
      filename: testFile,
      errors: handMade,
    },
    {
      name: 'a const built on tmpdir()',
      code: `${fsImports}const root = join(tmpdir(), 'run')\nawait mkdir(join(root, 'a'))`,
      filename: testFile,
      errors: handMade,
    },
    {
      name: 'a folder made in a folder the test made, reported once',
      code: `${fsImports}const root = await mkdtemp(join(tmpdir(), 'run-'))\nawait writeFile(join(root, 'a'), '')`,
      filename: testFile,
      errors: handMade,
    },
    {
      name: 'a file under a test folder',
      code: `${fsImports}await mkdir('/tmp/run')`,
      filename: '/repo/packages/backend/test/helpers.ts',
      errors: handMade,
    },
    {
      name: 'an e2e helper',
      code: `${fsImports}await mkdir('/tmp/run')`,
      filename: '/repo/e2e/next/helpers.ts',
      errors: [{messageId: 'e2eTempDir'}],
    },
    {
      name: 'a testkit source',
      code: `${fsImports}await mkdir('/tmp/run')`,
      filename: '/repo/packages/backend-test-utils/src/engine.ts',
      errors: [{messageId: 'testkitTempDir'}],
    },
    {
      name: 'an exit hook in a vitest config',
      code: "process.once('exit', clean)",
      filename: '/repo/packages/backend/vitest.browser.config.ts',
      errors: [{messageId: 'exitHook'}],
    },
  ],
})
