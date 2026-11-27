import {widgetErrors} from '@conciv/errors'
export interface OpaqueShape {
  public: {$$type: string}
  versions: {version: string | undefined}
}

export interface OpaqueType<T extends OpaqueShape> {
  readonly TPublic: T['public']
  readonly TInternal: T['public'] & T['versions']
  isType(value: unknown): value is T['public']
  toInternal(value: unknown): T['public'] & T['versions']
  createInstance<TVersion extends T['versions']['version'], TPublic extends T['public']>(
    version: TVersion,
    props: Omit<T['public'], '$$type'> &
      (T['versions'] extends infer UVersion
        ? UVersion extends {version: TVersion}
          ? Omit<UVersion, 'version'>
          : never
        : never) &
      object,
  ): TPublic
}

function stringifyUnknown(value: unknown): string {
  if (typeof value !== 'object') return `<${typeof value}>`
  if (value === null) return '<null>'
  if ('$$type' in value) return String(value.$$type)
  return String(value)
}

function stringifyVersion(version: string | undefined): string {
  return version ? `'${version}'` : 'undefined'
}

function joinExpectedVersions(versions: ReadonlySet<string | undefined>): string {
  const names = Array.from(versions, stringifyVersion)
  const last = names.length - 1
  if (last > 0) names[last] = `or ${names[last]}`
  return names.length > 2 ? names.join(', ') : names.join(' ')
}

export function createOpaqueType<T extends OpaqueShape>(options: {
  type: T['public']['$$type']
  versions: Array<T['versions']['version']>
}): OpaqueType<T> {
  const type: string = options.type
  const versions = new Set<string | undefined>(options.versions)

  function isThisInternalType(value: unknown): value is T['public'] & T['versions'] {
    if (value === null || typeof value !== 'object') return false
    return '$$type' in value && value.$$type === type
  }

  return {
    TPublic: undefined as never,
    TInternal: undefined as never,
    isType: isThisInternalType,
    toInternal(value) {
      if (!isThisInternalType(value)) throw widgetErrors.OPAQUE_WRONG_TYPE({type, received: stringifyUnknown(value)})

      if (!versions.has(value.version))
        throw widgetErrors.OPAQUE_WRONG_VERSION({
          received: stringifyVersion(value.version),
          expected: joinExpectedVersions(versions),
        })

      return value
    },
    createInstance(version, props) {
      return Object.assign(props, {$$type: type, ...(version && {version})}) as never
    },
  }
}
