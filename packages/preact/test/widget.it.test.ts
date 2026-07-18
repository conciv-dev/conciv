import {fileURLToPath} from 'node:url'
import {widgetComponentSuite} from '@conciv/extension-testkit/widget-suite'

widgetComponentSuite({id: 'fake-preact', distDir: fileURLToPath(new URL('dist', import.meta.url))})
