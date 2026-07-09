'use client';

import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/shell';
import {
  listAccessories,
  createAccessory,
  updateAccessory,
  deleteAccessory,
  getUser,
  type Accessory,
} from '@/lib/api';
import {
  IconClipboard,
  IconClose,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@/components/icons';
import { accessoryIcon } from '@/lib/accessory-icons';

type AccessoryType = 'BASE' | 'ADICIONAL';

// Puente temporal: el backend aún no tiene un campo "tipo" en Accessory,
// así que la clasificación Base/Adicional vive en localStorage hasta que se migre.
const TYPE_STORE_KEY = 'tarja:accessoryType:v1';

function readTypeMap(): Record<number, AccessoryType> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(TYPE_STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeType(id: number, type: AccessoryType) {
  const map = readTypeMap();
  map[id] = type;
  window.localStorage.setItem(TYPE_STORE_KEY, JSON.stringify(map));
}

function AccessoryModal({
  editing,
  onClose,
  onCreated,
}: {
  editing?: { accessory: Accessory; type: AccessoryType };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(editing?.accessory.name ?? '');
  const [type, setType] = useState<AccessoryType>(editing?.type ?? 'BASE');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await updateAccessory(editing.accessory.id, { name: name.trim() });
        writeType(editing.accessory.id, type);
      } else {
        const created = await createAccessory(name.trim());
        writeType(created.id, type);
      }
      onCreated();
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
        className="w-full max-w-[440px] overflow-hidden rounded-2xl bg-white shadow-[0_40px_80px_-20px_rgba(4,24,42,0.45)]"
      >
        <div className="relative flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy-800 via-cosco-500 to-transparent" />
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
            {createElement(accessoryIcon(name || ''), { className: 'h-5 w-5' })}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14.5px] font-bold tracking-tight text-navy-900">
              {isEdit ? 'Editar accesorio' : 'Nuevo accesorio'}
            </h2>
            <p className="text-[11px] text-muted">
              {isEdit ? 'Actualiza el nombre o su clasificación' : 'Se agrega al catálogo del formulario de tarja'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-navy-900">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Nombre del accesorio<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Chaleco, Radio…"
              className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Tipo de accesorio<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('BASE')}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                  type === 'BASE'
                    ? 'border-navy-700 bg-navy-50 ring-1 ring-navy-700/20'
                    : 'border-line hover:border-navy-200'
                }`}
              >
                <IconClipboard className={`h-4 w-4 ${type === 'BASE' ? 'text-navy-800' : 'text-muted'}`} />
                <span className="text-[12.5px] font-semibold text-navy-900">Accesorio base</span>
                <span className="text-[10.5px] leading-snug text-muted">
                  Aparece como campo fijo del formulario de tarja
                </span>
              </button>
              <button
                type="button"
                onClick={() => setType('ADICIONAL')}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                  type === 'ADICIONAL'
                    ? 'border-cosco-500 bg-cosco-500/5 ring-1 ring-cosco-500/20'
                    : 'border-line hover:border-navy-200'
                }`}
              >
                <IconPlus className={`h-4 w-4 ${type === 'ADICIONAL' ? 'text-cosco-600' : 'text-muted'}`} />
                <span className="text-[12.5px] font-semibold text-navy-900">Accesorio adicional</span>
                <span className="text-[10.5px] leading-snug text-muted">
                  Al seleccionarlo se agrega a comentarios adicionales
                </span>
              </button>
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
              disabled={saving || !name.trim()}
              className="rounded-lg bg-navy-800 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-navy-900 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear accesorio'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AccessoryGroup({
  title,
  subtitle,
  accent,
  items,
  isAdmin,
  onToggle,
  onEdit,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
}: {
  title: string;
  subtitle: string;
  accent: 'navy' | 'cosco';
  items: Accessory[];
  isAdmin: boolean;
  onToggle: (a: Accessory) => void;
  onEdit: (a: Accessory) => void;
  onDelete: (a: Accessory) => void;
  confirmDeleteId: number | null;
  setConfirmDeleteId: (id: number | null) => void;
}) {
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">
          {title} <span className="text-navy-900">· {items.length}</span>
        </h2>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] text-muted">{subtitle}</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-6 text-center">
          <p className="text-[12.5px] text-muted">Sin accesorios en este grupo.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a, i) => (
            <div
              key={a.id}
              className={`rise group relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_rgba(11,61,107,0.28)] ${
                a.isActive ? 'border-line hover:border-navy-200' : 'border-line/70 opacity-60'
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span
                className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${
                  accent === 'cosco' ? 'via-cosco-500/30' : 'via-navy-600/25'
                }`}
              />
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                  a.isActive
                    ? accent === 'cosco'
                      ? 'bg-cosco-500/8 text-cosco-600 ring-cosco-600/15'
                      : 'bg-navy-50 text-navy-800 ring-navy-100'
                    : 'bg-canvas text-muted ring-line'
                }`}
              >
                {createElement(accessoryIcon(a.name), { className: 'h-5 w-5' })}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[13.5px] font-semibold tracking-tight ${
                    a.isActive ? 'text-navy-900' : 'text-muted line-through'
                  }`}
                >
                  {a.name}
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
                  Orden {String(a.sortOrder).padStart(2, '0')}
                </p>
              </div>

              {isAdmin ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onToggle(a)}
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset transition-colors ${
                      a.isActive
                        ? 'bg-jade-50 text-jade-600 ring-jade-600/15 hover:bg-jade-50/70'
                        : 'bg-canvas text-muted ring-line hover:bg-line/40'
                    }`}
                  >
                    {a.isActive ? 'Activo' : 'Inactivo'}
                  </button>
                  <button
                    onClick={() => onEdit(a)}
                    title="Editar"
                    className="rounded-lg p-1.5 text-muted opacity-0 transition-opacity hover:bg-navy-50 hover:text-navy-800 group-hover:opacity-100"
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(a.id)}
                    title="Eliminar"
                    className="rounded-lg p-1.5 text-muted opacity-0 transition-opacity hover:bg-cosco-500/10 hover:text-cosco-600 group-hover:opacity-100"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${
                    a.isActive
                      ? 'bg-jade-50 text-jade-600 ring-jade-600/15'
                      : 'bg-canvas text-muted ring-line'
                  }`}
                >
                  {a.isActive ? 'Activo' : 'Inactivo'}
                </span>
              )}

              {confirmDeleteId === a.id && (
                <div
                  className="absolute inset-0 flex items-center justify-between gap-2 bg-white/97 px-4 backdrop-blur-[1px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[12px] font-medium text-navy-900">¿Eliminar “{a.name}”?</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:text-navy-900"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => onDelete(a)}
                      className="rounded-lg bg-cosco-500 px-2.5 py-1.5 text-[11.5px] font-semibold text-white hover:bg-cosco-600"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function AccessoriesPage() {
  const [items, setItems] = useState<Accessory[]>([]);
  const [types, setTypes] = useState<Record<number, AccessoryType>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAccessory, setEditingAccessory] = useState<Accessory | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const isAdmin = getUser()?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      setItems(await listAccessories());
      setTypes(readTypeMap());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(a: Accessory) {
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, isActive: !x.isActive } : x)));
    try {
      await updateAccessory(a.id, { isActive: !a.isActive });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      load();
    }
  }

  async function remove(a: Accessory) {
    setError('');
    try {
      await deleteAccessory(a.id);
      setConfirmDeleteId(null);
      load();
    } catch (err) {
      setConfirmDeleteId(null);
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((a) => a.name.toLowerCase().includes(q)) : items;
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, query]);

  const baseItems = filtered.filter((a) => (types[a.id] ?? 'BASE') === 'BASE');
  const additionalItems = filtered.filter((a) => types[a.id] === 'ADICIONAL');
  const activeCount = items.filter((a) => a.isActive).length;

  return (
    <Shell>
      <section className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">
            Formulario de tarja
          </p>
          <h1 className="mt-2 font-display text-[28px] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[32px]">
            Catálogo de accesorios
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-jade-600" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
            {activeCount} activos · {items.length} totales
          </span>
        </div>
      </section>

      <div className="rise mb-6 flex items-center gap-3">
        <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
          <IconSearch className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar accesorio…"
            className="w-full text-[13px] outline-none"
          />
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-900"
          >
            <IconPlus className="h-4 w-4" />
            Agregar accesorio
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-[12.5px] font-medium text-cosco-600">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-muted">Cargando…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
          <p className="text-[13px] text-muted">
            {items.length === 0 ? 'Aún no hay accesorios registrados.' : 'Sin resultados para tu búsqueda.'}
          </p>
        </div>
      ) : (
        <>
          <AccessoryGroup
            title="Accesorios base"
            subtitle="Campos fijos del formulario de tarja"
            accent="navy"
            items={baseItems}
            isAdmin={isAdmin}
            onToggle={toggle}
            onEdit={setEditingAccessory}
            onDelete={remove}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
          />
          <AccessoryGroup
            title="Accesorios adicionales"
            subtitle="Se agregan a comentarios adicionales"
            accent="cosco"
            items={additionalItems}
            isAdmin={isAdmin}
            onToggle={toggle}
            onEdit={setEditingAccessory}
            onDelete={remove}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
          />
        </>
      )}

      {showModal && <AccessoryModal onClose={() => setShowModal(false)} onCreated={load} />}
      {editingAccessory && (
        <AccessoryModal
          editing={{ accessory: editingAccessory, type: types[editingAccessory.id] ?? 'BASE' }}
          onClose={() => setEditingAccessory(null)}
          onCreated={load}
        />
      )}
    </Shell>
  );
}
