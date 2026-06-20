import {writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {TOKENS, renderTokensCss} from '../src/tokens.ts'

const out = fileURLToPath(new URL('../src/tokens.css', import.meta.url))
writeFileSync(out, renderTokensCss(TOKENS))
