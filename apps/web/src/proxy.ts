import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function getApiBaseUrl() {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
}

async function getHasEndpoints(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/endpoints`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok) return false

    const data = (await response.json()) as unknown
    const endpoints = Array.isArray(data)
      ? data
      : (data as { endpoints?: unknown })?.endpoints

    return Array.isArray(endpoints) && endpoints.length > 0
  } catch {
    // In dev, API restarts can briefly close sockets; fail open to avoid crashing Next proxy.
    return true
  }
}

function getAccessTokenFromCookies(request: NextRequest): string | null {
  const authCookies = request.cookies
    .getAll()
    .filter((cookie) => /-auth-token(\.\d+)?$/.test(cookie.name))

  if (authCookies.length === 0) return null

  const ordered = authCookies.sort((a, b) => {
    const aMatch = a.name.match(/\.([0-9]+)$/)
    const bMatch = b.name.match(/\.([0-9]+)$/)
    const aIndex = aMatch ? Number.parseInt(aMatch[1], 10) : 0
    const bIndex = bMatch ? Number.parseInt(bMatch[1], 10) : 0
    return aIndex - bIndex
  })

  const rawValue = ordered.map((cookie) => cookie.value).join('')
  const decodedValue = decodeURIComponent(rawValue)

  try {
    const parsed = JSON.parse(decodedValue) as unknown

    if (
      parsed &&
      typeof parsed === 'object' &&
      'access_token' in parsed &&
      typeof (parsed as { access_token: unknown }).access_token === 'string'
    ) {
      return (parsed as { access_token: string }).access_token
    }

    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      return parsed[0]
    }
  } catch {
    return null
  }

  return null
}

const AUTH_ROUTES = new Set([
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/confirm-email',
])

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) => {
          cs.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cs.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const searchParams = request.nextUrl.searchParams
  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isAuthRoute = AUTH_ROUTES.has(pathname)

  if (!user) {
    if (isDashboardRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  if (!user.email_confirmed_at && pathname !== '/confirm-email') {
    const url = request.nextUrl.clone()
    url.pathname = '/confirm-email'
    return NextResponse.redirect(url)
  }

  if (user.email_confirmed_at && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (!user.email_confirmed_at && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/confirm-email'
    return NextResponse.redirect(url)
  }

  if (user.email_confirmed_at && pathname === '/dashboard') {
    const bypassOnboarding =
      searchParams.get('skipOnboarding') === '1' ||
      searchParams.get('skipOnboarding') === 'true'
    const createdAtMs = user.created_at ? new Date(user.created_at).getTime() : Number.NaN
    const isRecentlyCreated = Number.isFinite(createdAtMs) && Date.now() - createdAtMs < 10 * 60 * 1000
    const isNewUser = !bypassOnboarding && (isRecentlyCreated || searchParams.get('new') === 'true')

    if (isNewUser) {
      const accessToken = getAccessTokenFromCookies(request)
      if (accessToken) {
        const hasEndpoints = await getHasEndpoints(accessToken)
        if (!hasEndpoints) {
          const url = request.nextUrl.clone()
          url.pathname = '/onboarding'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup', '/forgot-password', '/reset-password', '/confirm-email'],
}