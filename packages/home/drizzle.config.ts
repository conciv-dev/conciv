import {fileURLToPath} from 'node:url'
import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: [
    './src/registry/home-schema.ts',
    fileURLToPath(import.meta.resolve('@conciv/backend-app-api/core/credential/sql')),
  ],
  out: './drizzle',
})
