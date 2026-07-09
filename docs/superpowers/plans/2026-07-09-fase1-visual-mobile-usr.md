# Fase 1 — Sistema visual + shell móvil estilo USR — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el sistema visual web de TARJA por el lenguaje mobile-first de MODULO USR (paleta azul, 640px, topbar+cards) y sustituir el sidebar por un shell móvil con grid de módulos como home.

**Architecture:** Se conservan todas las páginas y el backend. Se cambian (a) los tokens de color/tipografía en `globals.css`, (b) se añaden las clases de componentes de USR (`.card`, `.btn`, `.badge`, `.task`, `.mod`, `.tabs`, etc.) portadas de su `styles.css`, (c) se reescribe el interior de `components/shell.tsx` a un shell móvil (topbar azul sticky + contenido centrado a 640px), lo que cascada a las 8 páginas que ya usan `<Shell>`, y (d) se crea el home `/` con grid de módulos por rol.

**Tech Stack:** Next.js 14 (App Router) · Tailwind v4 (`@theme` en `globals.css`) · React 18 · lucide-react.

**Verificación:** Esta fase es visual; no aplica TDD unitario a CSS. Cada tarea se verifica con `npm run build` (typecheck/compilación) y arranque de `npm run dev` + inspección visual (captura). El backend no se toca.

---

### Task 1: Tokens de color y tipografía USR

**Files:**
- Modify: `frontend/app/globals.css:3-38` (bloque `@theme`)
- Modify: `frontend/app/layout.tsx:1-45`

- [ ] **Step 1: Reemplazar el bloque `@theme` de `globals.css`**

Sustituir las líneas 3–38 (el `@theme { ... }`) por:

```css
@theme {
  /* ---- tipografía USR: system-ui ---- */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ---- paleta MODULO USR ---- */
  --color-blue: #1565d8;
  --color-blue-dark: #0f4bab;
  --color-blue-50: #e8f0fd;
  --color-blue-100: #eef2f8;

  --color-bg: #f2f4f8;
  --color-card: #ffffff;
  --color-text: #1c2430;
  --color-muted: #6b7684;
  --color-line: #e2e6ec;

  --color-green: #1a9d5a;
  --color-green-50: #e4f6ec;
  --color-amber: #e08a00;
  --color-amber-50: #fff3df;
  --color-red: #d23b3b;
  --color-red-50: #fdecec;
  --color-track: #e7ebf1;

  --radius-card: 12px;
}
```

- [ ] **Step 2: Actualizar `layout.tsx` (fuentes system-ui + themeColor azul)**

Reemplazar el contenido completo de `frontend/app/layout.tsx` por:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MODULO USR · Tarja Vehicular CSPCP Chancay",
  description: "Reporte de Estado de Unidades — Puerto de Chancay (CSPCP)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1565d8",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verificar compilación**

Run: `cd frontend && npm run build`
Expected: build exitoso (sin errores de tipo). Advertencias de clases `navy-*`/`cosco-*` aún referenciadas en páginas son esperadas y se corrigen en tareas siguientes; NO deben romper el build (Tailwind ignora clases desconocidas).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/globals.css frontend/app/layout.tsx
git commit -m "feat(visual): tokens de color y tipografia estilo MODULO USR"
```

---

### Task 2: Clases de componentes USR en globals.css

**Files:**
- Modify: `frontend/app/globals.css` (añadir al final, tras el bloque existente)

- [ ] **Step 1: Añadir las clases de componentes de USR**

Añadir al final de `frontend/app/globals.css` (portadas de `styles.css` de MODULO USR, adaptadas a los tokens del Task 1):

```css
/* ===========================================================
   Componentes MODULO USR (mobile-first)
   =========================================================== */
