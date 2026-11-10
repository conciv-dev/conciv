import {judge} from './judge.js'
import {rescore} from './rescore.js'
import {serve} from './serve.js'
import {wave} from './wave.js'

const COMMANDS: Record<string, (argv: string[]) => Promise<void>> = {serve, wave, judge, rescore}

const [name = '', ...argv] = process.argv.slice(2)
const command = COMMANDS[name]
if (command === undefined) throw new Error(`trial takes one of ${Object.keys(COMMANDS).join(', ')}, not ${name}`)
await command(argv)
