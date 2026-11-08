import {createFileRoute} from '@tanstack/react-router'
import {logIn, logOut} from '../lib/session'

export const Route = createFileRoute('/login')({component: Login})

function Login() {
  const navigate = Route.useNavigate()
  return (
    <main style={{padding: 48, display: 'flex', gap: 12, flexDirection: 'column', alignItems: 'flex-start'}}>
      <h1>Log in</h1>
      <p>The form page needs the HttpOnly mirror_session cookie.</p>
      <button
        type="button"
        onClick={async () => {
          await logIn()
          await navigate({to: '/form'})
        }}
      >
        Log in
      </button>
      <button type="button" onClick={() => logOut()}>
        Log out
      </button>
    </main>
  )
}
