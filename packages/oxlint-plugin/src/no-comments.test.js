import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './no-comments.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const keepDocs = [{keepDocComments: true}]
const taggedDoc = '/** @param id the run */\nexport function load(id) {}'

tester.run('no-comments', rule, {
  valid: [
    {name: 'a tool directive', code: '// @ts-expect-error\nconst a = 1'},
    {name: 'a tagged doc comment on a declaration, kept', code: taggedDoc, options: keepDocs},
    {
      name: 'a tagged doc comment on an interface member, kept',
      code: 'interface Run {\n  /** @deprecated use status */\n  state: string\n}',
      filename: 'run.ts',
      options: keepDocs,
    },
  ],
  invalid: [
    {name: 'a line comment', code: 'const a = 1 // one', output: 'const a = 1 ', errors: [{messageId: 'noComment'}]},
    {
      name: 'a tagged doc comment without the option',
      code: taggedDoc,
      output: '\nexport function load(id) {}',
      errors: [{messageId: 'noComment'}],
    },
    {
      name: 'a doc comment with no tag',
      code: '/** Loads a run. */\nexport function load(id) {}',
      output: '\nexport function load(id) {}',
      options: keepDocs,
      errors: [{messageId: 'noComment'}],
    },
    {
      name: 'a tagged doc comment inside a function body',
      code: 'function load() {\n  /** @type {number} */\n  const id = 1\n}',
      output: 'function load() {\n  \n  const id = 1\n}',
      options: keepDocs,
      errors: [{messageId: 'noComment'}],
    },
    {
      name: 'a tagged block comment that is not a doc comment',
      code: '/* @param id */\nexport function load(id) {}',
      output: '\nexport function load(id) {}',
      options: keepDocs,
      errors: [{messageId: 'noComment'}],
    },
  ],
})
