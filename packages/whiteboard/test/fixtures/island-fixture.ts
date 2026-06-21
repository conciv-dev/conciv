import {mountIsland} from '../../src/canvas/island.js'

const host = document.getElementById('host')
if (host) {
  const shadow = host.attachShadow({mode: 'open'})
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.inset = '0'
  shadow.appendChild(container)
  mountIsland({container, initialElements: [], onUserChange: () => {}, onPointer: () => {}, theme: 'light'})
}

export {}
