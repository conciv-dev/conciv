import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readMigrationFiles} from 'drizzle-orm/migrator'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const migrations = readMigrationFiles({migrationsFolder: join(packageRoot, 'drizzle')})
const header = "import type {MigrationMeta} from 'drizzle-orm/migrator'"
const body = `export const migrations: MigrationMeta[] = ${JSON.stringify(migrations, null, 2)}`
writeFileSync(join(packageRoot, 'src', 'migrations.gen.ts'), `${header}\n\n${body}\n`)
