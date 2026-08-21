const PANEL_HEIGHT_INSET_REM = 7.5
const PANEL_DEFAULT_HEIGHT_PX = 750

export function panelHeightCap(viewportHeightPx: number, rootFontSizePx: number): number {
  return viewportHeightPx - PANEL_HEIGHT_INSET_REM * rootFontSizePx
}

export function defaultPanelHeight(viewportHeightPx: number, rootFontSizePx: number): number {
  return Math.min(PANEL_DEFAULT_HEIGHT_PX, viewportHeightPx * 0.9, panelHeightCap(viewportHeightPx, rootFontSizePx))
}
