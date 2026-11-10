import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readMigrationFiles} from 'drizzle-orm/migrator'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const header = "import type {MigrationMeta} from 'drizzle-orm/migrator'"

writeMigrations({folder: 'drizzle', name: 'migrations', file: 'migrations.gen.ts'})
writeMigrations({folder: 'drizzle-runs', name: 'runsMigrations', file: 'runs-migrations.gen.ts'})

function writeMigrations(input: {folder: string; name: string; file: string}): void {
  const migrations = readMigrationFiles({migrationsFolder: join(packageRoot, input.folder)})
  const body = `export const ${input.name}: MigrationMeta[] = ${JSON.stringify(migrations, null, 2)}`
  writeFileSync(join(packageRoot, 'src', 'server', input.file), `${header}\n\n${body}\n`)
}
