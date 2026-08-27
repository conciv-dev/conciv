import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname} from 'node:path'
import {generatedOutputs} from './generated-outputs.ts'

for (const output of generatedOutputs()) {
  mkdirSync(dirname(output.path), {recursive: true})
  writeFileSync(output.path, output.content)
}
