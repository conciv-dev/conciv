#!/usr/bin/env node
import {realpath} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

if (process.stdout.isTTY !== true && process.env.FORCE_COLOR === undefined) process.env.NO_COLOR = '1'

const entry = process.argv[1]

if (entry && import.meta.url === pathToFileURL(await realpath(entry)).href) {
  const [{main}, {runCli}] = await Promise.all([import('./main.js'), import('./run.js')])
  process.exitCode = await runCli(main, process.argv.slice(2))
}
