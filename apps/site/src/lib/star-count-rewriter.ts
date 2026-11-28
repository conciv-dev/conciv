import {formatStarCount} from './star-count'

export function withStarCount(page: Response, stars: number | null): Response {
  if (stars === null) return page
  return new HTMLRewriter()
    .on('[data-star-count="number"]', {
      element(element) {
        element.setInnerContent(formatStarCount(stars))
      },
    })
    .on('[data-star-count="label"]', {
      element(element) {
        element.setInnerContent(`${stars} stars`)
      },
    })
    .transform(page)
}
