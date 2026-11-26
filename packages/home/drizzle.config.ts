import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/registry/home-schema.ts'],
  out: './drizzle',
})
