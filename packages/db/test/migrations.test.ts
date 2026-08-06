import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {migrationSql} from '../src/migrations.js'

const migrationsRoot = fileURLToPath(new URL('../drizzle', import.meta.url))

describe('bundled migrations', () => {
  it('mirrors every migration.sql under drizzle/ (regenerate with pnpm gen:migrations)', () => {
    const folders = readdirSync(migrationsRoot)
      .filter((entry) => existsSync(join(migrationsRoot, entry, 'migration.sql')))
      .toSorted((left, right) => left.localeCompare(right))
    expect(Object.keys(migrationSql)).toEqual(folders)
    for (const name of folders) {
      expect(migrationSql[name]).toBe(readFileSync(join(migrationsRoot, name, 'migration.sql'), 'utf8'))
    }
  })
})
