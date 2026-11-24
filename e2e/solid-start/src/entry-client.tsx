import {mount, StartClient} from '@solidjs/start/client'

const root = document.getElementById('app')
if (!root) throw new Error('the page has no #app element')

mount(() => <StartClient />, root)
