import {spawn} from 'node:child_process'

export type CommandOutcome = {code: number; output: string}

export function execFileOutcome(
  bin: string,
  args: string[],
  options: {cwd: string; env?: NodeJS.ProcessEnv; timeout?: number; started?: (pid: number) => void},
  onLine: (line: string) => void,
): Promise<CommandOutcome> {
  return new Promise((settle, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout,
      killSignal: 'SIGKILL',
    })
    if (child.pid !== undefined) options.started?.(child.pid)
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
    child.on('close', (code, signal) => {
      if (pending.length > 0) onLine(pending)
      if (code === null) {
        const note = signal ? `terminated by ${signal}` : 'terminated without exit code'
        settle({code: 1, output: output.length > 0 ? `${output}\n${note}` : note})
        return
      }
      settle({code, output})
    })
  })
}
