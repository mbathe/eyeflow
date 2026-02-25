import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, AlertTriangle, BrainCircuit, GitBranch,
  PlayCircle, History, ShieldCheck, Settings2, Server,
  LogOut, ChevronLeft, ChevronRight, SlidersHorizontal, Database, Lightbulb,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuthStore, useIsAdmin } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';

interface NavItem { icon: React.ElementType; label: string; to: string }

const Divider = ({ label, collapsed }: { label: string; collapsed: boolean }) => (
  <div className={cn('pt-4 pb-1 px-3', collapsed && 'px-0 text-center')}>
    {!collapsed
      ? <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 select-none">{label}</span>
      : <div className="h-px bg-sidebar-border mx-1 my-1" />}
  </div>
);

export function Sidebar() {
  const { t } = useTranslation();
  const { logout, user } = useAuthStore();
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const { sidebarCollapsed: collapsed, setPref } = usePreferencesStore();

  const setCollapsed = (v: boolean) => setPref('sidebarCollapsed', v);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // ── Observer ──────────────────────────────────────────────────
  const observeItems: NavItem[] = [
    { icon: LayoutDashboard, label: t('nav.dashboard'),  to: '/dashboard' },
    { icon: AlertTriangle,   label: t('nav.events'),     to: '/events'    },
  ];

  // ── Analyser & Décider ────────────────────────────────────────
  const analyzeItems: NavItem[] = [
    { icon: BrainCircuit, label: t('nav.analysis'),     to: '/analysis'      },
    { icon: Database,     label: t('nav.dataExplorer'), to: '/data-explorer' },
    { icon: Lightbulb,    label: t('nav.suggestions'),  to: '/suggestions'   },
    { icon: GitBranch,    label: t('nav.automations'),  to: '/automations'   },
  ];

  // ── Agir & Auditer ────────────────────────────────────────────
  const actItems: NavItem[] = [
    { icon: PlayCircle, label: t('nav.execution'), to: '/execution' },
    { icon: History,    label: t('nav.audit'),     to: '/audit'     },
  ];

  // ── Gérer ─────────────────────────────────────────────────────
  const manageItems: NavItem[] = [
    { icon: ShieldCheck, label: t('nav.security'),       to: '/security'       },
    { icon: Settings2,   label: t('nav.configuration'),  to: '/configuration'  },
  ];

  // ── Administration (admin only) ───────────────────────────────
  const adminItems: NavItem[] = [
    { icon: Server, label: t('nav.administration'), to: '/administration' },
  ];

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors group',
      collapsed && 'justify-center px-0',
      isActive
        ? 'bg-primary/15 text-primary font-medium'
        : 'text-sidebar-foreground/80 hover:bg-white/8 hover:text-sidebar-foreground',
    );

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        className={navLinkClass}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    ));

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      {/* Logo ─────────────────────────────────────────────────── */}
      <div className={cn(
        'flex items-center gap-3 px-4 h-14 border-b border-sidebar-border shrink-0',
        collapsed && 'justify-center px-0',
      )}>
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary text-primary-foreground font-bold text-xs shrink-0">
          E
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm text-foreground truncate">{t('common.appName')}</span>
        )}
      </div>

      {/* Navigation ───────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">

        {/* Pillar 1 — Observer */}
        {!collapsed && <Divider label={t('nav.pillarObserve')} collapsed={collapsed} />}
        {collapsed && <div className="h-px bg-sidebar-border mx-2 my-2" />}
        {renderItems(observeItems)}

        {/* Pillar 2 — Analyser & Décider */}
        <Divider label={t('nav.pillarAnalyze')} collapsed={collapsed} />
        {renderItems(analyzeItems)}

        {/* Pillar 3 — Agir & Auditer */}
        <Divider label={t('nav.pillarAct')} collapsed={collapsed} />
        {renderItems(actItems)}

        {/* Pillar 4 — Gérer */}
        <Divider label={t('nav.pillarManage')} collapsed={collapsed} />
        {renderItems(manageItems)}

        {/* Administration (admin only) */}
        {isAdmin && (
          <>
            <Divider label="Admin" collapsed={collapsed} />
            {renderItems(adminItems)}
          </>
        )}
      </nav>

      {/* Footer ───────────────────────────────────────────────── */}
      <div className="p-2 border-t border-sidebar-border space-y-0.5 shrink-0">
        {!collapsed && (
          <div className="px-3 py-1.5 text-xs text-sidebar-foreground/50 truncate">
            {user?.firstName} {user?.lastName}
          </div>
        )}

        <NavLink
          to="/preferences"
          className={navLinkClass}
          title={collapsed ? t('nav.preferences') : undefined}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">{t('nav.preferences')}</span>}
        </NavLink>

        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-sidebar-foreground/60',
            'hover:text-destructive hover:bg-destructive/10 transition-colors',
            collapsed && 'justify-center px-0',
          )}
          title={t('nav.logout')}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{t('nav.logout')}</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm',
            'text-sidebar-foreground/40 hover:bg-sidebar-border/50 hover:text-sidebar-foreground/80 transition-colors',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <><ChevronLeft className="h-4 w-4" /><span className="text-xs">{t('nav.collapse')}</span></>}
        </button>
      </div>
    </aside>
  );
}
