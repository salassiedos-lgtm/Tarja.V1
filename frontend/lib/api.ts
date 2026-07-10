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
  openedAt: string | null;
  closedAt: string | null;
  lastReportAt?: string | null;
  _count?: { vehicles: number; bills: number };
  // Enriquecidos por GET /operations (para las tarjetas del Administrador).
  total?: number;
  completed?: number;
  pending?: number;
  fileName?: string | null;
  uploadedByName?: string | null;
}

export interface Accessory {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ManagedUser {
  id: number;
  username: string;
  name: string;
  lastname: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  role: { name: Role };
}

export interface Vehicle {
  id: number;
  vin: string;
  chassisNumber: string | null;
  brand: string | null;
  model: string | null;
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

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return handle<T>(await fetch(`${API}${path}`, { headers: authHeaders(), signal }));
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
/** Elimina un lote (operación) completo con su trabajo asociado. Solo ADMIN. Destructivo. */
export const deleteOperation = (id: number) =>
  apiJson<{ deleted: boolean; code: string }>(`/operations/${id}`, 'DELETE');

// ---------------- accesorios ----------------
export const listAccessories = () => apiGet<Accessory[]>('/accessories');
export const createAccessory = (name: string) => apiJson<Accessory>('/accessories', 'POST', { name });
export const updateAccessory = (
  id: number,
  d: { name?: string; isActive?: boolean; sortOrder?: number },
) => apiJson<Accessory>(`/accessories/${id}`, 'PATCH', d);
export const deleteAccessory = (id: number) => apiJson<{ id: number }>(`/accessories/${id}`, 'DELETE');

// ---------------- usuarios ----------------
export const listUsers = () => apiGet<ManagedUser[]>('/users');
export const createUser = (d: {
  name: string;
  lastname: string;
  username: string;
  email: string;
  password: string;
  role: Role;
}) => apiJson<ManagedUser>('/users', 'POST', d);
export const updateUser = (
  id: number,
  d: { name?: string; lastname?: string; email?: string; role?: Role },
) => apiJson<ManagedUser>(`/users/${id}`, 'PATCH', d);
export const setUserStatus = (id: number, status: 'ACTIVE' | 'INACTIVE') =>
  apiJson<ManagedUser>(`/users/${id}/status`, 'PATCH', { status });
export const resetUserPassword = (id: number, password: string) =>
  apiJson<{ id: number }>(`/users/${id}/password`, 'PATCH', { password });

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

// ---------------- tablero por B/L (Cuadro de Tareas) ----------------
export interface BlBoardRow {
  billOfLadingId: number;
  blNumber: string;
  operationId: number;
  operationCode: string;
  shipName: string;
  total: number;
  done: number;
  inProcess: number;
  pending: number;
  containers: number;
  percent: number;
}
export const getBlBoard = () => apiGet<BlBoardRow[]>('/bls/board');

export interface BlVehicle {
  vehicleId: number;
  vin: string;
  status: string;
  brand: string | null;
  model: string | null;
  containerNumber: string | null;
  currentReportId: number | null;
  done: boolean;
  blocked: boolean;
  blockedReason: string | null;
}
export interface BlVehicles {
  billOfLadingId: number;
  blNumber: string;
  operationId: number;
  operationCode: string;
  operationStatus: string;
  shipName: string;
  vehicles: BlVehicle[];
}
export const getBlVehicles = (blId: number | string) =>
  apiGet<BlVehicles>(`/bls/${blId}/vehicles`);

// ---------------- tablero por NAVE (Cuadro de Tareas) ----------------
export interface NaveBoardRow {
  operationId: number;
  operationCode: string;
  shipName: string;
  total: number;
  done: number;
  inProcess: number;
  pending: number;
  containers: number;
  bls: number;
  percent: number;
}
export const getNavesBoard = () => apiGet<NaveBoardRow[]>('/naves/board');

export interface NaveVehicle {
  vehicleId: number;
  vin: string;
  status: string;
  brand: string | null;
  model: string | null;
  containerNumber: string | null;
  blNumber: string | null;
  currentReportId: number | null;
  done: boolean;
  blocked: boolean;
  blockedReason: string | null;
  tarjadorId: number | null;
  reopenSecondsLeft: number;
  editRequestStatus: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | null;
  editRejectComment: string | null;
}
export interface NaveVehicles {
  operationId: number;
  operationCode: string;
  operationStatus: string;
  shipName: string;
  vehicles: NaveVehicle[];
}
export const getNaveVehicles = (opId: number | string) =>
  apiGet<NaveVehicles>(`/naves/${opId}/vehicles`);

/** Fila de GET /vehicles/search. `blocked` y `blockedReason` los calcula el backend. */
export interface VehicleSearchRow {
  vehicleId: number;
  vin: string;
  blNumber: string | null;
  shipName: string;
  operationCode: string;
  brand: string | null;
  model: string | null;
  containerNumber: string | null;
  blocked: boolean;
  blockedReason: string | null;
}

export const searchVehicles = (q: string, signal?: AbortSignal) =>
  apiGet<VehicleSearchRow[]>(`/vehicles/search?q=${encodeURIComponent(q)}`, signal);

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
  tarjadorId?: number;
  startedAt: string | null;
  finishedAt?: string | null;
  tarjadorInitials: string | null;
  /** Segundos restantes de la ventana de edición de 10 min (0 si venció/no aplica). */
  reopenSecondsLeft?: number;
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

// El backend resuelve la operacion desde el VIN (unico global): no recibe operationId.
export const startTarja = (vin: string) =>
  apiJson<TarjaReport>('/tarja/start', 'POST', { vin });
export const getReport = (id: number | string) => apiGet<TarjaReport>(`/tarja/${id}`);
export const setReportAccessories = (
  id: number | string,
  items: { accessoryId: number; hasAccessory: boolean; quantity: number }[],
) => apiJson<TarjaReport>(`/tarja/${id}/accessories`, 'PATCH', { items });
export const setReportDamages = (id: number | string, d: DamageInput) =>
  apiJson<TarjaReport>(`/tarja/${id}/damages`, 'PATCH', d);
export const finishTarja = (id: number | string, d: { details?: string; initials?: string }) =>
  apiJson<TarjaReport>(`/tarja/${id}/finish`, 'POST', d);
/** Reabre la tarja recién finalizada (solo el dueño, dentro de la ventana de 10 min). */
export const reopenTarja = (id: number | string) =>
  apiJson<TarjaReport>(`/tarja/${id}/reopen`, 'POST');

/** El dueño solicita autorización para editar (ventana de 10 min vencida). */
export const requestTarjaEdit = (id: number | string, reason: string) =>
  apiJson<{ id: number }>(`/tarja/${id}/edit-request`, 'POST', { reason });

export interface EditRequestRow {
  id: number;
  reason: string;
  status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'COMPLETADA';
  createdAt: string;
  requestedBy: { name: string; lastname: string; initials: string | null; username: string };
  report: {
    reportCode: string;
    vehicle: { vin: string } | null;
    operation: { code: string; ship: { name: string } } | null;
  };
}

export const listEditRequests = (status = 'PENDIENTE') =>
  apiGet<EditRequestRow[]>(`/tarja/edit-requests?status=${status}`);

export const resolveEditRequest = (id: number, approve: boolean, comment?: string) =>
  apiJson<{ id: number }>(`/tarja/edit-requests/${id}/resolve`, 'POST', { approve, comment });

export const cancelEditRequest = (id: number) =>
  apiJson<{ canceled: boolean }>(`/tarja/edit-requests/${id}/cancel`, 'POST');

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
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string;
  vehicle?: { vin: string };
  tarjador?: { username: string; initials: string | null };
  operation?: { code: string; shipName?: string };
}
export interface DashboardTrendPoint {
  day: string;
  tarjadas: number;
  enProceso: number;
  conDano: number;
  avgDurationSeconds: number;
}
export interface DashboardStats {
  tarjadas: number;
  enProceso: number;
  conDano: number;
  avgDurationSeconds: number;
  activeShips: number;
  trend: DashboardTrendPoint[];
}
export interface DashboardData {
  operations: (Operation & { _count?: { vehicles: number }; doneVehicles?: number })[];
  recent: ReportRow[];
  stats: DashboardStats;
}

export const getSupervisorDashboard = () => apiGet<DashboardData>('/dashboard/supervisor');
export const getProgress = (operationId: number | string) =>
  apiGet<ProgressData>(`/operations/${operationId}/progress`);
export const listReports = (operationId?: number) =>
  apiGet<ReportRow[]>(`/reports${operationId ? `?operationId=${operationId}` : ''}`);
export const annulReport = (reportId: number, reason: string, comment?: string) =>
  apiJson<ReportRow>(`/reports/${reportId}/annul`, 'POST', { reason, comment });
/** Reabre una tarja finalizada: la unidad vuelve al cuadro de tareas para re-tarjar. */
export const reopenReport = (reportId: number) =>
  apiJson<ReportRow>(`/reports/${reportId}/reopen`, 'POST');

/** Tarja ya registrada de un lote (operación), para la pantalla Reportes del Administrador. */
export interface OperationReportRow {
  id: number;
  reportCode: string;
  status: string;
  hasDamage: boolean;
  durationSeconds: number | null;
  finishedAt: string | null;
  vin: string | null;
  chassisNumber: string | null;
  brand: string | null;
  model: string | null;
  containerNumber: string | null;
  tarjador: string | null;
  initials: string | null;
}
export const listOperationReports = (operationId: number | string) =>
  apiGet<OperationReportRow[]>(`/operations/${operationId}/reports`);

export type WorkShift = 'DIA' | 'NOCHE';
export interface ShiftReportRow {
  reportCode: string;
  vin: string | null;
  container: string | null;
  brand: string | null;
  model: string | null;
  vessel: string | null;
  bl: string | null;
  tarjador: string | null;
  initials: string | null;
  hasDamage: boolean;
  durationSeconds: number | null;
}
export interface ShiftReport {
  date: string;
  shift: WorkShift;
  total: number;
  damaged: number;
  undamaged: number;
  avgSeconds: number | null;
  rows: ShiftReportRow[];
}
export const getShiftReport = (date: string, shift: WorkShift) =>
  apiGet<ShiftReport>(`/reports/shift?date=${encodeURIComponent(date)}&shift=${shift}`);

export interface AuditLog {
  id: number;
  userId: number | null;
  username: string | null;
  role: string | null;
  module: string;
  action: string;
  description: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}
export interface AuditQueryParams {
  module?: string;
  action?: string;
  userId?: number;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
export interface AuditPage {
  rows: AuditLog[];
  total: number;
}

function auditQs(params: AuditQueryParams): string {
  const qs = new URLSearchParams();
  if (params.module) qs.set('module', params.module);
  if (params.action) qs.set('action', params.action);
  if (params.userId != null) qs.set('userId', String(params.userId));
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  return qs.toString();
}

export const queryAuditLogs = (params: AuditQueryParams = {}, signal?: AbortSignal) => {
  const qs = auditQs(params);
  return apiGet<AuditPage>(`/audit${qs ? `?${qs}` : ''}`, signal);
};

/** Descarga la auditoría filtrada como CSV (Excel-friendly). */
export async function downloadAuditCsv(params: AuditQueryParams = {}): Promise<void> {
  const qs = auditQs({ ...params, limit: undefined, offset: undefined });
  const res = await fetch(`${API}/audit/export${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
    return;
  }
  if (!res.ok) throw new Error('No se pudo exportar la auditoría');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------------- monitoreo (avance en vivo del personal) ----------------
export interface MonitorInProgress {
  reportId: number;
  reportCode: string;
  vin: string | null;
  brand: string | null;
  model: string | null;
  startedAt: string | null;
  tarjadorId: number;
  tarjador: string;
  initials: string | null;
  operationCode: string | null;
  vessel: string | null;
}
export interface MonitorFinished extends MonitorInProgress {
  finishedAt: string | null;
  durationSeconds: number | null;
  status: string;
  hasDamage: boolean;
}
export interface MonitorTarjador {
  tarjadorId: number;
  tarjador: string;
  initials: string | null;
  inProgress: number;
  currentStartedAt: string | null;
  done: number;
  damaged: number;
  avgSeconds: number | null;
  fast: number;
  mid: number;
  slow: number;
}
export interface MonitorStats {
  date: string;
  shift: WorkShift;
  activeTarjadores: number;
  inProgressCount: number;
  finishedCount: number;
  damagedCount: number;
  avgSeconds: number | null;
  fast: number;
  mid: number;
  slow: number;
}
export interface MonitorLive {
  serverTime: string;
  inProgress: MonitorInProgress[];
  finished: MonitorFinished[];
  byTarjador: MonitorTarjador[];
  stats: MonitorStats;
}
export const getMonitoringLive = (signal?: AbortSignal) =>
  apiGet<MonitorLive>('/monitoring/live', signal);

async function openPdf(path: string, errorMsg: string): Promise<void> {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
    return;
  }
  if (!res.ok) throw new Error(errorMsg);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openReportPdf(reportId: number): Promise<void> {
  return openPdf(`/reports/${reportId}/pdf`, 'No se pudo generar el PDF');
}

/** Abre el PDF combinado de un lote (operación), opcionalmente filtrado por daños. */
export function openOperationPdf(operationId: number, damage?: '0' | '1'): Promise<void> {
  const qs = damage != null ? `?damage=${damage}` : '';
  return openPdf(`/operations/${operationId}/pdf${qs}`, 'No se pudo generar el PDF del lote');
}
