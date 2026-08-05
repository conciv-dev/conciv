import {execFile} from 'node:child_process'

export type CommandOutcome = {code: number; output: string}

export function execFileOutcome(
  bin: string,
  args: string[],
  options: {cwd: string; env?: NodeJS.ProcessEnv},
): Promise<CommandOutcome> {
  return new Promise((settle, reject) => {
    execFile(bin, args, options, (error, stdout, stderr) => {
      if (error === null) {
        settle({code: 0, output: `${stdout}${stderr}`})
        return
      }
      if (typeof error.code !== 'number') {
        reject(error)
        return
      }
      settle({code: error.code, output: `${stdout}${stderr}`})
    })
  })
}
