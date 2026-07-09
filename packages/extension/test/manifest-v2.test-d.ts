import {describe, expectTypeOf, it} from 'vitest'
import {defineExtension} from '../src/define-extension.js'
import type {ComposerActionDecl, ExtensionTableDecl, HostApi} from '../src/host-types.js'

describe('manifest v2 capability typing', () => {
  it('tables require columns', () => {
    expectTypeOf<ExtensionTableDecl>().toEqualTypeOf<{name: string; columns: string}>()
    defineExtension({name: 'ok', tables: [{name: 'notes', columns: 'body TEXT'}]})
    // @ts-expect-error a table without columns is not a table
    defineExtension({name: 'bad', tables: [{name: 'notes'}]})
  })

  it('composer actions require icon and run', () => {
    // @ts-expect-error run is required
    const missingRun: ComposerActionDecl = {id: 'a', label: 'A', icon: () => null}
    void missingRun
    const action: ComposerActionDecl = {id: 'a', label: 'A', icon: () => null, run: (host) => host.chat.send('hi')}
    expectTypeOf(action.run).parameter(0).toEqualTypeOf<HostApi>()
  })

  it('controls require a component', () => {
    // @ts-expect-error Component is required
    defineExtension({name: 'bad2', controls: [{id: 'c'}]})
    defineExtension({name: 'ok2', controls: [{id: 'c', Component: () => null}]})
  })

  it('builder carries the declarations', () => {
    const ext = defineExtension({name: 'demo', tables: [{name: 'notes', columns: 'body TEXT'}]})
    expectTypeOf(ext.tables).toEqualTypeOf<readonly ExtensionTableDecl[] | undefined>()
  })
})
