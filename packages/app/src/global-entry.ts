import {log} from 'evlog'
import {mountConciv} from './mount.js'

mountConciv().catch((error: unknown) => log.error({action: 'widget', message: 'the widget failed to start', error}))
