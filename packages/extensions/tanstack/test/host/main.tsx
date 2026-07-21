import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query'
import {createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider} from '@tanstack/react-router'
import {mountConciv} from '@conciv/embed'
import tanstackExtension from 'virtual:conciv-extension-under-test'

const queryClient = new QueryClient()

const rootRoute = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
        <Link to="/form">Form</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

function HomePage() {
  return (
    <section>
      <h1>TanStack inspection home</h1>
      <p>Welcome to the real TanStack Router host application.</p>
    </section>
  )
}

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  loader: async () => ({server: {greeting: 'hello'}, local: {n: 42, tags: ['a', 'b']}}),
  component: AboutPage,
})

function AboutPage() {
  const loaderData = aboutRoute.useLoaderData()
  const demo = useQuery({queryKey: ['spike', 'demo'], queryFn: async () => ({fetched: true})})
  return (
    <section>
      <h1>About this app</h1>
      <p>Greeting: {loaderData.server.greeting}</p>
      <p>Answer: {loaderData.local.n}</p>
      <p>Tags: {loaderData.local.tags.join(', ')}</p>
      <p>Query fetched: {demo.data?.fetched ? 'yes' : 'pending'}</p>
    </section>
  )
}

const formRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/form',
  component: FormPage,
})

function FormPage() {
  return (
    <section>
      <h1>Form page</h1>
      <form>
        <label>
          Name
          <input name="name" type="text" />
        </label>
        <button type="submit">Submit</button>
      </form>
    </section>
  )
}

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute, formRoute])

const router = createRouter({routeTree})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(<App />)
  mountConciv([tanstackExtension])
}
