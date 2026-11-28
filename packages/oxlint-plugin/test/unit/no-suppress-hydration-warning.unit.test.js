import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/no-suppress-hydration-warning.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const filename = 'root.tsx'
const suppressed = [{messageId: 'suppressed'}]

tester.run('no-suppress-hydration-warning', rule, {
  valid: [
    {name: 'an html element with its own attributes', code: 'const view = <html lang="en" />', filename},
    {
      name: 'a name that only contains the word',
      code: 'const view = <p data-suppress-hydration-warning="" />',
      filename,
    },
    {name: 'a computed key', code: 'const props = {[name]: true}', filename},
  ],
  invalid: [
    {
      name: 'the bare attribute',
      code: 'const view = <html lang="en" suppressHydrationWarning />',
      filename,
      errors: suppressed,
    },
    {
      name: 'the attribute with a value',
      code: 'const view = <span suppressHydrationWarning={true}>{count}</span>',
      filename,
      errors: suppressed,
    },
    {
      name: 'a key in a spread object literal',
      code: 'const view = <html {...{suppressHydrationWarning: true}} />',
      filename,
      errors: suppressed,
    },
    {name: 'a quoted key', code: "const props = {'suppressHydrationWarning': true}", filename, errors: suppressed},
    {
      name: 'a createElement props object',
      code: "createElement('html', {suppressHydrationWarning: true})",
      filename,
      errors: suppressed,
    },
  ],
})
