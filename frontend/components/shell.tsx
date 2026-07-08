'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUser, clearSession, type AuthUser } from '@/lib/api';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  TARJADOR: 'Tarjador',
};

export default function Shell({ children }: { children: React.ReactNode }) {
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0B3D6B] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold">
              Tarja Vehicular
            </Link>
            <nav className="hidden gap-4 text-sm text-white/85 sm:flex">
              <Link href="/operations" className="hover:text-white">
                Operaciones
              </Link>
              {user.role === 'TARJADOR' && (
                <Link href="/tarja" className="hover:text-white">
                  Tarja
                </Link>
              )}
              {user.role === 'ADMIN' && (
                <Link href="/accessories" className="hover:text-white">
                  Accesorios
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/90 sm:inline">
              {user.name} · {ROLE_LABEL[user.role] ?? user.role}
            </span>
            <button
              onClick={() => {
                clearSession();
                router.replace('/login');
              }}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
