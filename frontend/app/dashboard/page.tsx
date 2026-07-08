'use client';

import Link from 'next/link';
import Shell from '@/components/shell';
import { getUser } from '@/lib/api';

function Card({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <p className="font-semibold text-[#0B3D6B]">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const user = getUser();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Shell>
      <h1 className="text-2xl font-semibold text-slate-800">Panel</h1>
      <p className="mt-1 text-slate-500">Bienvenido{user ? `, ${user.name}` : ''}.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {user?.role === 'TARJADOR' && (
          <Card
            href="/tarja"
            title="Nueva tarja"
            desc="Ingresar el VIN y registrar accesorios y daños de la unidad."
          />
        )}
        <Card
          href="/operations"
          title="Operaciones"
          desc="Crear operaciones, cargar el Excel de vehículos y ver el avance."
        />
        {isAdmin && (
          <Card
            href="/accessories"
            title="Accesorios"
            desc="Administrar el catálogo de accesorios del formulario de tarja."
          />
        )}
      </div>
    </Shell>
  );
}
