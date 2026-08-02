const handedOut = []
let currentState = 'denied'
const nativeQuery = navigator.permissions.query.bind(navigator.permissions)

navigator.permissions.query = (descriptor) => {
  if (descriptor.name !== 'local-network-access') return nativeQuery(descriptor)
  const status = Object.assign(new EventTarget(), {name: descriptor.name, state: currentState, onchange: null})
  handedOut.push(status)
  return Promise.resolve(status)
}

document.addEventListener('local-network-access-state', (event) => {
  currentState = event.detail
  handedOut.forEach((status) => status.dispatchEvent(new Event('change')))
})
