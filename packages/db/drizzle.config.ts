import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/schema.ts', './src/run-schema.ts', './src/catalog-schema.ts', './src/command-schema.ts'],
  out: './drizzle',
})
