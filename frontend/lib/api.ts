const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type Role = 'ADMIN' | 'SUPERVISOR' | 'TARJADOR';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  lastname: string;
  initials: string | null;
  role: Role;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const msg =
      res.status === 401
        ? 'Usuario o contraseña incorrectos'
        : 'No se pudo iniciar sesión. Intente nuevamente.';
    throw new Error(msg);
  }
  return res.json() as Promise<LoginResult>;
}

export function saveSession(data: LoginResult): void {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function clearSession(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}
