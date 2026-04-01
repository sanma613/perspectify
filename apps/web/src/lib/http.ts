export function getApiBaseUrl() {
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL

  if (process.env.NODE_ENV === 'production' && !publicApiUrl) {
    throw new Error('Missing NEXT_PUBLIC_API_URL in production environment')
  }

  return publicApiUrl ?? 'http://localhost:3001'
}

export async function apiFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    let message = 'Request failed'
    try {
      const payload = await response.json()
      if (typeof payload?.error === 'string') message = payload.error
    } catch {
      // Ignore JSON parse errors and use fallback message.
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}
