import {fileURLToPath} from 'node:url'
import {widgetComponentSuite} from '@conciv/plugin-testkit/widget-suite'

widgetComponentSuite({id: 'fake-react', distDir: fileURLToPath(new URL('dist', import.meta.url))})
