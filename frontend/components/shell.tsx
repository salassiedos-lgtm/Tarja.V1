'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, clearSession, type AuthUser, type Role } from '@/lib/api';
import { ArrowLeft } from 'lucide-react';

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  TARJADOR: 'Tallyman',
};

export default function Shell({
  children,
  title,
  onBack,
}: {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
}) {
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

  const logout = () => {
    clearSession();
    router.replace('/login');
  };

  return (
    <div className="app">
      <div className="topbar">
        {onBack ? (
          <button className="iconbtn" onClick={onBack} aria-label="Atrás">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : null}
        <h1>
          {title ?? 'MODULO USR'}
          <span className="sub block">
            {user.name} {user.lastname} · {ROLE_LABEL[user.role]}
          </span>
        </h1>
        <button className="iconbtn" onClick={logout}>
          Salir
        </button>
      </div>
      <div className="content">{children}</div>
    </div>
  );
}
