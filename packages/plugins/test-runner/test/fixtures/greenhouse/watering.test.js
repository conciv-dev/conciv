import {test} from 'vitest'

test('the soil stays wet through the night', () => new Promise((resolve) => setTimeout(resolve, 60_000)), 120_000)
