import {inject} from 'vitest'
import {configure} from '@solidjs/testing-library'
import type {} from './browser-commands.js'

configure({asyncUtilTimeout: inject('concivPollTimeoutMs')})
