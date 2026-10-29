export type GrowthWatch = {lengths: () => number[]; stop: () => void}

export function watchTextGrowth(select: () => Element | null): GrowthWatch {
  const lengths: number[] = []
  const record = (): void => {
    const node = select()
    if (!node) return
    const length = (node.textContent ?? '').length
    if (lengths.at(-1) === length) return
    lengths.push(length)
  }
  const observer = new MutationObserver(record)
  observer.observe(document.body, {subtree: true, childList: true, characterData: true})
  record()
  return {lengths: () => lengths, stop: () => observer.disconnect()}
}
