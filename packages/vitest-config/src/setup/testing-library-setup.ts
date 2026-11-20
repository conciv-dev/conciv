import {configure} from '@solidjs/testing-library'
import {POLL_TIMEOUT_MS} from '../reporters.ts'

configure({asyncUtilTimeout: POLL_TIMEOUT_MS})
