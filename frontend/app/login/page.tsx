'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { login, saveSession } from '@/lib/api';
import { Alert, Button, Label } from '@/components/ui';
import { IconArrow } from '@/components/icons';

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
      setLoading(false);
    }
  }

  return (
    <main className="deck grain relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <span className="deck-dots absolute inset-0" aria-hidden />

      {/* marca de agua tipográfica */}
      <span
        className="pointer-events-none absolute -bottom-16 -left-8 select-none font-display text-[200px] font-extrabold leading-none text-white/[0.03] sm:text-[300px]"
        aria-hidden
      >
        CSPCP
      </span>

      <div className="rise relative w-full max-w-sm">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_30px_80px_-24px_rgba(4,24,42,0.7)]">
          {/* franja superior de marca */}
          <span className="block h-1 bg-gradient-to-r from-navy-800 via-navy-600 to-cosco-500" />

          <div className="px-7 pb-7 pt-8">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/cosco-logo.png"
                alt="COSCO SHIPPING Ports Chancay"
                width={170}
                height={102}
                priority
              />
              <h1 className="mt-5 font-display text-[18px] font-extrabold tracking-tight text-navy-900">
                Sistema de Tarja Vehicular
              </h1>
              <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted">
                Puerto de Chancay · CSPCP
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <div>
                <Label htmlFor="username">Usuario</Label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="field"
                  placeholder="admin"
                />
              </div>

              <div>
                <Label htmlFor="password">Contraseña</Label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="field"
                  placeholder="••••••••"
                />
              </div>

              {error && <Alert>{error}</Alert>}

              <Button full size="lg" disabled={loading || !username || !password}>
                {loading ? (
                  'Ingresando…'
                ) : (
                  <>
                    Ingresar
                    <IconArrow className="h-[18px] w-[18px]" />
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
          COSCO Shipping Ports Chancay
        </p>
      </div>
    </main>
  );
}
