import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { NegocioProvider, useNegocio } from '@/context/NegocioContext';
import { AdminShell } from '@/components/layout/AdminShell';
import { LoginPage } from '@/pages/LoginPage';
import { RegistroNegocioPage } from '@/pages/RegistroNegocioPage';
import { canAccessAdmin } from '@/security/adminAuthorization';
import { auth } from '@/services/firebase';

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const POSPage = lazy(() => import('@/pages/POSPage').then((module) => ({ default: module.POSPage })));
const ProductosPage = lazy(() => import('@/pages/ProductosPage').then((module) => ({ default: module.ProductosPage })));
const InventarioPage = lazy(() => import('@/pages/InventarioPage').then((module) => ({ default: module.InventarioPage })));
const DomiciliosPage = lazy(() => import('@/pages/DomiciliosPage').then((module) => ({ default: module.DomiciliosPage })));
const VentasPage = lazy(() => import('@/pages/VentasPage').then((module) => ({ default: module.VentasPage })));
const GastosPage = lazy(() => import('@/pages/GastosPage').then((module) => ({ default: module.GastosPage })));
const ReportesPage = lazy(() => import('@/pages/ReportesPage').then((module) => ({ default: module.ReportesPage })));
const BotConfigPage = lazy(() => import('@/pages/BotConfigPage').then((module) => ({ default: module.BotConfigPage })));
const AdminSettingsPage = lazy(() => import('@/pages/AdminSettingsPage').then((module) => ({ default: module.AdminSettingsPage })));
const WhatsAppPage = lazy(() => import('@/pages/WhatsAppPage').then((module) => ({ default: module.WhatsAppPage })));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const SuperAdminNegociosPage = lazy(() => import('@/pages/SuperAdminNegociosPage').then((module) => ({ default: module.SuperAdminNegociosPage })));

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-base-dark flex items-center justify-center" role="status">
      <div className="animate-spin h-8 w-8 border-4 border-gold-400 border-t-transparent rounded-full" />
      <span className="sr-only">Cargando...</span>
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading: authLoading } = useAuth();
  const {
    cargandoNegocio,
    identidadResueltaUid,
    estadoAprobacion,
    esSuperAdmin,
    usuarioNegocio,
  } = useNegocio();

  if (
    authLoading
    || cargandoNegocio
    || (!user && Boolean(auth?.currentUser))
    || (Boolean(user) && identidadResueltaUid !== user?.uid)
  ) {
    return <LoadingSpinner />;
  }

  if (
    !canAccessAdmin({
      isAuthenticated: Boolean(user),
      isSuperAdmin: esSuperAdmin,
      profile: usuarioNegocio,
    })
  ) {
    return <Navigate to="/login" replace />;
  }

  if (!esSuperAdmin && estadoAprobacion !== 'activo') {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = esSuperAdmin || usuarioNegocio?.rol === 'admin';

  return (
    <AdminShell>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/pos" element={<POSPage />} />
            <Route path="/productos" element={isAdmin ? <ProductosPage /> : <Navigate to="/admin" replace />} />
            <Route path="/ventas" element={<VentasPage />} />
            <Route path="/inventario" element={isAdmin ? <InventarioPage /> : <Navigate to="/admin" replace />} />
            <Route path="/gastos" element={<GastosPage />} />
            <Route path="/domicilios" element={<DomiciliosPage />} />
            <Route path="/pedidos" element={<WhatsAppPage />} />
            <Route path="/whatsapp" element={<WhatsAppPage />} />
            <Route path="/reportes" element={<ReportesPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/bot" element={isAdmin ? <BotConfigPage /> : <Navigate to="/admin" replace />} />
            <Route
              path="/admin-settings"
              element={
                isAdmin
                  ? <AdminSettingsPage />
                  : <Navigate to="/admin" replace />
              }
            />
            <Route
              path="/superadmin/negocios"
              element={esSuperAdmin ? <SuperAdminNegociosPage /> : <Navigate to="/admin" replace />}
            />
            <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </AdminShell>
  );
}

function ProtectedRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro-negocio" element={<RegistroNegocioPage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}

export default function ProtectedApp() {
  return (
    <AuthProvider>
      <NegocioProvider>
        <ProtectedRouter />
      </NegocioProvider>
    </AuthProvider>
  );
}
