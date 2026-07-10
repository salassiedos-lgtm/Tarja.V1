'use client';

import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { IconPanel, IconClipboard } from '@/components/icons';

const MODULES = [
  {
    key: 'dashboard',
    title: 'Dashboard',
    desc: 'Avance de tarja por nave',
    icon: <IconPanel className="h-5 w-5" />,
    to: '/admin/dashboard',
  },
  {
    key: 'tareas',
    title: 'Tareas',
    desc: 'Aperturar, cerrar, importar y eliminar lotes',
    icon: <IconClipboard className="h-5 w-5" />,
    to: '/admin/tareas',
  },
];

export default function AdminHome() {
  const router = useRouter();
  return (
    <Shell title="Administrador" onBack={() => router.push('/inicio')}>
      <div className="modgrid">
        {MODULES.map((m) => (
          <button className="mod tap" key={m.key} onClick={() => router.push(m.to)}>
            <span className="mod-icon">{m.icon}</span>
            <span className="mod-title">{m.title}</span>
            <span className="mod-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}
