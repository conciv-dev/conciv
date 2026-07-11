export function elementAt(x: number, y: number): Element | null {
  return document.elementsFromPoint(x, y).find((element) => !element.closest('[data-conciv-effects]')) ?? null
}
