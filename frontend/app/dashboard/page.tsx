'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, clearSession, type AuthUser } from '@/lib/api';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  TARJADOR: 'Tarjador',
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) return null;

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0B3D6B] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <p className="font-semibold leading-tight">Tarja Vehicular</p>
            <p className="text-xs text-white/70">Puerto de Chancay · CSPCP</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/90 sm:inline">
              {user.name} · {ROLE_LABEL[user.role] ?? user.role}
            </span>
            <button
              onClick={logout}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-slate-800">Bienvenido, {user.name}</h1>
        <p className="mt-1 text-slate-500">Rol: {ROLE_LABEL[user.role] ?? user.role}</p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-600">
            La base del sistema está lista (autenticación y roles). Los módulos de operaciones,
            importación de Excel, tarja, supervisión y reportes se habilitarán en las siguientes
            fases.
          </p>
        </div>
      </main>
    </div>
  );
}
