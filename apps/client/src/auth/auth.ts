/**
 * Basit istemci oturumu: login'de alınan bearer token localStorage'da
 * tutulur; tüm API istekleri Authorization header'ı ile gider. 401
 * dönerse oturum düşmüş demektir → /login'e yönlendirilir.
 */

const TOKEN_KEY = 'verim_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

/** 401'de çağrılır — token'ı temizle ve login'e dön. */
export function handleUnauthorized(): void {
  clearToken();
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}
