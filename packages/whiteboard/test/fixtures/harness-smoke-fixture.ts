declare global {
  interface Window {
    __CORE__: string
  }
}

const out = document.getElementById('out')
if (out) out.textContent = `core ${window.__CORE__}`

export {}
