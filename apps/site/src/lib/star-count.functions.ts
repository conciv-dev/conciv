import {createServerFn} from '@tanstack/react-start'
import {resolveStarCount} from '@/lib/star-count-resolver.server'

export const getStarCount = createServerFn({method: 'GET'}).handler(async () => ({stars: await resolveStarCount()}))
