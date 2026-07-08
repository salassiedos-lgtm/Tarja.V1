export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const API = API_URL;

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

export interface Operation {
  id: number;
  code: string;
  shipName: string;
  operationType: 'ROLL_ON_ROLL_OFF' | 'DESCONSOLIDADO';
  operationDate: string | null;
  portDischarge: string | null;
  status: 'ACTIVA' | 'PAUSADA' | 'CERRADA';
  createdAt: string;
  _count?: { vehicles: number; bills: number };
}

export interface Accessory {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Vehicle {
  id: number;
  vin: string;
  chassisNumber: string | null;
  brand: string | null;
  weight: number | null;
  quantity: number;
  status: string;
  isUnplanned: boolean;
  billOfLading?: { blNumber: string } | null;
}

export interface ImportPreviewRow {
  rowNumber: number;
  vin: string;
  bl: string;
  brand: string | null;
  weight: number | null;
  quantity: number;
  errors: string[];
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ImportPreviewRow[];
}

export interface ImportResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rowsWithWarnings: number;
  newVehicles: number;
  existingVehicles: number;
  conflictingVehicles: number;
  blsDetected: number;
}

// ---------------- sesión ----------------
export function saveSession(d: LoginResult): void {
  localStorage.setItem('accessToken', d.accessToken);
  localStorage.setItem('refreshToken', d.refreshToken);
  localStorage.setItem('user', JSON.stringify(d.user));
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

// ---------------- helpers HTTP ----------------
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    let msg = 'Error en la solicitud';
    try {
      const b = await res.json();
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(', ') : b.message;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new Error(msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`${API}${path}`, { headers: authHeaders() }));
}

async function apiJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

async function apiUpload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  return handle<T>(await fetch(`${API}${path}`, { method: 'POST', headers: authHeaders(), body: fd }));
}

// ---------------- auth ----------------
export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? 'Usuario o contraseña incorrectos' : 'No se pudo iniciar sesión',
    );
  }
  return res.json() as Promise<LoginResult>;
}

// ---------------- operaciones ----------------
export const listOperations = () => apiGet<Operation[]>('/operations');
export const getOperation = (id: number | string) => apiGet<Operation>(`/operations/${id}`);
export const createOperation = (d: {
  code: string;
  shipName: string;
  operationType: string;
  operationDate?: string;
  portDischarge?: string;
}) => apiJson<Operation>('/operations', 'POST', d);
export const setOperationStatus = (id: number, action: 'activate' | 'pause' | 'close') =>
  apiJson<Operation>(`/operations/${id}/${action}`, 'POST');

// ---------------- accesorios ----------------
export const listAccessories = () => apiGet<Accessory[]>('/accessories');
export const createAccessory = (name: string) => apiJson<Accessory>('/accessories', 'POST', { name });
export const updateAccessory = (
  id: number,
  d: { name?: string; isActive?: boolean; sortOrder?: number },
) => apiJson<Accessory>(`/accessories/${id}`, 'PATCH', d);

// ---------------- importación ----------------
export const previewImport = (operationId: number | string, file: File) =>
  apiUpload<ImportPreview>(`/operations/${operationId}/imports/preview`, file);
export const confirmImport = (operationId: number | string, file: File) =>
  apiUpload<ImportResult>(`/operations/${operationId}/imports/confirm`, file);

// ---------------- vehículos ----------------
export const listVehicles = (operationId: number | string, vin?: string) =>
  apiGet<Vehicle[]>(
    `/operations/${operationId}/vehicles${vin ? `?vin=${encodeURIComponent(vin)}` : ''}`,
  );

// ---------------- tarja ----------------
export interface ReportAccessory {
  accessoryId: number;
  hasAccessory: boolean;
  quantity: number;
  accessory?: { name: string };
}
export interface ReportDamage {
  id: number;
  description: string;
}
export interface TarjaReport {
  id: number;
  reportCode: string;
  status: string;
  hasDamage: boolean;
  vehicleId: number;
  operationId: number;
  startedAt: string | null;
  tarjadorInitials: string | null;
  vehicle?: { vin: string; brand: string | null };
  accessories?: ReportAccessory[];
  damages?: ReportDamage[];
}
export interface DamageInput {
  hasDamage: boolean;
  damageSource?: string;
  damageOperation?: string;
  damageAffects?: string;
  damageMoment?: string;
  damageMomentOther?: string;
  descriptions?: string[];
}

export const startTarja = (operationId: number, vin: string) =>
  apiJson<TarjaReport>('/tarja/start', 'POST', { operationId, vin });
export const getReport = (id: number | string) => apiGet<TarjaReport>(`/tarja/${id}`);
export const setReportAccessories = (
  id: number | string,
  items: { accessoryId: number; hasAccessory: boolean; quantity: number }[],
) => apiJson<TarjaReport>(`/tarja/${id}/accessories`, 'PATCH', { items });
export const setReportDamages = (id: number | string, d: DamageInput) =>
  apiJson<TarjaReport>(`/tarja/${id}/damages`, 'PATCH', d);
export const finishTarja = (id: number | string, d: { details?: string; initials?: string }) =>
  apiJson<TarjaReport>(`/tarja/${id}/finish`, 'POST', d);

// ---------------- supervisión / reportes ----------------
export interface ProgressData {
  operationId: number;
  total: number;
  byStatus: Record<string, number>;
  avgDurationSeconds: number;
}
export interface ReportRow {
  id: number;
  reportCode: string;
  status: string;
  hasDamage: boolean;
  durationSeconds: number | null;
  vehicle?: { vin: string };
  tarjador?: { username: string; initials: string | null };
  operation?: { code: string };
}
export interface DashboardData {
  operations: (Operation & { _count?: { vehicles: number } })[];
  recent: ReportRow[];
}

export const getSupervisorDashboard = () => apiGet<DashboardData>('/dashboard/supervisor');
export const getProgress = (operationId: number | string) =>
  apiGet<ProgressData>(`/operations/${operationId}/progress`);
export const listReports = (operationId?: number) =>
  apiGet<ReportRow[]>(`/reports${operationId ? `?operationId=${operationId}` : ''}`);
export const annulReport = (reportId: number, reason: string, comment?: string) =>
  apiJson<ReportRow>(`/reports/${reportId}/annul`, 'POST', { reason, comment });

export interface AuditLog {
  id: number;
  userId: number | null;
  username: string | null;
  role: string | null;
  module: string;
  action: string;
  description: string | null;
  createdAt: string;
}
export const listAuditLogs = (limit = 200) => apiGet<AuditLog[]>(`/audit?limit=${limit}`);

export async function openReportPdf(reportId: number): Promise<void> {
  const res = await fetch(`${API}/reports/${reportId}/pdf`, { headers: authHeaders() });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
    return;
  }
  if (!res.ok) throw new Error('No se pudo generar el PDF');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
