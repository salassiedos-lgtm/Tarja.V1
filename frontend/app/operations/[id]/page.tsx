'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Shell from '@/components/shell';
import {
  getOperation,
  listVehicles,
  previewImport,
  confirmImport,
  getUser,
  type Operation,
  type Vehicle,
  type ImportPreview,
} from '@/lib/api';

function ImportPanel({ operationId, onDone }: { operationId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    if (!file) return;
    setError('');
    setMsg('');
    setBusy(true);
    try {
      setPreview(await previewImport(operationId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const r = await confirmImport(operationId, file);
      setMsg(
        `Importados ${r.newVehicles} vehículos (${r.existingVehicles} ya existentes, ` +
          `${r.conflictingVehicles} rechazados, ${r.invalidRows} inválidos, ` +
          `${r.rowsWithWarnings} con advertencias).`,
      );
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-medium text-slate-800">Importar Excel</h2>
      <p className="text-sm text-slate-500">
        Columnas: Nave, VIN, BL, Cantidad, Marca, Peso, Puerto embarque, Puerto descarga.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setMsg('');
          }}
          className="text-sm"
        />
        <button
          onClick={doPreview}
          disabled={!file || busy}
          className="rounded-lg border border-[#0B3D6B] px-3 py-1.5 text-sm text-[#0B3D6B] disabled:opacity-50"
        >
          Previsualizar
        </button>
        {preview && (
          <button
            onClick={doConfirm}
            disabled={busy || preview.validRows === 0}
            className="rounded-lg bg-[#0B3D6B] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Confirmar {preview.validRows} válidos
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-[#C8102E]">{error}</p>}
      {msg && <p className="mt-2 text-sm text-emerald-600">{msg}</p>}
      {preview && (
        <div className="mt-3 text-sm">
          <p className="text-slate-600">
            Total: {preview.totalRows} · Válidos:{' '}
            <span className="text-emerald-600">{preview.validRows}</span> · Inválidos:{' '}
            <span className="text-[#C8102E]">{preview.invalidRows}</span>
          </p>
          {preview.invalidRows > 0 && (
            <ul className="mt-2 list-inside list-disc text-[#C8102E]">
              {preview.rows
                .filter((r) => r.errors.length > 0)
                .slice(0, 10)
                .map((r) => (
                  <li key={r.rowNumber}>
                    Fila {r.rowNumber}: {r.errors.join(', ')}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function OperationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [op, setOp] = useState<Operation | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState('');
  const isAdmin = getUser()?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      const [o, v] = await Promise.all([getOperation(id), listVehicles(id)]);
      setOp(o);
      setVehicles(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell>
      {error && <p className="text-sm text-[#C8102E]">{error}</p>}
      {op && (
        <>
          <h1 className="text-2xl font-semibold text-slate-800">
            {op.code} — {op.shipName}
          </h1>
          <p className="mt-1 text-slate-500">
            Estado: {op.status} · Vehículos: {vehicles.length}
          </p>

          {isAdmin && <ImportPanel operationId={id} onDone={load} />}

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">VIN</th>
                  <th className="px-4 py-3">BL</th>
                  <th className="px-4 py-3">Marca</th>
                  <th className="px-4 py-3">Peso</th>
                  <th className="px-4 py-3">Cant.</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{v.vin}</td>
                    <td className="px-4 py-3">{v.billOfLading?.blNumber ?? '—'}</td>
                    <td className="px-4 py-3">{v.brand ?? '—'}</td>
                    <td className="px-4 py-3">{v.weight ?? '—'}</td>
                    <td className="px-4 py-3">{v.quantity}</td>
                    <td className="px-4 py-3">{v.status}</td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      Sin vehículos. Importa un Excel para cargarlos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
