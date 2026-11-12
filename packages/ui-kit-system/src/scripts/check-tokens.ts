import {readFileSync} from 'node:fs'
import {generatedOutputs} from './generated-outputs.ts'

function committed(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const drifted = generatedOutputs().filter((output) => committed(output.path) !== output.content)

if (drifted.length > 0) {
  const list = drifted.map((output) => `  - ${output.label}`).join('\n')
  console.error(
    `Generated token outputs are out of date:\n${list}\n\nRun \`pnpm --filter @conciv/ui-kit-system gen:tokens\` and commit the result.`,
  )
  process.exit(1)
}

console.log(`Generated token outputs are up to date (${generatedOutputs().length} files).`)
