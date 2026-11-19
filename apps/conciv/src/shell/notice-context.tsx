import {createContext, createEffect, useContext, type JSX} from 'solid-js'
import {useEngineReachability, type EngineReachability} from '../app/reachability.js'
import {acknowledgeLocalStorageNotice, localStorageNoticePending} from '../runtime/persistence/storage.js'
import {createNoticeStore, type NoticeStore} from './notices.js'

const NoticeStoreContext = createContext<NoticeStore>()

export function NoticeContextProvider(props: {children: JSX.Element}): JSX.Element {
  const store = createNoticeStore()
  createEffect(() => {
    if (!localStorageNoticePending()) return
    acknowledgeLocalStorageNotice()
    store.notify('Some changes are not being saved', {
      tone: 'danger',
      description: "This browser's storage is full or unavailable, so plugin settings may be lost when you reload.",
    })
  })
  return <NoticeStoreContext.Provider value={store}>{props.children}</NoticeStoreContext.Provider>
}

export function useNotices(): NoticeStore {
  const value = useContext(NoticeStoreContext)
  if (!value) throw new Error('useNotices called outside NoticeContextProvider')
  return value
}

export function NoticeSurface(): JSX.Element {
  const store = useNotices()
  return store.Toaster()
}

export function useReportFailure(): (message: string, error: unknown) => void {
  const notices = useNotices()
  return (message, error) => {
    console.error(`[conciv] ${message}`, error)
    notices.notify(message, {tone: 'danger', key: message})
  }
}

export type EngineNotices = {reachability: EngineReachability; notices: NoticeStore}

export function useEngineNotices(): EngineNotices {
  return {reachability: useEngineReachability(), notices: useNotices()}
}
