import { useState } from 'react';
import { Moon, Sun, Monitor, Check, RotateCcw, Bell, Globe, Layout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  usePreferencesStore,
  ACCENT_COLORS,
  type ThemeMode,
  type AccentColor,
  type Density,
  type Language,
} from '@/store/preferences.store';

function SectionCard({ title, description, icon: Icon, children }: { title: string; description: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Toggle({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/30')}
      role="switch"
      aria-checked={checked}
    >
      <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
    </button>
  );
}

export default function PreferencesPage() {
  const { t } = useTranslation();
  const prefs = usePreferencesStore();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    prefs.applyToDOM();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const THEME_OPTIONS: { id: ThemeMode; label: string; icon: React.ElementType; preview: string }[] = [
    { id: 'dark',  label: t('preferences.appearance.dark'),  icon: Moon, preview: 'bg-[#0a0f1e]' },
    { id: 'light', label: t('preferences.appearance.light'), icon: Sun,  preview: 'bg-[#e8eaf0]' },
  ];

  const DENSITY_OPTIONS: { id: Density; label: string; desc: string }[] = [
    { id: 'comfortable', label: t('preferences.appearance.comfortable'), desc: t('preferences.appearance.comfortableDesc') },
    { id: 'compact',     label: t('preferences.appearance.compact'),     desc: t('preferences.appearance.compactDesc')     },
  ];

  const LANGUAGE_OPTIONS: { id: Language; label: string; flag: string }[] = [
    { id: 'fr', label: 'Français', flag: '🇫🇷' },
    { id: 'en', label: 'English',  flag: '🇬🇧' },
  ];

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('preferences.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('preferences.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={prefs.reset} className="text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />{t('preferences.resetButton')}
          </Button>
          <Button size="sm" onClick={handleSave}>
            {saved ? <><Check className="h-3.5 w-3.5 mr-1.5" />{t('preferences.savedButton')}</> : t('preferences.saveButton')}
          </Button>
        </div>
      </div>

      {/* ── 1. Apparence ── */}
      <SectionCard title={t('preferences.appearance.title')} description={t('preferences.appearance.description')} icon={Monitor}>
        <div className="space-y-6">
          {/* Theme mode */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{t('preferences.appearance.themeMode')}</p>
            <div className="grid grid-cols-2 gap-3">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => prefs.setThemeMode(opt.id)}
                  className={cn('relative rounded-xl border-2 p-4 flex flex-col items-center gap-3 transition-all',
                    prefs.themeMode === opt.id ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80 hover:bg-secondary/50')}
                >
                  {prefs.themeMode === opt.id && (
                    <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </span>
                  )}
                  <div className={cn('h-12 w-full rounded-lg border border-border/40', opt.preview)} />
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <opt.icon className="h-3.5 w-3.5" />{opt.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Accent color */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{t('preferences.appearance.accentColor')}</p>
            <div className="flex flex-wrap gap-3">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.id}
                  onClick={() => prefs.setAccentColor(color.id as AccentColor)}
                  title={color.label}
                  className={cn('h-9 w-9 rounded-full border-2 transition-all flex items-center justify-center',
                    prefs.accentColor === color.id ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:scale-105')}
                  style={{ backgroundColor: color.hex }}
                >
                  {prefs.accentColor === color.id && <Check className="h-4 w-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('preferences.appearance.selectedColor')} :{' '}
              <span className="text-foreground font-medium capitalize">
                {ACCENT_COLORS.find((c) => c.id === prefs.accentColor)?.label}
              </span>
            </p>
          </div>

          {/* Density */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{t('preferences.appearance.density')}</p>
            <div className="grid grid-cols-2 gap-3">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => prefs.setDensity(opt.id)}
                  className={cn('rounded-lg border-2 p-3 text-left transition-all',
                    prefs.density === opt.id ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80 hover:bg-secondary/50')}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {prefs.density === opt.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Langue ── */}
      <SectionCard title={t('preferences.language.title')} description={t('preferences.language.description')} icon={Globe}>
        <div className="flex flex-wrap gap-3">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => prefs.setLanguage(opt.id)}
              className={cn('flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all',
                prefs.language === opt.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border hover:bg-secondary/50 text-muted-foreground')}
            >
              <span className="text-base">{opt.flag}</span>
              {opt.label}
              {prefs.language === opt.id && <Check className="h-3.5 w-3.5 text-primary ml-1" />}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* ── 3. Notifications ── */}
      <SectionCard title={t('preferences.notifications.title')} description={t('preferences.notifications.description')} icon={Bell}>
        <div className="space-y-3">
          {([
            { key: 'emailNotifications'   as const, label: t('preferences.notifications.email'),   desc: t('preferences.notifications.emailDesc')   },
            { key: 'browserNotifications' as const, label: t('preferences.notifications.browser'), desc: t('preferences.notifications.browserDesc') },
          ]).map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Toggle checked={prefs[item.key]} onToggle={() => prefs.setPref(item.key, !prefs[item.key])} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── 4. Dashboard ── */}
      <SectionCard title={t('preferences.dashboardSection.title')} description={t('preferences.dashboardSection.description')} icon={Layout}>
        <div className="space-y-3">
          {([
            { key: 'showWelcomeBanner' as const, label: t('preferences.dashboardSection.welcomeBanner'), desc: t('preferences.dashboardSection.welcomeBannerDesc') },
          ]).map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Toggle checked={prefs[item.key]} onToggle={() => prefs.setPref(item.key, !prefs[item.key])} />
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{t('preferences.comingSoonBadge')}</Badge>
            {t('preferences.dashboardSection.comingSoon')}
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