@layer components {
  .app { max-width: 640px; margin: 0 auto; min-height: 100vh; background: var(--color-bg); }

  .topbar {
    background: var(--color-blue); color: #fff; padding: 14px 16px;
    display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 10;
  }
  .topbar h1 { font-size: 17px; margin: 0; font-weight: 600; flex: 1; }
  .topbar .sub { font-size: 12px; opacity: .85; }
  .iconbtn {
    background: rgba(255,255,255,.15); border: none; color: #fff;
    border-radius: 8px; padding: 8px 10px; cursor: pointer;
  }
  .content { padding: 16px; }

  .card {
    background: var(--color-card); border: 1px solid var(--color-line);
    border-radius: var(--radius-card); padding: 14px; margin-bottom: 12px;
  }
  .card h3 { margin: 0 0 8px; font-size: 15px; }

  .usr-label { display: block; font-size: 13px; color: var(--color-muted); margin: 10px 0 4px; }
  .input, .usr-select, .usr-textarea {
    width: 100%; padding: 11px 12px; border: 1px solid var(--color-line);
    border-radius: 10px; background: #fff; outline: none;
  }
  .input:focus, .usr-select:focus, .usr-textarea:focus { border-color: var(--color-blue); }
  .row { display: flex; gap: 10px; }
  .row > * { flex: 1; }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 13px; border: none; border-radius: 10px;
    background: var(--color-blue); color: #fff; font-weight: 600; cursor: pointer;
  }
  .btn:active { background: var(--color-blue-dark); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn.secondary { background: var(--color-blue-100); color: var(--color-blue-dark); }
  .btn.ghost { background: transparent; color: var(--color-blue); border: 1px solid var(--color-line); }
  .btn.small { width: auto; padding: 8px 12px; font-size: 13px; }

  .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
  .tab {
    flex: 1; text-align: center; padding: 10px; border-radius: 10px;
    background: var(--color-track); color: var(--color-muted); cursor: pointer; font-weight: 600; font-size: 14px;
  }
  .tab.active { background: var(--color-blue); color: #fff; }

  .searchrow { display: flex; gap: 8px; margin-bottom: 12px; }
  .searchrow .input { flex: 1; min-width: 0; }
  .scanbtn {
    flex: none; width: 46px; display: inline-flex; align-items: center; justify-content: center;
    background: #fff; color: var(--color-blue); border: 1px solid var(--color-line);
    border-radius: 10px; cursor: pointer;
  }
  .scanbtn:active { background: var(--color-blue-50); border-color: var(--color-blue); }

  .task {
    background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card);
    padding: 12px 14px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px;
  }
  .task .vin { font-weight: 700; font-family: var(--font-mono); font-size: 14px; }
  .task .meta { font-size: 12px; color: var(--color-muted); }
  .task .grow { flex: 1; min-width: 0; }

  .badge { font-size: 11px; padding: 3px 8px; border-radius: 20px; font-weight: 600; white-space: nowrap; }
  .badge.pending { background: var(--color-blue-100); color: var(--color-muted); }
  .badge.in_progress { background: var(--color-amber-50); color: var(--color-amber); }
  .badge.completed { background: var(--color-green-50); color: var(--color-green); }

  .bar { height: 6px; background: var(--color-track); border-radius: 20px; overflow: hidden; margin: 12px 0 10px; }
  .bar-fill { height: 100%; background: var(--color-green); border-radius: 20px; }

  .stat {
    background: #f7f9fc; border: 1px solid var(--color-line); border-radius: 10px;
    padding: 10px 6px; text-align: center; display: flex; flex-direction: column; gap: 2px;
  }
  .stat .n { font-size: 20px; font-weight: 700; line-height: 1.1; }
  .stat .l { font-size: 11px; color: var(--color-muted); }
  .stat.ok .n { color: var(--color-green); }
  .stat.warn .n { color: var(--color-amber); }

  .modgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .mod {
    display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
    background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card);
    padding: 16px 14px; cursor: pointer; color: var(--color-text); min-height: 132px;
  }
  .mod:active { border-color: var(--color-blue); }
  .mod-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; border-radius: 12px;
    background: var(--color-blue-50); color: var(--color-blue); margin-bottom: 6px;
  }
  .mod-title { font-weight: 600; font-size: 15px; line-height: 1.25; }
  .mod-desc { font-size: 12px; color: var(--color-muted); line-height: 1.3; }

  .chip { display: inline-block; background: var(--color-blue-100); color: var(--color-blue-dark); padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 6px; }
  .muted { color: var(--color-muted); font-size: 13px; }
  .center { text-align: center; }
  .empty { text-align: center; color: var(--color-muted); padding: 40px 20px; }
  .error { background: var(--color-red-50); color: var(--color-red); padding: 10px 12px; border-radius: 10px; font-size: 14px; margin-bottom: 12px; }
  .success { background: var(--color-green-50); color: var(--color-green); padding: 10px 12px; border-radius: 10px; font-size: 14px; margin-bottom: 12px; }
  .ver { text-align: center; color: var(--color-muted); font-size: 12px; margin-top: 10px; }
}
```

- [ ] **Step 2: Verificar compilación**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/globals.css
git commit -m "feat(visual): clases de componentes MODULO USR (card/btn/task/mod/badge)"
```

---

### Task 3: Shell móvil (reemplaza el sidebar)

**Files:**
- Modify: `frontend/components/shell.tsx` (reescritura completa)

- [ ] **Step 1: Reescribir `components/shell.tsx` como shell móvil USR**

Reemplazar el contenido completo de `frontend/components/shell.tsx` por:

```tsx
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
```

- [ ] **Step 2: Verificar compilación**

