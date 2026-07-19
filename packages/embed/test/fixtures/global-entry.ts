import terminal from '@conciv/extension-terminal/client'
import recorder from '@conciv/extension-recorder/client'
import {mountConciv} from '../../src/mount.js'

mountConciv([terminal, recorder])
