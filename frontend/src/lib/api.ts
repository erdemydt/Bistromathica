const API_URL = '/api';

export async function fetchAPI(path: string, options: RequestInit = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  return res;
}

export async function serverFetch(path: string, cookie?: string) {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {};
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  const res = await fetch(url, { headers });
  return res;
}
