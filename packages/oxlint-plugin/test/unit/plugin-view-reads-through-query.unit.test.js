import {describe, it} from 'vitest'
import {RuleTester} from 'oxlint/plugins-dev'
import rule from '../../src/plugin-view-reads-through-query.js'

RuleTester.describe = describe
RuleTester.it = it

const tester = new RuleTester()
const plainCall = [{messageId: 'plainCall', data: {method: 'list'}}]

tester.run('plugin-view-reads-through-query', rule, {
  valid: [
    {name: 'a read through queryOptions', code: 'useQuery(() => ctx.client.rpc(Runs).list.queryOptions({input}))'},
    {name: 'the events stream', code: 'const runs = client.rpc(Runs)\nruns.events(onEvent)'},
    {name: 'an rpc on something that is not the client', code: 'server.rpc(Runs).list()'},
  ],
  invalid: [
    {
      name: 'a Query package import',
      code: "import {useQuery} from '@tanstack/solid-query'",
      errors: [{messageId: 'tanstackQueryImport', data: {module: '@tanstack/solid-query'}}],
    },
    {
      name: 'createResource from solid-js',
      code: "import {createResource} from 'solid-js'",
      errors: [{messageId: 'createResource'}],
    },
    {
      name: 'createResource through a solid-js namespace',
      code: "import * as solid from 'solid-js'\nsolid.createResource(load)",
      errors: [{messageId: 'createResource'}],
    },
    {name: 'a raw plugin call', code: "ctx.client.plugin.call('list')", errors: [{messageId: 'rawCall'}]},
    {name: 'a method called on the client', code: 'ctx.client.rpc(Runs).list({})', errors: plainCall},
    {name: 'a method called on a kept client', code: 'const runs = client.rpc(Runs)\nruns.list()', errors: plainCall},
    {
      name: 'a method called on a client factory',
      code: 'const runs = () => client.rpc(Runs)\nruns().list()',
      errors: plainCall,
    },
    {
      name: 'a method taken out of the client',
      code: 'const runs = client.rpc(Runs)\nconst list = runs.list\nlist()',
      errors: plainCall,
    },
    {
      name: 'methods destructured from the client',
      code: 'const {list} = client.rpc(Runs)\nlist()',
      errors: [{messageId: 'destructured'}, {messageId: 'plainCall', data: {method: 'list'}}],
    },
  ],
})
