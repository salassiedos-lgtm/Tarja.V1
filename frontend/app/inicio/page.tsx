'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { getUser, type AuthUser, type Role } from '@/lib/api';
import { CalendarClock, ClipboardList, Fingerprint, Gauge, ShieldCheck, Users } from 'lucide-react';

type Mod = { key: string; title: string; desc: string; to: string; icon: React.ReactNode; roles: Role[] };

const MODS: Mod[] = [
  { key: 'bls', title: 'Cuadro de Tareas', desc: 'Avance de tarja por nave', to: '/tablero', icon: <ClipboardList className="h-5 w-5" />, roles: ['ADMIN', 'SUPERVISOR', 'TARJADOR'] },
  { key: 'monitoreo', title: 'Monitoreo', desc: 'Avance del personal en vivo con semáforo', to: '/monitoreo', icon: <Gauge className="h-5 w-5" />, roles: ['ADMIN', 'SUPERVISOR'] },
  { key: 'turno', title: 'Avance por turno', desc: 'Reporte de tarja por turno (imprimible)', to: '/reportes/turno', icon: <CalendarClock className="h-5 w-5" />, roles: ['ADMIN', 'SUPERVISOR'] },
  { key: 'admin', title: 'Administrador', desc: 'Lotes, avance e impresión de reportes', to: '/admin', icon: <ShieldCheck className="h-5 w-5" />, roles: ['ADMIN'] },
  { key: 'users', title: 'Usuarios', desc: 'Altas, roles y accesos', to: '/users', icon: <Users className="h-5 w-5" />, roles: ['ADMIN', 'SUPERVISOR'] },
  { key: 'audit', title: 'Auditoría', desc: 'Bitácora de accesos, tarjas y cambios', to: '/audit', icon: <Fingerprint className="h-5 w-5" />, roles: ['ADMIN'] },
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
