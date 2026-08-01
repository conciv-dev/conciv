import {expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {definePageVerbs, pageVerb, type PageCaller} from '../src/page-verbs.js'

const verbs = definePageVerbs({
  routerState: pageVerb(z.object({}), () => ({path: '/'})),
  navigate: pageVerb(z.object({to: z.string()}), (a) => ({ok: true as const, to: a.to})),
})
type Caller = PageCaller<typeof verbs>

test('call return type is inferred from the handler', () => {
  const caller = null as unknown as Caller
  expectTypeOf<Caller['call']>().toBeCallableWith('routerState', {})
  expectTypeOf(caller.call('navigate', {to: 'x'})).resolves.toMatchTypeOf<{ok: true; to: string}>()
})
test('unknown verb and wrong args are type errors', () => {
  const call = null as unknown as Caller['call']
  // @ts-expect-error unknown verb
  call('nope', {})
  // @ts-expect-error missing required arg `to`
  call('navigate', {})
})
