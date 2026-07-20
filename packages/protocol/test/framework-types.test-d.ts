import {expectTypeOf, test} from 'vitest'
import type {
  FrameworkAdapter,
  FrameworkClientCore,
  FrameworkServerCore,
  PayloadSurface,
  QueryCacheSurface,
} from '../src/framework-types.js'

type Caps = {queryCache: boolean; serverFunctions: boolean; rscPayload: boolean; isr: boolean; middleware: boolean}
type Base = {name: 'nextjs'; client: FrameworkClientCore; server: FrameworkServerCore}

test('an adapter that supplies every gated surface its capabilities require is a FrameworkAdapter', () => {
  type AllOn = Base & {
    capabilities: Caps & {queryCache: true; serverFunctions: false; rscPayload: true; isr: false; middleware: false}
    queryCache: QueryCacheSurface
    payload: PayloadSurface
  }
  expectTypeOf<AllOn>().toMatchTypeOf<FrameworkAdapter>()
})

test('rscPayload:true without a payload surface is NOT a FrameworkAdapter', () => {
  type MissingPayload = Base & {
    capabilities: Caps & {queryCache: false; serverFunctions: false; rscPayload: true; isr: false; middleware: false}
  }
  expectTypeOf<MissingPayload>().not.toMatchTypeOf<FrameworkAdapter>()
})

test('a gated surface present without its capability flag is NOT a FrameworkAdapter', () => {
  type SurfaceWithoutFlag = Base & {
    capabilities: Caps & {queryCache: false; serverFunctions: false; rscPayload: false; isr: false; middleware: false}
    queryCache: QueryCacheSurface
  }
  expectTypeOf<SurfaceWithoutFlag>().not.toMatchTypeOf<FrameworkAdapter>()
})
