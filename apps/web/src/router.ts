import { useEffect, useState } from 'react'

export type AppRoute = 'home' | 'login' | 'invite_accept' | 'not_found'

export function routeFromPath(pathname: string): AppRoute {
  if (pathname === '/') return 'home'
  if (pathname === '/login') return 'login'
  if (pathname === '/invite/accept') return 'invite_accept'
  return 'not_found'
}
export function navigateTo(target: string, replace = false) {
  if (replace) {
    window.history.replaceState(null, '', target)
  } else {
    window.history.pushState(null, '', target)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useAppRoute() {
  const [route, setRoute] = useState(() => routeFromPath(window.location.pathname))

  useEffect(() => {
    const updateRoute = () => setRoute(routeFromPath(window.location.pathname))
    window.addEventListener('popstate', updateRoute)
    return () => window.removeEventListener('popstate', updateRoute)
  }, [])

  return route
}
