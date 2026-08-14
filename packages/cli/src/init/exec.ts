import {spawn} from 'node:child_process'

export type CommandOutcome = {code: number; output: string}

export function execFileOutcome(
  bin: string,
  args: string[],
  options: {cwd: string; env?: NodeJS.ProcessEnv},
  onLine: (line: string) => void,
): Promise<CommandOutcome> {
  return new Promise((settle, reject) => {
    const child = spawn(bin, args, options)
    let output = ''
    let pending = ''
    const consume = (chunk: Buffer): void => {
      const text = chunk.toString()
      output += text
      pending += text
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    }
    child.stdout?.on('data', consume)
    child.stderr?.on('data', consume)
    child.on('error', reject)
    child.on('close', (code) => {
      if (pending.length > 0) onLine(pending)
      settle({code: code ?? 0, output})
    })
  })
}
