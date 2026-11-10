import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/home-schema.ts', './src/catalog-schema.ts', './src/command-schema.ts'],
  out: './drizzle-home',
})
