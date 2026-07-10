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
      router.push('/inicio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="center">
        <Image
          src="/cosco-logo.png"
          alt="COSCO SHIPPING Ports Chancay"
          width={148}
          height={89}
          className="login-logo-img"
          priority
        />
        <p className="muted" style={{ marginBottom: 16 }}>
          Reporte de Estado de Unidades
        </p>
      </div>

      <form onSubmit={onSubmit} className="card">
        {error && <div className="error">{error}</div>}

        <label className="usr-label" htmlFor="username">
          Usuario
        </label>
        <input
          id="username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Ingrese usuario"
        />

        <label className="usr-label" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="Ingrese contraseña"
        />

        <button
          type="submit"
          className="btn"
          style={{ marginTop: 16 }}
          disabled={loading || !username || !password}
        >
          {loading ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>

      <div className="ver">v1.0.0</div>
    </div>
  );
}
