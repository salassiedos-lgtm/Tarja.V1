'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUser, clearSession, type AuthUser, type Role } from '@/lib/api';
import { CoscoMark } from '@/components/icons';
import {
  Bell,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Ship,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  TARJADOR: 'Tarjador',
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
};

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Operación',
    items: [
      { href: '/dashboard', label: 'Panel', icon: LayoutDashboard, roles: ['ADMIN', 'SUPERVISOR', 'TARJADOR'] },
      { href: '/operations', label: 'Operaciones', icon: Ship, roles: ['ADMIN', 'SUPERVISOR', 'TARJADOR'] },
      { href: '/tarja', label: 'Tarja', icon: ClipboardList, roles: ['TARJADOR'] },
      { href: '/supervisor', label: 'Supervisión', icon: Radar, roles: ['ADMIN', 'SUPERVISOR'] },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { href: '/users', label: 'Usuarios', icon: Users, roles: ['ADMIN', 'SUPERVISOR'] },
      { href: '/accessories', label: 'Accesorios', icon: Wrench, roles: ['ADMIN'] },
      { href: '/audit', label: 'Auditoría', icon: ShieldCheck, roles: ['ADMIN'] },
    ],
  },
];

const TITLES: Record<string, { title: string; crumb: string }> = {
  '/dashboard': { title: 'Panel de control', crumb: 'Resumen operativo' },
  '/operations': { title: 'Operaciones', crumb: 'Naves, BL y vehículos' },
  '/tarja': { title: 'Tarja', crumb: 'Registro en campo' },
  '/supervisor': { title: 'Supervisión', crumb: 'Monitoreo en tiempo real' },
  '/users': { title: 'Usuarios', crumb: 'Cuentas y roles' },
  '/accessories': { title: 'Accesorios', crumb: 'Catálogo del formulario' },
  '/audit': { title: 'Auditoría', crumb: 'Registro de acciones' },
};

const SIDEBAR_PREF_KEY = 'tarja:sidebar';

function initialsOf(u: AuthUser) {
  return (u.initials ?? `${u.name[0] ?? ''}${u.lastname?.[0] ?? ''}`).toUpperCase();
}

