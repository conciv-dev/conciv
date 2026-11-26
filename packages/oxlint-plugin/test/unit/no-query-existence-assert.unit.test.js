import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/no-query-existence-assert.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const domTest = '/repo/test/unit/view.unit.test.tsx'

tester.run('no-query-existence-assert', rule, {
  valid: [
    {
      name: 'a matcher that says what the user sees',
      code: "expect(getByRole('button')).toBeVisible()",
      filename: domTest,
    },
    {name: 'presence on a queryBy', code: "expect(queryByText('a')).toBeInTheDocument()", filename: domTest},
    {name: 'absence on a queryBy', code: "expect(queryByText('a')).not.toBeInTheDocument()", filename: domTest},
    {
      name: 'a negated toBeInTheDocument on a getBy',
      code: "expect(getByText('a')).not.toBeInTheDocument()",
      filename: domTest,
    },
    {name: 'toHaveLength on an AllBy query', code: "expect(getAllByRole('row')).toHaveLength(2)", filename: domTest},
    {name: 'toBe with a value other than null', code: "expect(getByRole('link')).toBe(link)", filename: domTest},
    {name: 'an expect on a call that is not a query', code: 'expect(render()).toBeDefined()', filename: domTest},
    {name: 'a let bound to a query', code: "let row = getByRole('row'); expect(row).toBeDefined()", filename: domTest},
    {
      name: 'a plain test file that imports no Testing Library',
      code: "expect(getByRole('button')).toBeDefined()",
      filename: '/repo/test/it/view.it.test.ts',
    },
  ],
  invalid: [
    {
      name: 'an existence matcher on a bare query',
      code: "expect(getByRole('button')).toBeDefined()",
      filename: domTest,
      errors: [{messageId: 'existenceOnly', data: {matcher: 'toBeDefined', query: 'getByRole'}}],
    },
    {
      name: 'a negated existence matcher on screen',
      code: "expect(screen.queryByText('a')).not.toBeNull()",
      filename: '/repo/test/e2e/view.e2e.test.ts',
      errors: [{messageId: 'existenceOnly', data: {matcher: 'not.toBeNull', query: 'queryByText'}}],
    },
    {
      name: 'an awaited and cast query',
      code: "expect((await screen.findByRole('dialog')) as HTMLElement).toBeTruthy()",
      filename: domTest,
      errors: [{messageId: 'existenceOnly', data: {matcher: 'toBeTruthy', query: 'findByRole'}}],
    },
    {
      name: 'a const bound to a query',
      code: "const row = within(table).getByRole('row'); expect(row).toBeDefined()",
      filename: domTest,
      errors: [{messageId: 'existenceOnly', data: {matcher: 'toBeDefined', query: 'getByRole'}}],
    },
    {
      name: 'toBe(null)',
      code: "expect(queryByLabelText('Name')).toBe(null)",
      filename: domTest,
      errors: [{messageId: 'existenceOnly', data: {matcher: 'toBe', query: 'queryByLabelText'}}],
    },
    {
      name: 'toHaveLength on a single query',
      code: "expect(getByText('a')).toHaveLength(1)",
      filename: domTest,
      errors: [{messageId: 'existenceOnly', data: {matcher: 'toHaveLength', query: 'getByText'}}],
    },
    {
      name: 'toBeInTheDocument on a query that throws',
      code: "expect(getByRole('alert')).toBeInTheDocument()",
      filename: domTest,
      errors: [{messageId: 'existenceOnly', data: {matcher: 'toBeInTheDocument', query: 'getByRole'}}],
    },
    {
      name: 'a plain test file that imports Testing Library',
      code: "import {screen} from '@testing-library/dom'; expect(screen.getByRole('button')).toBeDefined()",
      filename: '/repo/test/it/view.it.test.ts',
      errors: [{messageId: 'existenceOnly', data: {matcher: 'toBeDefined', query: 'getByRole'}}],
    },
  ],
})
