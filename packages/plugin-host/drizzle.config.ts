import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/core/event/sql.ts', './src/core/kv/sql.ts', './src/core/permission/sql.ts'],
  out: './drizzle',
})
