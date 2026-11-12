import {useSearch} from '@tanstack/react-router'

export function Paginator() {
  const search = useSearch({strict: false})
  return <span>{String(search.page)}</span>
}
