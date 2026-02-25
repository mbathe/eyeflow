import { Outlet, Navigate, Link } from 'react-router-dom';
import { MailWarning, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useIsAuthenticated, useUser } from '@/store/auth.store';
import { useRealtimeStore } from '@/store/realtime.store';
import { ToastNotifications } from '@/components/NotificationPanel';

export function AppLayout() {
  const isAuthenticated = useIsAuthenticated();
  const user = useUser();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { connect, disconnect } = useRealtimeStore();

  // Start WebSocket connection when the app layout mounts (user is logged in)
  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const showEmailBanner = user && !user.emailVerified && !bannerDismissed;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />

        {/* Email verification banner */}
        {showEmailBanner && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-warning/10 border-b border-warning/30 text-sm">
            <div className="flex items-center gap-2 text-warning">
              <MailWarning className="h-4 w-4 shrink-0" />
              <span>
                Votre email n'est pas vérifié.{' '}
                <Link to="/verify-email" className="underline underline-offset-2 font-medium hover:text-warning/80">
                  Renvoyer le lien
                </Link>
              </span>
            </div>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-warning/70 hover:text-warning"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Toast notifications for critical/high-priority suggestions */}
      <ToastNotifications />
    </div>
  );
}

/** Bottom navigation for mobile */
export function MobileNav() {
  return null; // TODO: implement bottom nav for mobile
}
