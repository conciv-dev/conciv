import {describe, expect, it} from 'vitest'
import {createOpaqueType} from '../../src/opaque.js'

describe('createOpaqueType', () => {
  it('makes, checks and reads an opaque type with one version, several versions, an undefined version, undefined mixed with versions, no internal fields, and a prototype implementation', () => {
    type MyType = {
      $$type: 'my-type'
    }

    const OpaqueSingleMyType = createOpaqueType<{
      public: MyType
      versions: {
        version: 'v1'
        foo: string
      }
    }>({
      type: 'my-type',
      versions: ['v1'],
    })

    // @ts-expect-error - unsupported version
    OpaqueSingleMyType.createInstance('v2', {
      foo: 'bar',
    })

    // @ts-expect-error - missing internal field
    OpaqueSingleMyType.createInstance('v1', {})

    OpaqueSingleMyType.createInstance('v1', {
      // @ts-expect-error - invalid internal field
      foo: 3,
    })

    const mySingleInstance = OpaqueSingleMyType.createInstance('v1', {
      foo: 'bar',
    })

    expect(mySingleInstance.$$type).toBe('my-type')
    // @ts-expect-error - version field not accessible
    expect(mySingleInstance.version).toBe('v1')
    // @ts-expect-error - internal field not accessible
    expect(mySingleInstance.foo).toBe('bar')

    expect(OpaqueSingleMyType.isType(mySingleInstance)).toBe(true)
    expect(OpaqueSingleMyType.isType('hello')).toBe(false)
    expect(OpaqueSingleMyType.isType({$$type: 'some-other'})).toBe(false)
    expect(OpaqueSingleMyType.isType({$$type: 'my-type'})).toBe(true)

    const mySingleInternal = OpaqueSingleMyType.toInternal(mySingleInstance)
    expect(mySingleInternal).toBe(mySingleInstance)
    expect(mySingleInternal.$$type).toBe('my-type')
    expect(mySingleInternal.version).toBe('v1')
    expect(mySingleInternal.foo).toBe('bar')

    expect(() => OpaqueSingleMyType.toInternal('hello')).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got '<string>'"),
    )
    expect(() => OpaqueSingleMyType.toInternal(3)).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got '<number>'"),
    )
    expect(() => OpaqueSingleMyType.toInternal(undefined)).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got '<undefined>'"),
    )
    expect(() => OpaqueSingleMyType.toInternal(Symbol('wat'))).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got '<symbol>'"),
    )
    expect(() => OpaqueSingleMyType.toInternal(null)).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got '<null>'"),
    )
    expect(() => OpaqueSingleMyType.toInternal(() => {})).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got '<function>'"),
    )
    expect(() => OpaqueSingleMyType.toInternal({$$type: 'some-other-type'})).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got 'some-other-type'"),
    )
    expect(() => OpaqueSingleMyType.toInternal({an: 'object'})).toThrowError(
      new TypeError("Invalid opaque type, expected 'my-type', but got '[object Object]'"),
    )
    expect(() => OpaqueSingleMyType.toInternal({$$type: 'my-type'})).toThrowError(
      new TypeError("Invalid opaque type instance, got version undefined, expected 'v1'"),
    )
    expect(() => OpaqueSingleMyType.toInternal({$$type: 'my-type', version: 'v0'})).toThrowError(
      new TypeError("Invalid opaque type instance, got version 'v0', expected 'v1'"),
    )
    expect(() => OpaqueSingleMyType.toInternal({$$type: 'my-type', version: {foo: 'bar'}})).toThrowError(
      new TypeError("Invalid opaque type instance, got version '[object Object]', expected 'v1'"),
    )

    const OpaqueVersionsMyType = createOpaqueType<{
      public: MyType
      versions:
        | {
            version: 'v1'
            foo: string
          }
        | {
            version: 'v2'
            bar: string
          }
        | {
            version: 'v3'
            baz: string
          }
    }>({
      type: 'my-type',
      versions: ['v1', 'v2', 'v3'],
    })

    // @ts-expect-error - unsupported version
    OpaqueVersionsMyType.createInstance('v0', {
      foo: 'bar',
    })

    // @ts-expect-error - missing internal field
    OpaqueVersionsMyType.createInstance('v1', {})

    OpaqueVersionsMyType.createInstance('v1', {
      // @ts-expect-error - invalid internal field
      foo: 3,
    })

    OpaqueVersionsMyType.createInstance('v2', {
      // @ts-expect-error - version mismatch
      foo: 'bar',
    })

    OpaqueVersionsMyType.createInstance('v1', {
      // @ts-expect-error - version mismatch
      bar: 'foo',
    })

    const myVersionsInstanceV1 = OpaqueVersionsMyType.createInstance('v1', {
      foo: 'bar',
    })

    const myVersionsInstanceV2 = OpaqueVersionsMyType.createInstance('v2', {
      bar: 'foo',
    })

    expect(myVersionsInstanceV1.$$type).toBe('my-type')
    // @ts-expect-error - version field not accessible
    expect(myVersionsInstanceV1.version).toBe('v1')
    // @ts-expect-error - internal field not accessible
    expect(myVersionsInstanceV1.foo).toBe('bar')

    expect(myVersionsInstanceV2.$$type).toBe('my-type')
    // @ts-expect-error - version field not accessible
    expect(myVersionsInstanceV2.version).toBe('v2')
    // @ts-expect-error - internal field not accessible
    expect(myVersionsInstanceV2.bar).toBe('foo')

    expect(OpaqueVersionsMyType.isType(myVersionsInstanceV1)).toBe(true)
    expect(OpaqueVersionsMyType.isType(myVersionsInstanceV2)).toBe(true)
    expect(OpaqueVersionsMyType.isType('hello')).toBe(false)

    const myVersionsInternalV1 = OpaqueVersionsMyType.toInternal(myVersionsInstanceV1)
    expect(myVersionsInternalV1).toBe(myVersionsInstanceV1)
    expect(myVersionsInternalV1.$$type).toBe('my-type')
    expect(myVersionsInternalV1.version).toBe('v1')
    // @ts-expect-error - version has not been narrowed down
    expect(myVersionsInternalV1.foo).toBe('bar')

    const myVersionsInternalV2 = OpaqueVersionsMyType.toInternal(myVersionsInstanceV2)
    expect(myVersionsInternalV2).toBe(myVersionsInstanceV2)
    expect(myVersionsInternalV2.$$type).toBe('my-type')
    expect(myVersionsInternalV2.version).toBe('v2')
    // @ts-expect-error - version has not been narrowed down
    expect(myVersionsInternalV2.bar).toBe('foo')

    expect(myVersionsInternalV1.version === 'v1' && myVersionsInternalV1.foo).toBe('bar')
    expect(myVersionsInternalV2.version === 'v2' && myVersionsInternalV2.bar).toBe('foo')

    expect(() => OpaqueVersionsMyType.toInternal({$$type: 'my-type'})).toThrowError(
      new TypeError("Invalid opaque type instance, got version undefined, expected 'v1', 'v2', or 'v3'"),
    )
    expect(() => OpaqueVersionsMyType.toInternal({$$type: 'my-type', version: 'v0'})).toThrowError(
      new TypeError("Invalid opaque type instance, got version 'v0', expected 'v1', 'v2', or 'v3'"),
    )

    const OpaqueUndefinedMyType = createOpaqueType<{
      public: MyType
      versions: {
        version: undefined
        foo: string
      }
    }>({
      type: 'my-type',
      versions: [undefined],
    })

    // @ts-expect-error - unsupported version
    OpaqueUndefinedMyType.createInstance('v1', {
      foo: 'bar',
    })

    // @ts-expect-error - missing internal field
    OpaqueUndefinedMyType.createInstance(undefined, {})

    OpaqueUndefinedMyType.createInstance(undefined, {
      // @ts-expect-error - invalid internal field
      foo: 3,
    })

    const myUndefinedInstance = OpaqueUndefinedMyType.createInstance(undefined, {
      foo: 'bar',
    })

    expect(myUndefinedInstance.$$type).toBe('my-type')
    // @ts-expect-error - version field not accessible
    expect(myUndefinedInstance.version).toBe(undefined)
    // @ts-expect-error - internal field not accessible
    expect(myUndefinedInstance.foo).toBe('bar')

    expect(OpaqueUndefinedMyType.isType(myUndefinedInstance)).toBe(true)
    expect(OpaqueUndefinedMyType.isType('hello')).toBe(false)

    const myUndefinedInternal = OpaqueUndefinedMyType.toInternal(myUndefinedInstance)
    expect(myUndefinedInternal).toBe(myUndefinedInstance)
    expect(myUndefinedInternal.$$type).toBe('my-type')
    expect(myUndefinedInternal.version).toBe(undefined)
    expect(myUndefinedInternal.foo).toBe('bar')

    expect(OpaqueUndefinedMyType.toInternal({$$type: 'my-type'})).toBeDefined()
    expect(() => OpaqueUndefinedMyType.toInternal({$$type: 'my-type', version: 'v0'})).toThrowError(
      new TypeError("Invalid opaque type instance, got version 'v0', expected undefined"),
    )

    const OpaqueMixedMyType = createOpaqueType<{
      public: MyType
      versions:
        | {
            version: 'v1'
            foo: string
          }
        | {
            version: undefined
            bar: string
          }
    }>({
      type: 'my-type',
      versions: [undefined, 'v1'],
    })

    // @ts-expect-error - unsupported version
    OpaqueMixedMyType.createInstance('v0', {
      foo: 'bar',
    })

    // @ts-expect-error - missing internal field
    OpaqueMixedMyType.createInstance('v1', {})

    OpaqueMixedMyType.createInstance('v1', {
      // @ts-expect-error - invalid internal field
      foo: 3,
    })

    OpaqueMixedMyType.createInstance(undefined, {
      // @ts-expect-error - version mismatch
      foo: 'bar',
    })

    OpaqueMixedMyType.createInstance('v1', {
      // @ts-expect-error - version mismatch
      bar: 'foo',
    })

    const myMixedInstanceV1 = OpaqueMixedMyType.createInstance('v1', {
      foo: 'bar',
    })

    const myMixedInstanceV2 = OpaqueMixedMyType.createInstance(undefined, {
      bar: 'foo',
    })

    expect(myMixedInstanceV1.$$type).toBe('my-type')
    // @ts-expect-error - version field not accessible
    expect(myMixedInstanceV1.version).toBe('v1')
    // @ts-expect-error - internal field not accessible
    expect(myMixedInstanceV1.foo).toBe('bar')

    expect(myMixedInstanceV2.$$type).toBe('my-type')
    // @ts-expect-error - version field not accessible
    expect(myMixedInstanceV2.version).toBe(undefined)
    // @ts-expect-error - internal field not accessible
    expect(myMixedInstanceV2.bar).toBe('foo')

    expect(OpaqueMixedMyType.isType(myMixedInstanceV1)).toBe(true)
    expect(OpaqueMixedMyType.isType(myMixedInstanceV2)).toBe(true)
    expect(OpaqueMixedMyType.isType('hello')).toBe(false)

    const myMixedInternalV1 = OpaqueMixedMyType.toInternal(myMixedInstanceV1)
    expect(myMixedInternalV1).toBe(myMixedInstanceV1)
    expect(myMixedInternalV1.$$type).toBe('my-type')
    expect(myMixedInternalV1.version).toBe('v1')
    // @ts-expect-error - version has not been narrowed down
    expect(myMixedInternalV1.foo).toBe('bar')

    const myMixedInternalV2 = OpaqueMixedMyType.toInternal(myMixedInstanceV2)
    expect(myMixedInternalV2).toBe(myMixedInstanceV2)
    expect(myMixedInternalV2.$$type).toBe('my-type')
    expect(myMixedInternalV2.version).toBe(undefined)
    // @ts-expect-error - version has not been narrowed down
    expect(myMixedInternalV2.bar).toBe('foo')

    expect(myMixedInternalV1.version === 'v1' && myMixedInternalV1.foo).toBe('bar')
    expect(myMixedInternalV2.version === undefined && myMixedInternalV2.bar).toBe('foo')

    expect(OpaqueMixedMyType.toInternal({$$type: 'my-type'})).toBeDefined()
    expect(() => OpaqueMixedMyType.toInternal({$$type: 'my-type', version: 'v3'})).toThrowError(
      new TypeError("Invalid opaque type instance, got version 'v3', expected undefined or 'v1'"),
    )

    const OpaqueEmptyMyType = createOpaqueType<{
      public: MyType
      versions: {
        version: undefined
      }
    }>({
      type: 'my-type',
      versions: [undefined],
    })

    // @ts-expect-error - unsupported version
    OpaqueEmptyMyType.createInstance('v0', {
      foo: 'bar',
    })

    const myEmptyInstance = OpaqueEmptyMyType.createInstance(undefined, {})

    expect(myEmptyInstance.$$type).toBe('my-type')

    expect(OpaqueEmptyMyType.isType(myEmptyInstance)).toBe(true)
    expect(OpaqueEmptyMyType.isType('hello')).toBe(false)

    const myEmptyInternal = OpaqueEmptyMyType.toInternal(myEmptyInstance)
    expect(myEmptyInternal).toBe(myEmptyInstance)
    expect(myEmptyInternal.$$type).toBe('my-type')
    expect(myEmptyInternal.version).toBe(undefined)

    const OpaquePrototypeMyType = createOpaqueType<{
      public: MyType
      versions: {
        version: 'v1'
        getX(): number
      }
    }>({
      type: 'my-type',
      versions: ['v1'],
    })

    const myPrototypeImplementation: {getX(): number} = Object.create({
      getX() {
        return 4
      },
    })

    const myPrototypeInstance = OpaquePrototypeMyType.createInstance('v1', myPrototypeImplementation)

    expect(myPrototypeInstance.$$type).toBe('my-type')

    expect(OpaquePrototypeMyType.isType(myPrototypeInstance)).toBe(true)

    const myPrototypeInternal = OpaquePrototypeMyType.toInternal(myPrototypeInstance)
    expect(myPrototypeInternal).toBe(myPrototypeInstance)

    expect(myPrototypeInternal.$$type).toBe('my-type')
    expect(myPrototypeInternal.version).toBe('v1')
    expect(myPrototypeInternal.getX()).toBe(4)
  })
})
