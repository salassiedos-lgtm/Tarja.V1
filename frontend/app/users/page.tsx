'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import {
  listUsers,
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
  getUser,
  type ManagedUser,
  type Role,
} from '@/lib/api';
import { IconClose, IconEdit, IconKey, IconPlus, IconSearch } from '@/components/icons';

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  TARJADOR: 'Tarjador',
};

function canManage(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'ADMIN') return true;
  return actorRole === 'SUPERVISOR' && targetRole === 'TARJADOR';
}

function assignableRoles(actorRole: Role): Role[] {
  return actorRole === 'ADMIN' ? ['ADMIN', 'SUPERVISOR', 'TARJADOR'] : ['TARJADOR'];
}

function UserModal({
  actorRole,
  editing,
  onClose,
  onSaved,
}: {
  actorRole: Role;
  editing?: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const roles = assignableRoles(actorRole);
  const [name, setName] = useState(editing?.name ?? '');
  const [lastname, setLastname] = useState(editing?.lastname ?? '');
  const [username, setUsername] = useState(editing?.username ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(editing?.role.name ?? roles[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valid = Boolean(
    name.trim() &&
      lastname.trim() &&
      username.trim().length >= 3 &&
      email.trim() &&
      (isEdit || password.length >= 8),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await updateUser(editing.id, {
          name: name.trim(),
          lastname: lastname.trim(),
          email: email.trim(),
          role,
        });
      } else {
        await createUser({
          name: name.trim(),
          lastname: lastname.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          role,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white shadow-[0_40px_80px_-20px_rgba(4,24,42,0.45)]"
      >
        <div className="relative flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy-800 via-cosco-500 to-transparent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14.5px] font-bold tracking-tight text-navy-900">
              {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
            <p className="text-[11px] text-muted">
              {isEdit ? 'Actualiza sus datos o su rol' : 'Se agrega con acceso inmediato al sistema'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-navy-900">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
                Nombre<span className="ml-0.5 text-cosco-500">*</span>
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
                Apellido<span className="ml-0.5 text-cosco-500">*</span>
              </label>
              <input
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Usuario<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <input
              value={username}
              disabled={isEdit}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ej. jperez"
              className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10 disabled:bg-canvas disabled:text-muted"
            />
            {isEdit && <p className="mt-1 text-[10.5px] text-muted">El usuario no se puede cambiar</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Email<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
                Contraseña<span className="ml-0.5 text-cosco-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Rol<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-xl border px-2 py-2.5 text-[12px] font-semibold transition-colors ${
                    role === r
                      ? 'border-navy-700 bg-navy-50 text-navy-900 ring-1 ring-navy-700/20'
                      : 'border-line text-muted hover:border-navy-200'
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[12.5px] font-medium text-cosco-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
          <p className="hidden text-[10.5px] text-muted sm:block">
            Campos con <span className="font-semibold text-cosco-500">*</span> son obligatorios
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-[12.5px] font-semibold text-muted hover:text-navy-900"
            >
              Cancelar
            </button>
            <button
              disabled={saving || !valid}
              className="rounded-lg bg-navy-800 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-navy-900 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: ManagedUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return;
    setError('');
    setSaving(true);
    try {
      await resetUserPassword(user.id, password);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-[0_40px_80px_-20px_rgba(4,24,42,0.45)]"
      >
        <div className="relative flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy-800 via-cosco-500 to-transparent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14.5px] font-bold tracking-tight text-navy-900">Restablecer contraseña</h2>
            <p className="truncate text-[11px] text-muted">{user.username}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-navy-900">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Nueva contraseña<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
            />
          </div>
          {error && <p className="text-[12.5px] font-medium text-cosco-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-[12.5px] font-semibold text-muted hover:text-navy-900"
          >
            Cancelar
          </button>
          <button
            disabled={saving || password.length < 8}
            className="rounded-lg bg-navy-800 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-navy-900 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Restablecer'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [items, setItems] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [resettingUser, setResettingUser] = useState<ManagedUser | null>(null);
  const me = getUser();
  const actorRole: Role = me?.role ?? 'TARJADOR';

  const load = useCallback(async () => {
    try {
      setItems(await listUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(u: ManagedUser) {
    const next = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
    try {
      await setUserStatus(u.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      load();
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.lastname.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <Shell onBack={() => router.push('/inicio')}>
      <section className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">Sistema</p>
          <h1 className="mt-2 font-display text-[28px] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[32px]">
            Usuarios
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-jade-600" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
            {items.filter((u) => u.status === 'ACTIVE').length} activos · {items.length} totales
          </span>
        </div>
      </section>

      <div className="rise mb-6 flex items-center gap-3">
        <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
          <IconSearch className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar usuario…"
            className="w-full text-[13px] outline-none"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-900"
        >
          <IconPlus className="h-4 w-4" />
          Agregar usuario
        </button>
      </div>

      {error && <p className="mb-4 text-[12.5px] font-medium text-cosco-600">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-muted">Cargando…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
          <p className="text-[13px] text-muted">
            {items.length === 0 ? 'Aún no hay usuarios registrados.' : 'Sin resultados para tu búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((u) => {
            const manageable = canManage(actorRole, u.role.name);
            const isSelf = me?.id === u.id;
            return (
              <div
                key={u.id}
                className="rounded-2xl border border-line bg-white px-4 py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy-900">
                      {u.name} {u.lastname}
                    </p>
                    <p className="mt-0.5 font-mono text-[12px] text-muted">{u.username}</p>
                    <p className="mt-0.5 break-all text-[12.5px] text-muted">{u.email}</p>
                  </div>
                  {manageable && !isSelf ? (
                    <button
                      onClick={() => toggleStatus(u)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset transition-colors ${
                        u.status === 'ACTIVE'
                          ? 'bg-jade-50 text-jade-600 ring-jade-600/15 hover:bg-jade-50/70'
                          : 'bg-canvas text-muted ring-line hover:bg-line/40'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                    </button>
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${
                        u.status === 'ACTIVE'
                          ? 'bg-jade-50 text-jade-600 ring-jade-600/15'
                          : 'bg-canvas text-muted ring-line'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5">
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-[10.5px] font-semibold text-muted ring-1 ring-inset ring-line">
                    {ROLE_LABEL[u.role.name]}
                  </span>
                  {manageable && !isSelf && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingUser(u)}
                        title="Editar"
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-navy-50 hover:text-navy-800"
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setResettingUser(u)}
                        title="Restablecer contraseña"
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-navy-50 hover:text-navy-800"
                      >
                        <IconKey className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && <UserModal actorRole={actorRole} onClose={() => setShowModal(false)} onSaved={load} />}
      {editingUser && (
        <UserModal
          actorRole={actorRole}
          editing={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={load}
        />
      )}
      {resettingUser && (
        <ResetPasswordModal user={resettingUser} onClose={() => setResettingUser(null)} onDone={load} />
      )}
    </Shell>
  );
}
