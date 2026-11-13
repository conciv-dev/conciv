import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/core/event/sql.ts'],
  out: './drizzle',
})
