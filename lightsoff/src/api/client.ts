import { API_URL } from './config'

export class ApiError extends Error {
  status: number
  body?: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })
  const text = await res.text()
  const body = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const msg = (body as { error?: string })?.error ?? res.statusText
    throw new ApiError(msg, res.status, body)
  }
  return body as T
}

export async function fetchDevToken(userId: string): Promise<string> {
  const data = await apiFetch<{ token: string }>('/dev/token', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
  return data.token
}

export async function checkApiHealth(): Promise<{ ok: boolean; devAuth?: boolean }> {
  return apiFetch('/health')
}
