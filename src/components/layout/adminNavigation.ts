import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bot,
  Boxes,
  Building2,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  MessagesSquare,
  LineChart,
  LayoutDashboard,
  PackageSearch,
  Receipt,
  Settings2,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react';

export type AdminSection = 'Operación' | 'Gestión' | 'Análisis' | 'Sistema';

export interface AdminRouteMeta {
  path: string;
  title: string;
  shortTitle: string;
  description: string;
  section: AdminSection;
  icon: LucideIcon;
  aliases?: string[];
  access?: 'all' | 'admin' | 'superadmin';
  external?: boolean;
}

export interface AdminNavigationGroup {
  label: AdminSection;
  items: AdminRouteMeta[];
}

interface AdminNavigationAccess {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const navigationGroups: AdminNavigationGroup[] = [
  {
    label: 'Operación',
    items: [
      {
        path: '/admin',
        title: 'Dashboard',
        shortTitle: 'Inicio',
        description: 'Pulso de ventas, caja y pedidos del turno.',
        section: 'Operación',
        icon: LayoutDashboard,
        aliases: ['/'],
      },
      {
        path: '/pos',
        title: 'Punto de venta',
        shortTitle: 'POS',
        description: 'Arma el pedido, cobra y registra la venta.',
        section: 'Operación',
        icon: ChefHat,
      },
      {
        path: '/pedidos',
        title: 'Pedidos',
        shortTitle: 'Pedidos',
        description: 'Gestiona pedidos entrantes y conversaciones.',
        section: 'Operación',
        icon: ClipboardList,
        aliases: ['/whatsapp'],
      },
      {
        path: '/chats',
        title: 'Chats de la tienda',
        shortTitle: 'Chats',
        description: 'Responde a quien escribe desde la tienda web.',
        section: 'Operación',
        icon: MessagesSquare,
      },
      {
        path: '/domicilios',
        title: 'Domicilios',
        shortTitle: 'Domicilios',
        description: 'Sigue preparación, despacho y entrega.',
        section: 'Operación',
        icon: Truck,
      },
    ],
  },
  {
    label: 'Gestión',
    items: [
      {
        path: '/productos',
        title: 'Productos y combos',
        shortTitle: 'Productos',
        description: 'Administra catálogo, precios y disponibilidad.',
        section: 'Gestión',
        icon: ShoppingBag,
        access: 'admin',
      },
      {
        path: '/inventario',
        title: 'Inventario',
        shortTitle: 'Inventario',
        description: 'Controla existencias y alertas de reposición.',
        section: 'Gestión',
        icon: Boxes,
        access: 'admin',
      },
      {
        path: '/ventas',
        title: 'Ventas',
        shortTitle: 'Ventas',
        description: 'Consulta el historial y los medios de pago.',
        section: 'Gestión',
        icon: Receipt,
      },
      {
        path: '/gastos',
        title: 'Gastos',
        shortTitle: 'Gastos',
        description: 'Registra y revisa egresos operativos.',
        section: 'Gestión',
        icon: CircleDollarSign,
      },
    ],
  },
  {
    label: 'Análisis',
    items: [
      {
        path: '/reportes',
        title: 'Reportes',
        shortTitle: 'Reportes',
        description: 'Balance y composición del resultado.',
        section: 'Análisis',
        icon: BarChart3,
      },
      {
        path: '/analytics',
        title: 'Analytics',
        shortTitle: 'Analytics',
        description: 'Tendencias y señales de la operación.',
        section: 'Análisis',
        icon: LineChart,
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        path: '/bot',
        title: 'Automatización',
        shortTitle: 'Bot',
        description: 'Configura respuestas y comportamiento del bot.',
        section: 'Sistema',
        icon: Bot,
        access: 'admin',
      },
      {
        path: '/admin-settings',
        title: 'Configuración y equipo',
        shortTitle: 'Configuración',
        description: 'Gestiona negocio, accesos y operadores.',
        section: 'Sistema',
        icon: Settings2,
        access: 'admin',
      },
      {
        path: '/superadmin/negocios',
        title: 'Negocios',
        shortTitle: 'Negocios',
        description: 'Supervisa altas y estado de cada negocio.',
        section: 'Sistema',
        icon: Building2,
        access: 'superadmin',
      },
      {
        path: '/',
        title: 'Tienda virtual',
        shortTitle: 'Ver tienda',
        description: 'Abre la experiencia pública del negocio.',
        section: 'Sistema',
        icon: Store,
        external: true,
      },
    ],
  },
];

const mobileAdminPrimaryPaths = ['/admin', '/pos', '/pedidos', '/productos'];
const mobileCashierPrimaryPaths = ['/admin', '/pos', '/pedidos', '/domicilios'];

function canSeeItem(item: AdminRouteMeta, access: AdminNavigationAccess) {
  if (item.access === 'superadmin') return access.isSuperAdmin;
  if (item.access === 'admin') return access.isAdmin || access.isSuperAdmin;
  return true;
}

export function getVisibleAdminNavigation(
  access: AdminNavigationAccess
): AdminNavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeItem(item, access)),
    }))
    .filter((group) => group.items.length > 0);
}

export function getMobilePrimaryItems(access: AdminNavigationAccess): AdminRouteMeta[] {
  const items = navigationGroups.flatMap((group) => group.items);
  const primaryPaths = access.isAdmin || access.isSuperAdmin
    ? mobileAdminPrimaryPaths
    : mobileCashierPrimaryPaths;
  return primaryPaths
    .map((path) => items.find((item) => item.path === path))
    .filter((item): item is AdminRouteMeta => Boolean(item) && canSeeItem(item as AdminRouteMeta, access));
}

export function getAdminRouteMeta(pathname: string): AdminRouteMeta {
  const normalizedPath = pathname !== '/' && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  const match = navigationGroups
    .flatMap((group) => group.items)
    .find((item) => (
      item.path === normalizedPath
      || item.aliases?.includes(normalizedPath)
    ));

  return match ?? {
    path: '/admin',
    title: 'Panel administrativo',
    shortTitle: 'Panel',
    description: 'Gestiona la operación del negocio.',
    section: 'Operación',
    icon: PackageSearch,
  };
}

export function isAdminRouteActive(pathname: string, itemPath: string): boolean {
  const item = navigationGroups
    .flatMap((group) => group.items)
    .find((candidate) => candidate.path === itemPath);

  if (!item) return false;
  return pathname === item.path || Boolean(item.aliases?.includes(pathname));
}
