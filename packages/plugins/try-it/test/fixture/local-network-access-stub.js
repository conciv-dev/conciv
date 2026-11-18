const handedOut = []
let currentState = 'denied'
const nativeQuery = navigator.permissions.query.bind(navigator.permissions)

navigator.permissions.query = (descriptor) => {
  if (descriptor.name !== 'local-network-access') return nativeQuery(descriptor)
  const status = Object.assign(new EventTarget(), {name: descriptor.name, state: currentState, onchange: null})
  handedOut.push(status)
  return Promise.resolve(status)
}

document.addEventListener('DOMContentLoaded', () => {
  const grant = document.createElement('button')
  grant.type = 'button'
  grant.textContent = 'Grant local network access'
  grant.addEventListener('click', () => {
    currentState = 'granted'
    handedOut.forEach((status) => {
      status.state = currentState
      status.dispatchEvent(new Event('change'))
    })
  })
  document.body.appendChild(grant)
})
