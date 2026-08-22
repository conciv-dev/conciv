import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/settings-schema.ts'],
  out: './drizzle-global',
})
