import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readMigrationFiles} from 'drizzle-orm/migrator'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const header = "import type {MigrationMeta} from 'drizzle-orm/migrator'"

writeMigrations('drizzle', 'migrations', 'migrations.gen.ts')
writeMigrations('drizzle-home', 'homeMigrations', 'home-migrations.gen.ts')

function writeMigrations(folder: string, name: string, file: string): void {
  const migrations = readMigrationFiles({migrationsFolder: join(packageRoot, folder)})
  const body = `export const ${name}: MigrationMeta[] = ${JSON.stringify(migrations, null, 2)}`
  writeFileSync(join(packageRoot, 'src', file), `${header}\n\n${body}\n`)
}
