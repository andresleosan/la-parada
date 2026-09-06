import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Store, UserRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNegocio } from '@/context/NegocioContext';
import { useHoraActual } from '@/hooks/useHoraActual';
import { formatHora } from '@/utils/dateUtils';
import { BottomNav } from './BottomNav';
import {
  getAdminRouteMeta,
  getVisibleAdminNavigation,
  isAdminRouteActive,
} from './adminNavigation';

interface AdminShellProps {
  children: ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const ahora = useHoraActual();
  const { negocioActual, esSuperAdmin, usuarioNegocio } = useNegocio();
  const routeMeta = getAdminRouteMeta(location.pathname);
  const navigation = getVisibleAdminNavigation({
    isAdmin: usuarioNegocio?.rol === 'admin',
    isSuperAdmin: esSuperAdmin,
  });
  const logoSrc = negocioActual?.logoUrl || '/logo-96.jpg';
  const businessName = negocioActual?.nombre || 'La Parada';
  const roleLabel = esSuperAdmin
    ? 'Superadministrador'
    : usuarioNegocio?.rol === 'admin'
      ? 'Administrador'
      : 'Caja';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div data-admin-shell className="min-h-[100dvh] bg-[#f4f1e8] text-[#201f1b]">
      <a
        href="#admin-main"
        className="fixed left-3 top-3 z-[80] -translate-y-24 rounded-lg bg-[#201f1b] px-4 py-2 text-sm font-bold text-white transition-transform focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r border-white/10 bg-[#171713] text-white lg:flex">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
          <img
            src={logoSrc}
            alt=""
            className="h-11 w-11 rounded-xl border border-[#c9a84c]/40 object-cover"
            onError={(event) => {
              event.currentTarget.src = '/logo-96.jpg';
            }}
          />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-black uppercase tracking-[0.08em] text-[#e2c766]">
              {businessName}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/[0.7]">
              Centro operativo
            </p>
          </div>
        </div>

        <nav aria-label="Navegación administrativa" className="admin-sidebar-nav flex-1 overflow-y-auto px-3 py-5">
          {navigation.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/[0.62]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.filter((item) => !item.external).map((item) => {
                  const Icon = item.icon;
                  const isActive = !item.external
                    && isAdminRouteActive(location.pathname, item.path);

                  return (
                    <Link
                      key={`${group.label}-${item.path}`}
                      to={item.path}
                      aria-current={isActive ? 'page' : undefined}
                      className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-[#c9a84c] text-[#171713] shadow-[0_8px_24px_rgba(201,168,76,0.18)]'
                          : 'text-white/[0.78] hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.shortTitle}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            to="/"
            className="mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/[0.78] hover:bg-white/[0.07] hover:text-white"
          >
            <Store className="h-[18px] w-[18px]" aria-hidden="true" />
            Ver tienda
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/[0.72] hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-h-[100dvh] flex-col lg:pl-64">
        <header className="sticky top-0 z-40 border-b border-[#d9d3c7] bg-[#fffdf8]/[0.94] backdrop-blur-xl">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:min-h-20 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={logoSrc}
                alt=""
                className="h-9 w-9 rounded-lg border border-[#c9a84c]/35 object-cover lg:hidden"
                onError={(event) => {
                  event.currentTarget.src = '/logo-96.jpg';
                }}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#756f63]">
                  <span>{routeMeta.section}</span>
                  <span aria-hidden="true">/</span>
                  <span className="truncate text-[#8a6d1d]">{businessName}</span>
                </div>
                <div className="flex min-w-0 items-baseline gap-3">
                  <p className="truncate font-display text-lg font-black text-[#201f1b] sm:text-xl lg:text-2xl">
                    {routeMeta.title}
                  </p>
                  <p className="hidden truncate text-sm text-[#756f63] xl:block">
                    {routeMeta.description}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-[#ddd7ca] bg-white px-3 py-2 text-xs font-bold text-[#5f5a50] sm:flex">
                <span className="h-2 w-2 rounded-full bg-[#168a5b]" aria-hidden="true" />
                <time dateTime={ahora.toISOString()}>{formatHora(ahora)}</time>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#201f1b] text-white sm:w-auto sm:gap-2 sm:px-3">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                <span className="hidden text-xs font-bold sm:inline">{roleLabel}</span>
              </div>
            </div>
          </div>
        </header>

        <main id="admin-main" className="admin-workspace min-w-0 flex-1">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
