import {execFile} from 'node:child_process'

export type RunOptions = {cwd?: string; env?: Record<string, string>}

export type RunResult = {code: number; stdout: Buffer; stderr: string}

export type SimctlRunner = {
  run: (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>
}

const MAX_BUFFER = 128 * 1024 * 1024

export function makeExecRunner(): SimctlRunner {
  return {
    run: (cmd, args, opts) =>
      new Promise((resolve) => {
        execFile(
          cmd,
          args,
          {cwd: opts?.cwd, env: {...process.env, ...opts?.env}, maxBuffer: MAX_BUFFER, encoding: 'buffer'},
          (error, stdout, stderr) => {
            const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0
            resolve({code, stdout, stderr: stderr.toString('utf8')})
          },
        )
      }),
  }
}
