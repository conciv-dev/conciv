import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/home-schema.ts'],
  out: './drizzle-home',
})
