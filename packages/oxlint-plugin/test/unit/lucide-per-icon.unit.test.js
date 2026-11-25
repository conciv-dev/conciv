import {fileURLToPath} from 'node:url'
import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/lucide-per-icon.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const filename = fileURLToPath(new URL('../../src/view.tsx', import.meta.url))

tester.run('lucide-per-icon', rule, {
  valid: [
    {name: 'an import from another module', code: "import {ArrowUp} from 'lucide-react'", filename},
    {name: 'a type-only import', code: "import type {LucideProps} from 'lucide-solid'", filename},
    {name: 'type-only specifiers', code: "import {type LucideProps} from 'lucide-solid'", filename},
    {name: 'a namespace import', code: "import * as icons from 'lucide-solid'", filename},
  ],
  invalid: [
    {
      name: 'value icons beside types, some aliased, one named by a string',
      code: "import {'ArrowUp' as Up, AlignHorizontalDistributeCenter as Align, Columns3Cog, type LucideProps, type IconProps as Props} from 'lucide-solid'",
      filename,
      output: [
        "import Up from 'lucide-solid/icons/arrow-up'",
        "import Align from 'lucide-solid/icons/align-horizontal-distribute-center'",
        "import Columns3Cog from 'lucide-solid/icons/columns-3-cog'",
        "import type {LucideProps, IconProps as Props} from 'lucide-solid'",
      ].join('\n'),
      errors: [{messageId: 'barrelImport'}],
    },
    {
      name: 'one icon and no types',
      code: "import {ArrowUp} from 'lucide-solid'",
      filename,
      output: "import ArrowUp from 'lucide-solid/icons/arrow-up'",
      errors: [{messageId: 'barrelImport'}],
    },
    {
      name: 'an icon with no per-icon entry point',
      code: "import {ArrowUp, NotAnIcon} from 'lucide-solid'",
      filename,
      errors: [
        {messageId: 'barrelImportUnresolved', data: {name: 'NotAnIcon', guess: 'lucide-solid/icons/not-an-icon'}},
      ],
    },
  ],
})
