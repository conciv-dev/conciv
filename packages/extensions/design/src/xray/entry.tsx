import '@unocss/reset/tailwind.css'
import '@conciv/ui-kit-system/tokens.css'
import 'virtual:uno.css'
import './xray.css'
import {RouterProvider} from '@tanstack/solid-router'
import {render} from 'solid-js/web'
import {createXrayRouter} from './router.js'

const mount = document.querySelector('[data-design-xray]')

if (mount !== null) render(() => <RouterProvider router={createXrayRouter()} />, mount)
