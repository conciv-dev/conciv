import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from './router-idioms.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const routeFile = '/repo/apps/site/src/routes/docs.tsx'
const otherFile = '/repo/apps/site/src/components/nav.tsx'

tester.run('router-idioms', rule, {
  valid: [
    {
      name: 'a bare hook outside the routes folder',
      code: "import {useSearch} from '@tanstack/react-router'",
      filename: otherFile,
    },
    {
      name: 'a route-file import that is not a scoped hook',
      code: "import {Link} from '@tanstack/react-router'",
      filename: routeFile,
    },
    {
      name: 'router state that does not read matches',
      code: 'useRouterState({select: (state) => state.location})',
      filename: otherFile,
    },
    {
      name: 'search fields that all fall back',
      code: 'const docsSearchSchema = z.object({page: z.number().default(1).catch(1), tab: z.string().optional().catch(undefined)})',
      filename: otherFile,
    },
    {
      name: 'a zod object that is not a search schema',
      code: 'const settingsSchema = z.object({page: z.number()})',
      filename: otherFile,
    },
    {
      name: 'a spread element beside falling-back fields in a search schema',
      code: 'const docsSearchSchema = z.object({...baseFields, page: z.number().catch(1)})',
      filename: otherFile,
    },
    {
      name: 'a computed key in a search schema',
      code: 'const docsSearchSchema = z.object({[pageKey]: z.number()})',
      filename: otherFile,
    },
    {
      name: 'a field that is not a zod chain',
      code: 'const docsSearchSchema = z.object({page: pageSchema})',
      filename: otherFile,
    },
  ],
  invalid: [
    {
      name: 'a bare scoped hook in a route file',
      code: "import {useNavigate} from '@tanstack/react-router'",
      filename: routeFile,
      errors: [{messageId: 'bareRouterHook', data: {name: 'useNavigate'}}],
    },
    {
      name: 'a bare scoped hook from the Solid router in a route file',
      code: "import {useSearch} from '@tanstack/solid-router'",
      filename: '/repo/apps/conciv/src/routes/panel.tsx',
      errors: [{messageId: 'bareRouterHook', data: {name: 'useSearch'}}],
    },
    {
      name: 'router state mined for matches',
      code: 'useRouterState({select: (state) => state.matches.at(-1)})',
      filename: otherFile,
      errors: [{messageId: 'matchesMining'}],
    },
    {
      name: 'a search schema field with no fallback',
      code: 'const docsSearchSchema = z.object({page: z.number().default(1)})',
      filename: otherFile,
      errors: [{messageId: 'searchFieldThrows', data: {field: 'page'}}],
    },
    {
      name: 'an inline validateSearch field with a quoted key',
      code: "const route = {validateSearch: z.object({'tab-id': z.string().optional()})}",
      filename: otherFile,
      errors: [{messageId: 'searchFieldThrows', data: {field: 'tab-id'}}],
    },
    {
      name: 'validateSearch naming a schema whose name does not end in SearchSchema',
      code: 'const settings = z.object({page: z.number()})\nconst route = {validateSearch: settings}',
      filename: otherFile,
      errors: [{messageId: 'searchFieldThrows', data: {field: 'page'}}],
    },
    {
      name: 'validateSearch naming a search schema, reported once',
      code: 'const docsSearchSchema = z.object({page: z.number()})\nconst route = {validateSearch: docsSearchSchema}',
      filename: otherFile,
      errors: [{messageId: 'searchFieldThrows', data: {field: 'page'}}],
    },
  ],
})
