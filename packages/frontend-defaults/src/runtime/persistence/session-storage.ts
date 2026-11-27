import {log} from 'evlog'
export function readSessionStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch (error) {
    log.error({action: 'persistence', message: 'this page has no sessionStorage', error})
    return undefined
  }
}
