const CLIENT_API_URL = '/api';
const SERVER_API_URL = 'http://localhost:3001/api';

export async function fetchAPI(path: string, options: RequestInit = {}) {
  const url = `${CLIENT_API_URL}${path}`;
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
  const url = `${SERVER_API_URL}${path}`;  // full URL for server-side
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  const res = await fetch(url, { headers });
  return res;
}