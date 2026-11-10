import {isAbsolute, sep} from 'node:path'

export function sameFile(input: {walked: string; source: string}): boolean {
  const {walked, source} = input
  return walked === source || (isAbsolute(walked) && !isAbsolute(source) && walked.endsWith(`${sep}${source}`))
}
