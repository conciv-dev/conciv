import '@unocss/reset/tailwind.css'
import '@conciv/ui-kit-system/tokens.css'
import 'virtual:uno.css'
import './xray.css'
import {RouterProvider} from '@tanstack/solid-router'
import {render} from 'solid-js/web'
import {loadFixture} from '../../test/dev-fixture.js'
import {createXrayRouter, standaloneContext} from './router.js'

const mount = document.querySelector('[data-design-xray]')
const fixture = import.meta.env.DEV ? (id: string) => loadFixture({id}) : null

if (mount !== null) {
  render(() => <RouterProvider router={createXrayRouter({context: standaloneContext({fixture})})} />, mount)
}
