import {fileURLToPath} from 'node:url'
import {defineConfig} from 'drizzle-kit'

const pluginHostTables = ['core/session/sql', 'core/event/sql', 'core/kv/sql', 'core/permission/sql'].map((table) =>
  fileURLToPath(import.meta.resolve(`@conciv/backend-app-api/${table}`)),
)

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/db/schema.ts', './src/db/run-schema.ts', ...pluginHostTables],
  out: './drizzle',
})
