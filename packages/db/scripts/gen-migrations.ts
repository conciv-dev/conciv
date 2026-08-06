import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const migrationsRoot = join(packageRoot, 'drizzle')
const target = join(packageRoot, 'src', 'migrations.ts')

const names = readdirSync(migrationsRoot)
  .filter((entry) => existsSync(join(migrationsRoot, entry, 'migration.sql')))
  .toSorted((left, right) => left.localeCompare(right))

const entries = names.map((name) => {
  const sql = readFileSync(join(migrationsRoot, name, 'migration.sql'), 'utf8')
  const escaped = sql.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${')
  return `  '${name}': \`${escaped}\`,`
})

writeFileSync(target, `export const migrationSql: Record<string, string> = {\n${entries.join('\n')}\n}\n`)
