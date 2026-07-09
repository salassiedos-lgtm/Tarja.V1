'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { getUser, type AuthUser, type Role } from '@/lib/api';
import { ClipboardList, ShieldCheck, Users } from 'lucide-react';

type Mod = { key: string; title: string; desc: string; to: string; icon: React.ReactNode; roles: Role[] };

const MODS: Mod[] = [
  { key: 'bls', title: 'Cuadro de Tareas', desc: 'Avance de tarja por B/L', to: '/tarja', icon: <ClipboardList className="h-5 w-5" />, roles: ['ADMIN', 'SUPERVISOR', 'TARJADOR'] },
  { key: 'admin', title: 'Administrador', desc: 'Lotes, avance e impresión de reportes', to: '/operations', icon: <ShieldCheck className="h-5 w-5" />, roles: ['ADMIN'] },
  { key: 'users', title: 'Usuarios', desc: 'Altas, roles y accesos', to: '/users', icon: <Users className="h-5 w-5" />, roles: ['ADMIN', 'SUPERVISOR'] },
];

export default function Inicio() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  if (!user) return null;
  const mods = MODS.filter((m) => m.roles.includes(user.role));

  return (
    <Shell>
      <div className="modgrid">
        {mods.map((m) => (
          <button key={m.key} className="mod tap" onClick={() => router.push(m.to)}>
            <span className="mod-icon">{m.icon}</span>
            <span className="mod-title">{m.title}</span>
            <span className="mod-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}