function NavLink({
  item,
  active,
  expanded,
  delay,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
  delay: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={expanded ? undefined : item.label}
      className={`rise group relative flex h-11 w-full items-center overflow-hidden rounded-[10px] text-[13.5px] font-medium transition-all duration-200 ${
        active
          ? 'bg-navy-700/[0.08] font-semibold text-navy-700'
          : 'text-ink/80 hover:translate-x-0.5 hover:bg-navy-50 hover:text-navy-700'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`absolute left-1 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-cosco-500 transition-all duration-300 ease-out ${
          active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0 group-hover:scale-y-100 group-hover:opacity-30'
        }`}
      />
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
        <Icon
          className={`h-[18px] w-[18px] transition-transform duration-200 ease-out group-hover:scale-110 ${
            active ? 'scale-105' : ''
          }`}
          strokeWidth={active ? 2.1 : 1.8}
        />
      </span>
      {expanded && <span className="flex-1 truncate text-left">{item.label}</span>}
    </Link>
  );
}

function SectionLabel({ label, show }: { label: string; show: boolean }) {
  if (!show) return <div className="h-3.5" />;
  return (
    <div className="flex h-7 items-center gap-2.5 px-3.5 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-navy-700">
      {label}
      <span className="h-px flex-1 bg-gradient-to-r from-navy-700/20 to-transparent" />
    </div>
  );
}

function UserFooter({ user, collapsed, expanded, onLogout }: {
  user: AuthUser;
  collapsed: boolean;
  expanded: boolean;
  onLogout: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-line p-2.5">
      <div
        className={`group/foot flex items-center overflow-hidden rounded-[14px] border transition-all duration-200 ${
          collapsed
            ? 'justify-center border-transparent'
            : 'border-line bg-gradient-to-br from-navy-50 to-white hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-10px_rgba(11,61,107,0.35)]'
        }`}
      >
        <div className="flex w-11 shrink-0 items-center justify-center py-1.5">
          <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-gradient-to-br from-navy-900 via-navy-700 to-navy-600 text-[12.5px] font-bold text-white shadow-[0_4px_14px_rgba(11,61,107,0.32)] transition-transform duration-200 group-hover/foot:scale-105">
            {initialsOf(user)}
          </div>
        </div>
        {expanded && (
          <>
            <div className="min-w-0 flex-1 py-1">
              <p className="truncate text-[12.5px] font-semibold text-navy-900">
                {user.name} {user.lastname}
              </p>
              <p className="mt-px flex items-center gap-1.5 text-[10px] text-muted">
                <span className="pulse-dot h-[5px] w-[5px] rounded-full bg-jade-600" />
                {ROLE_LABEL[user.role]}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Cerrar sesión"
              className="mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-all duration-150 hover:scale-105 hover:bg-cosco-500/10 hover:text-cosco-600 active:scale-95"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (window.localStorage.getItem(SIDEBAR_PREF_KEY) === 'col') setCollapsed(true);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = useCallback(() => {
    if (window.innerWidth < 1024) {
      setMobileOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(SIDEBAR_PREF_KEY, next ? 'col' : 'open');
      return next;
    });
  }, []);

  if (!user) return null;

  const meta =
    TITLES[pathname] ??
    TITLES[Object.keys(TITLES).find((k) => pathname.startsWith(k)) ?? ''] ??
    { title: 'Tarja Vehicular', crumb: 'CSPCP Chancay' };

  const logout = () => {
    clearSession();
    router.replace('/login');
  };

  const expanded = !collapsed;
  const sidebarW = collapsed ? '64px' : '264px';

  const sidebarInner = (mobile: boolean) => {
    const isExpanded = mobile ? true : expanded;
    let navIndex = 0;
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-2 border-b border-line px-3.5 py-4">
          <div className="rise flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 ring-1 ring-navy-900/10 transition-transform duration-200 hover:scale-105">
            <CoscoMark className="h-6 w-6 text-white" />
          </div>
          {isExpanded && (
            <div className="rise text-center leading-tight" style={{ animationDelay: '60ms' }}>
              <p className="text-[15px] font-bold tracking-tight text-navy-900">
                Tarja<span className="text-cosco-500">.</span>
              </p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted">
                CSPCP · Chancay
              </p>
            </div>
          )}
        </div>

        <nav className="thin-scroll flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
          {NAV.map((group) => {
            const items = group.items.filter((i) => i.roles.includes(user.role));
            if (!items.length) return null;
            return (
              <div key={group.section}>
                <SectionLabel label={group.section} show={isExpanded} />
                <div className="mb-1.5 space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const delay = 80 + navIndex * 45;
                    navIndex += 1;
                    return (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={active}
                        expanded={isExpanded}
                        delay={delay}
                        onClick={() => setMobileOpen(false)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <UserFooter user={user} collapsed={!isExpanded} expanded={isExpanded} onLogout={logout} />
      </>
    );
  };

  return (
    <div
      className="min-h-screen bg-canvas"
      style={{ ['--sidebar-w' as string]: sidebarW } as React.CSSProperties}
    >
      {/* sidebar fijo (desktop) */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-white shadow-[2px_0_12px_rgba(0,0,0,0.04)] transition-[width] duration-200 ease-out lg:flex"
        style={{ width: sidebarW }}
      >
        {sidebarInner(false)}
      </aside>

      {/* drawer (móvil) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="rise absolute inset-y-0 left-0 flex w-[264px] flex-col bg-white shadow-[4px_0_32px_rgba(4,28,60,0.2)]">
            {sidebarInner(true)}
          </div>
        </div>
      )}

      <div className="transition-[padding] duration-200 ease-out lg:pl-[var(--sidebar-w)]">
        {/* topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white px-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:px-5">
          <button
            type="button"
            onClick={toggle}
            aria-label="Alternar menú"
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] border border-line text-muted transition-all duration-150 hover:border-navy-700/25 hover:bg-navy-50 hover:text-navy-700 active:scale-90"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.8} />
            )}
          </button>

          <div className="hidden h-[22px] w-px bg-line sm:block" />

          <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-muted">
            <span className="hidden sm:inline">CSPCP</span>
            <ChevronRight className="hidden h-3 w-3 shrink-0 text-line sm:inline" />
            <span className="hidden sm:inline">Chancay</span>
            <ChevronRight className="h-3 w-3 shrink-0 text-line" />
            <span className="truncate font-semibold text-navy-900">{meta.title}</span>
          </nav>

          <div className="hidden items-center gap-1.5 rounded-full border border-jade-600/20 bg-jade-50 px-3 py-[5px] text-[11px] font-medium text-jade-600 md:flex">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-jade-600" />
            Sistema operativo
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="relative grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-line text-muted transition-all duration-150 hover:border-navy-700/25 hover:bg-navy-50 hover:text-navy-700 hover:scale-105 active:scale-90"
            >
              <Bell className="h-4 w-4" strokeWidth={1.8} />
              <span className="pulse-dot absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-cosco-500" />
            </button>
            <div className="hidden h-[22px] w-px bg-line sm:block" />
            <div className="hidden items-center gap-2.5 rounded-[10px] border border-line bg-white py-1 pl-1 pr-3 transition-all duration-200 hover:border-navy-200 hover:shadow-[0_4px_14px_-8px_rgba(11,61,107,0.35)] sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-800 font-mono text-[10px] font-semibold text-white">
                {initialsOf(user)}
              </div>
              <div className="leading-none">
                <p className="text-[12.5px] font-medium text-navy-900">{user.name}</p>
                <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                  {ROLE_LABEL[user.role]}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
