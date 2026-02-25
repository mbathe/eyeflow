import { Search, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '@/store/auth.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { NotificationPanel } from '@/components/NotificationPanel';

export function Header() {
  const { t } = useTranslation();
  const user = useUser();
  const { themeMode, setThemeMode } = usePreferencesStore();

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center gap-4 px-4 md:px-6 shrink-0">
      {/* Search */}
      <div className="flex-1 hidden md:flex items-center gap-2 bg-secondary rounded-md px-3 py-1.5 max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder={t('header.searchPlaceholder')}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex-1 md:flex-none" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title={themeMode === 'dark' ? t('header.lightMode') : t('header.darkMode')}
        >
          {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <NotificationPanel />

        <Link to="/preferences" className="flex items-center gap-2 pl-2 border-l border-border ml-1 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold uppercase">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="hidden lg:block">
            <div className="text-sm font-medium leading-none">{user?.firstName}</div>
            <div className="text-xs text-muted-foreground mt-0.5 capitalize">{user?.role?.toLowerCase()}</div>
          </div>
        </Link>
      </div>
    </header>
  );
}
