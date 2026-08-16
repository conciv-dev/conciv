import {expect} from '@playwright/test'

export function expectNear(label: string, value: number, target: number, tolerance: number): void {
  expect(Math.abs(value - target) <= tolerance, `${label}: got ${value}, expected ${target} +/- ${tolerance}`).toBe(
    true,
  )
}
