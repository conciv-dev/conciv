import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {defineExtension, definePageVerbs, pageVerb} from '../src/index.js'

const ext = defineExtension({name: 'demo'})
  .client(() => ({
    value: {},
    pageVerbs: definePageVerbs({
      routerState: pageVerb(z.object({}), () => ({path: '/'})),
      navigate: pageVerb(z.object({to: z.string()}), (a) => ({ok: true as const, to: a.to})),
    }),
  }))
  .server((server) => {
    expectTypeOf(server.page.call).toBeCallableWith('routerState', {})
    expectTypeOf(server.page.call('navigate', {to: 'x'})).resolves.toMatchTypeOf<{ok: true; to: string}>()
    // @ts-expect-error unknown verb
    server.page.call('nope', {})
    // @ts-expect-error missing required arg `to`
    server.page.call('navigate', {})
    return {context: {}}
  })

test('client pageVerbs flow into the server page caller type', () => {
  expectTypeOf(ext.name).toEqualTypeOf<'demo'>()
})
