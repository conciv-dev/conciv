import {createServerFn} from '@tanstack/react-start'
import {fetchStarCount} from '@/lib/star-count.server'

export const getStarCount = createServerFn({method: 'GET'}).handler(() => fetchStarCount())
