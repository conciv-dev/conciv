export const TOLERANCES = {
  geometryPx: 2,
  colorDeltaE: 3,
  declaredColorDeltaE: 1,
  tileGate: 0.005,
  unmatchedMinimum: 24,
  tileMargin: 8,
  interiorInset: 4,
  blurRadius: 1,
  glyphHalo: 1,
  inkTrimThreshold: 40,
  fillDifference: 0.05,
  depth: 3,
  limit: 12,
  runsKept: 20,
  frameSettleMs: 5000,
  captureBudgetMs: 10_000,
} as const

export const LIBRARY_SHEET_MARKER = '/node_modules/'
