import {useEffect, useSyncExternalStore} from 'react'

type ThemeMode = 'light' | 'dark' | 'auto'

const THEME_CHANGE_EVENT = 'theme-mode-change'

function subscribeToMode(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange)
  }
}

function storedMode(): ThemeMode {
  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark' || stored === 'auto') {
    return stored
  }

  return 'auto'
}

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)

  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', mode)
  }

  document.documentElement.style.colorScheme = resolved
}

export default function ThemeToggle() {
  const mode = useSyncExternalStore<ThemeMode>(subscribeToMode, storedMode, () => 'auto')

  useEffect(() => {
    applyThemeMode(mode)
  }, [mode])

  useEffect(() => {
    if (mode !== 'auto') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeMode('auto')

    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [mode])

  function toggleMode() {
    const nextMode: ThemeMode = mode === 'light' ? 'dark' : mode === 'dark' ? 'auto' : 'light'
    window.localStorage.setItem('theme', nextMode)
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }

  const label =
    mode === 'auto'
      ? 'Theme mode: auto (system). Click to switch to light mode.'
      : `Theme mode: ${mode}. Click to switch mode.`

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className="btn btn-ghost btn-round px-4 py-1.5 text-[0.8125rem]"
    >
      {mode === 'auto' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}
