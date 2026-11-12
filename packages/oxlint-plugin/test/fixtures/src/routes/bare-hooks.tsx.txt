import {Link, useNavigate, useSearch} from '@tanstack/react-router'

export function Filters() {
  const search = useSearch({strict: false})
  const navigate = useNavigate()
  return (
    <Link to="/" onClick={() => navigate({search})}>
      {String(search.page)}
    </Link>
  )
}
