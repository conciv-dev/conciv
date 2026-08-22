import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readMigrationFiles} from 'drizzle-orm/migrator'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const header = "import type {MigrationMeta} from 'drizzle-orm/migrator'"

function generate(migrationsFolder: string, outFile: string, exportName: string): void {
  const migrations = readMigrationFiles({migrationsFolder: join(packageRoot, migrationsFolder)})
  const body = `export const ${exportName}: MigrationMeta[] = ${JSON.stringify(migrations, null, 2)}`
  writeFileSync(join(packageRoot, 'src', outFile), `${header}\n\n${body}\n`)
}

generate('drizzle', 'migrations.gen.ts', 'migrations')
generate('drizzle-global', 'migrations-global.gen.ts', 'globalMigrations')
