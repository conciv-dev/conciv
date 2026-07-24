import {readFileSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import type {Grab} from '@conciv/grab'
import {BridgeMessageSchema, bridgeMessageSchemasByType, type NeutralGrabAsGrab} from '../src/shared/bridge.js'
import {bridgeFixtures} from '../fixtures/bridge/bridge.fixtures.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'bridge')

type Fixture = {file: string; data: {type?: unknown}}

function readFixtures(dir: string): Fixture[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({file: name, data: JSON.parse(readFileSync(join(dir, name), 'utf8'))}))
}

function byType(fixtures: Fixture[]): Map<string, Fixture> {
  const map = new Map<string, Fixture>()
  for (const fixture of fixtures) {
    const type = fixture.data.type
    if (typeof type === 'string') map.set(type, fixture)
  }
  return map
}

const validFixtures = readFixtures(fixturesDir)
const invalidFixtures = readFixtures(join(fixturesDir, 'invalid'))
const unknownKeyFixtures = readFixtures(join(fixturesDir, 'unknown-key'))

const validByType = byType(validFixtures)
const invalidByType = byType(invalidFixtures)
const unknownKeyByType = byType(unknownKeyFixtures)

const unionTypes = BridgeMessageSchema.options.map((option) => option.shape.type.value)

function strictSchemaFor(type: string) {
  const schema = bridgeMessageSchemasByType[type as keyof typeof bridgeMessageSchemasByType]
  if (schema === undefined) throw new Error(`no schema registered for ${type}`)
  return schema.strict()
}

describe('bridge message union exhaustiveness', () => {
  it('covers every catalog message', () => {
    expect(unionTypes.length).toBe(13)
  })

  it.each(unionTypes)('%s has valid, invalid, and unknown-key fixtures', (type) => {
    expect(validByType.has(type), `missing valid fixture for ${type}`).toBe(true)
    expect(invalidByType.has(type), `missing invalid fixture for ${type}`).toBe(true)
    expect(unknownKeyByType.has(type), `missing unknown-key fixture for ${type}`).toBe(true)
  })

  it('every fixture type is a known union member', () => {
    for (const fixture of [...validFixtures, ...invalidFixtures, ...unknownKeyFixtures]) {
      expect(unionTypes).toContain(fixture.data.type)
    }
  })
})

describe('runtime parsing (non-strict) ignores unknown keys', () => {
  it.each(validFixtures)('valid fixture $file parses', (fixture) => {
    expect(BridgeMessageSchema.safeParse(fixture.data).success).toBe(true)
  })

  it.each(unknownKeyFixtures)('unknown-key fixture $file parses and drops the extra key', (fixture) => {
    const result = BridgeMessageSchema.safeParse(fixture.data)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(JSON.stringify(result.data).length).toBeLessThan(JSON.stringify(fixture.data).length)
  })
})

describe('invalid fixtures are structurally wrong', () => {
  it.each(invalidFixtures)('invalid fixture $file fails runtime and strict parse', (fixture) => {
    expect(BridgeMessageSchema.safeParse(fixture.data).success).toBe(false)
    const type = fixture.data.type
    expect(typeof type).toBe('string')
    if (typeof type !== 'string') return
    expect(strictSchemaFor(type).safeParse(fixture.data).success).toBe(false)
  })
})

describe('strict variant flags unknown keys that runtime ignores', () => {
  it.each(unknownKeyFixtures)('unknown-key fixture $file fails strict parse', (fixture) => {
    const type = fixture.data.type
    expect(typeof type).toBe('string')
    if (typeof type !== 'string') return
    expect(strictSchemaFor(type).safeParse(fixture.data).success).toBe(false)
  })
})

describe('decode-equivalence and roundtrip', () => {
  it.each(validFixtures)('valid fixture $file survives decode -> encode -> decode', (fixture) => {
    const decoded = BridgeMessageSchema.parse(fixture.data)
    const reDecoded = BridgeMessageSchema.parse(JSON.parse(JSON.stringify(decoded)))
    expect(reDecoded).toEqual(decoded)
  })
})

describe('committed JSON matches the fixture table', () => {
  it.each(bridgeFixtures)('$file JSON on disk equals the authored table entry', (fixture) => {
    const valid = JSON.parse(readFileSync(join(fixturesDir, `${fixture.file}.json`), 'utf8'))
    const invalid = JSON.parse(readFileSync(join(fixturesDir, 'invalid', `${fixture.file}.json`), 'utf8'))
    const unknownKey = JSON.parse(readFileSync(join(fixturesDir, 'unknown-key', `${fixture.file}.json`), 'utf8'))
    expect(valid).toEqual(fixture.valid)
    expect(invalid).toEqual(fixture.invalid)
    expect(unknownKey).toEqual(fixture.unknownKey)
  })
})

describe('NeutralGrab reuses the @conciv/grab contract', () => {
  it('is assignable to Grab with an image preview', () => {
    const asGrab = (grab: NeutralGrabAsGrab): Grab => grab
    expect(typeof asGrab).toBe('function')
  })
})
