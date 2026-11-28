import {useSyncExternalStore} from 'react'
import {setPath} from 'button-sounds'
import {useImperativeButtonSounds, type SoundName} from 'button-sounds/react'

const MUTED_KEY = 'conciv-sounds-muted'
const MUTED_EVENT = 'conciv-sounds-muted-change'
const VOLUME = 0.35

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

function subscribeMuted(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(MUTED_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(MUTED_EVENT, onChange)
  }
}

export function useSoundsMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, readMuted, () => false)
}

function writeMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
    return true
  } catch {
    return false
  }
}

export function setSoundsMuted(muted: boolean) {
  writeMuted(muted)
  window.dispatchEvent(new Event(MUTED_EVENT))
}

function useSoundTrigger(name: SoundName) {
  setPath('/sounds')
  const {press, release} = useImperativeButtonSounds(name, {volume: VOLUME})
  return () => {
    press()
    window.addEventListener('pointerup', () => release(), {once: true})
  }
}

export function useSound(name: SoundName) {
  const muted = useSoundsMuted()
  const play = useSoundTrigger(name)
  return () => {
    if (!muted) play()
  }
}

export function useUnmuteSound() {
  return useSoundTrigger('synth-on')
}
