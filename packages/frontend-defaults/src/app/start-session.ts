import {log} from 'evlog'
import {useAppData} from './context.js'
import {useNotices} from '../shell/notice-context.js'

const START_FAILED = 'Could not start a new session. Check that the engine is running, then try again.'

export function useStartSession(): () => Promise<{sessionId: string}> {
  const appData = useAppData()
  const notices = useNotices()
  return () =>
    appData.createSession().catch((error: unknown) => {
      log.error({action: 'sessions', message: 'could not start a new session', error})
      notices.notify(START_FAILED, {tone: 'danger'})
      throw error
    })
}
