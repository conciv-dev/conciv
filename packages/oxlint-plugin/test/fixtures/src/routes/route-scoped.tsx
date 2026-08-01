import {getRouteApi} from '@tanstack/react-router'

const productsRoute = getRouteApi('/products')

export function Sort() {
  const {sort} = productsRoute.useSearch()
  const navigate = productsRoute.useNavigate()
  return <button onClick={() => navigate({search: {sort}})}>{sort}</button>
}
