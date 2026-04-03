export function getApiBaseUrl() {
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL

  if (process.env.NODE_ENV === 'production' && !publicApiUrl) {
    throw new Error('Missing NEXT_PUBLIC_API_URL in production environment')
  }

  return publicApiUrl ?? 'http://localhost:3001'
}

export class ApiError extends Error {
  status: number
  field?: string
  code?: string

  constructor(message: string, status: number, field?: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
    this.code = code
  }
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
    let field: string | undefined
    let code: string | undefined

    try {
      const payload = await response.json()
      if (typeof payload?.message === 'string' && payload.message.length > 0) {
        message = payload.message
      } else if (typeof payload?.error === 'string' && payload.error.length > 0) {
        message = payload.error
      }

      if (typeof payload?.field === 'string') field = payload.field
      if (typeof payload?.error === 'string') code = payload.error
    } catch {
      // Ignore JSON parse errors and use fallback message.
    }

    throw new ApiError(message, response.status, field, code)
  }

  return response.json() as Promise<T>
}
