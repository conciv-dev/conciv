import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./drizzle.runs.schema.ts'],
  out: './drizzle-runs',
})
