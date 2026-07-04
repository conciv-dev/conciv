import {useSyncExternalStore} from 'react'

type NetworkInformation = EventTarget & {
  saveData?: boolean
  type?: string
  effectiveType?: string
}

declare global {
  interface Navigator {
    connection?: NetworkInformation
  }
}

const connection = () => (typeof navigator === 'undefined' ? undefined : navigator.connection)

const subscribe = (onChange: () => void) => {
  const info = connection()
  if (!info) return () => {}
  info.addEventListener('change', onChange)
  return () => info.removeEventListener('change', onChange)
}

const getSnapshot = () => {
  const info = connection()
  if (!info) return false
  return info.saveData === true || info.type === 'cellular'
}

const getServerSnapshot = () => false

export function useMeteredConnection() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