Run: `cd frontend && npm run build`
Expected: build exitoso. Las páginas que pasaban solo `children` a `<Shell>` siguen compilando (title/onBack son opcionales).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/shell.tsx
git commit -m "feat(visual): shell movil (topbar USR) en lugar del sidebar web"
```

---

### Task 4: Home con grid de módulos por rol

**Files:**
- Create: `frontend/app/inicio/page.tsx`
- Modify: `frontend/app/login/page.tsx` (redirigir a `/inicio` tras login — localizar el `router.replace`/`push` post-login y cambiar destino a `/inicio`)

- [ ] **Step 1: Crear el home con grid de módulos**

Crear `frontend/app/inicio/page.tsx`:

```tsx
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
```

- [ ] **Step 2: Redirigir el login a `/inicio`**

En `frontend/app/login/page.tsx`, localizar la navegación posterior al login exitoso (buscar `router.replace(` o `router.push(` con destino `'/dashboard'` o `'/'`) y cambiar el destino a `'/inicio'`.

Run para localizar: `cd frontend && grep -n "router\.\(replace\|push\)" app/login/page.tsx`
Aplicar el cambio de destino a `'/inicio'` en la línea encontrada.

- [ ] **Step 3: Verificar compilación**

Run: `cd frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación visual**

Run: `cd frontend && npm run dev` y abrir `http://localhost:3000/login`, iniciar sesión.
Expected: tras login se ve el grid de módulos (2 columnas, tarjetas `.mod`) con topbar azul "MODULO USR", nombre+rol y botón "Salir". El diseño es mobile-first centrado a 640px.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/inicio/page.tsx frontend/app/login/page.tsx
git commit -m "feat(visual): home con grid de modulos por rol (estilo USR)"
```

---

### Task 5: Restyle de la pantalla de login

**Files:**
- Modify: `frontend/app/login/page.tsx` (marcado del formulario a estilo USR)

- [ ] **Step 1: Revisar el login actual**

Run: `cd frontend && cat app/login/page.tsx`
Identificar el JSX del formulario (contenedor, inputs de usuario/contraseña, botón, mensaje de error) sin tocar la lógica de autenticación (`login()`, estado, handlers).

- [ ] **Step 2: Aplicar clases USR al marcado del login**

Envolver el formulario en `<div className="login-wrap">`; usar `<input className="input">` para usuario y contraseña, `<button className="btn">` para "Iniciar sesión", `<div className="error">` para el mensaje de error, y `<div className="ver">v1.0.0</div>` al pie. Añadir las clases `.login-wrap` y `.login-logo-img` a `globals.css` (bloque `@layer components`):

```css
  .login-wrap { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 24px; max-width: 420px; margin: 0 auto; }
  .login-logo-img { display: block; width: 148px; height: auto; margin: 0 auto 10px; }
```

Conservar el logo COSCO existente (componente `CoscoMark` o imagen) centrado sobre el título "Reporte de Estado de Unidades".

- [ ] **Step 3: Verificar compilación y visual**

Run: `cd frontend && npm run build`
Expected: build exitoso.
Run: `npm run dev` → `http://localhost:3000/login`
Expected: login centrado, azul, con input/contraseña estilo USR, botón azul ancho y "v1.0.0" al pie.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/login/page.tsx frontend/app/globals.css
git commit -m "feat(visual): login estilo MODULO USR"
```

---

## Self-Review (cobertura del spec, Fase 1)

- **Sistema visual (tokens):** Task 1 ✔
- **Clases de componentes USR:** Task 2 ✔
- **Shell móvil (reemplaza sidebar):** Task 3 ✔
- **Home = grid de módulos por rol:** Task 4 ✔
- **Login estilo USR:** Task 5 ✔

**Fuera de esta fase (próximos planes):** restyle de dashboard/operaciones/supervisión/tarja/usuarios/accesorios/auditoría al nuevo shell (cada pantalla usa `<Shell>` y ya hereda topbar+tokens, pero su contenido interno se migrará a `.card`/`.task`/`.tabs` en la Fase 1.b o al inicio de cada fase funcional); escáner (Fase 2); turno (Fase 3); lotes + ventana 10 min (Fase 4); tablero por B/L (Fase 5).

**Nota de dependencia:** tras Task 3, las 8 páginas que usan `<Shell>` cambian a topbar móvil automáticamente. Su contenido interno seguirá con clases `navy-*`/utilidades Tailwind hasta que se restylee; Tailwind mantiene esas utilidades funcionando (los tokens `navy-*` ya no existen, por lo que esos colores caerán a valores por defecto/none). Para evitar una apariencia rota transitoria, la Fase 1.b (o el primer paso de cada fase funcional) restylea el contenido de cada página al entrar a trabajarla. Si se requiere que TODO se vea coherente de inmediato, añadir un plan Fase 1.b que recorra las 7 páginas restantes.
