'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { login, saveSession } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username.trim(), password);
      saveSession(data);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#082C4D] to-[#0B3D6B] p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-8">
        <div className="flex flex-col items-center mb-6 text-center">
          <Image
            src="/cosco-logo.png"
            alt="COSCO SHIPPING Ports Chancay"
            width={180}
            height={108}
            priority
          />
          <h1 className="mt-4 text-lg font-semibold text-[#0B3D6B]">
            Sistema de Tarja Vehicular
          </h1>
          <p className="text-sm text-slate-500">Puerto de Chancay · CSPCP</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
              Usuario
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-[#0B3D6B] focus:ring-2 focus:ring-[#0B3D6B]/30"
              placeholder="admin"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-[#0B3D6B] focus:ring-2 focus:ring-[#0B3D6B]/30"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-[#C8102E] bg-red-50 rounded-md px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#0B3D6B] py-2.5 font-medium text-white transition-colors hover:bg-[#082C4D] disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </main>
  );
}
