import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../services/api';
import i18n from '../i18n';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThemeMode   = 'dark' | 'light';
export type AccentColor = 'blue' | 'cyan' | 'green' | 'amber' | 'violet' | 'rose';
export type Density     = 'comfortable' | 'compact';
export type Language    = 'fr' | 'en';

export interface Preferences {
  // ── Apparence ──
  themeMode:    ThemeMode;
  accentColor:  AccentColor;
  density:      Density;

  // ── Langue & région ──
  language:     Language;

  // ── Notifications (futurs) ──
  emailNotifications:   boolean;
  browserNotifications: boolean;

  // ── Dashboard (futurs) ──
  sidebarCollapsed: boolean;
  showWelcomeBanner: boolean;
}

interface PreferencesStore extends Preferences {
  setThemeMode:    (v: ThemeMode)   => void;
  setAccentColor:  (v: AccentColor) => void;
  setDensity:      (v: Density)     => void;
  setLanguage:     (v: Language)    => void;
  setPref:         <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  applyToDOM:      () => void;
  reset:           () => void;
  /** Load preferences from backend and apply them. Call after login. */
  loadFromServer:  () => Promise<void>;
  /** Persist current preferences to backend (fire-and-forget). */
  syncToServer:    () => void;
}

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULTS: Preferences = {
  themeMode:            'dark',
  accentColor:          'blue',
  density:              'comfortable',
  language:             'fr',
  emailNotifications:   true,
  browserNotifications: false,
  sidebarCollapsed:     false,
  showWelcomeBanner:    true,
};

// ─── Apply preferences to <html> ─────────────────────────────────────────────

export function applyPreferencesToDOM(prefs: Preferences) {
  const html = document.documentElement;

  // Theme mode: add/remove .light
  if (prefs.themeMode === 'light') {
    html.classList.add('light');
  } else {
    html.classList.remove('light');
  }

  // Accent color: data-accent attribute
  html.setAttribute('data-accent', prefs.accentColor);

  // Density: data-density attribute
  html.setAttribute('data-density', prefs.density);

  // Language: sync i18next
  if (i18n.isInitialized && i18n.language !== prefs.language) {
    i18n.changeLanguage(prefs.language);
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setThemeMode: (themeMode) => {
        set({ themeMode });
        applyPreferencesToDOM({ ...get(), themeMode });
        get().syncToServer();
      },

      setAccentColor: (accentColor) => {
        set({ accentColor });
        applyPreferencesToDOM({ ...get(), accentColor });
        get().syncToServer();
      },

      setDensity: (density) => {
        set({ density });
        applyPreferencesToDOM({ ...get(), density });
        get().syncToServer();
      },

      setLanguage: (language) => {
        set({ language });
        i18n.changeLanguage(language);
        get().syncToServer();
      },

      setPref: (key, value) => {
        set({ [key]: value } as Partial<Preferences>);
        applyPreferencesToDOM({ ...get(), [key]: value });
        get().syncToServer();
      },

      applyToDOM: () => {
        applyPreferencesToDOM(get());
      },

      reset: () => {
        set(DEFAULTS);
        applyPreferencesToDOM(DEFAULTS);
        get().syncToServer();
      },

      loadFromServer: async () => {
        try {
          const { data } = await authApi.getPreferences();
          const prefs: Preferences = {
            themeMode:            data.themeMode            ?? DEFAULTS.themeMode,
            accentColor:          data.accentColor          ?? DEFAULTS.accentColor,
            density:              data.density              ?? DEFAULTS.density,
            language:             data.language             ?? DEFAULTS.language,
            emailNotifications:   data.emailNotifications   ?? DEFAULTS.emailNotifications,
            browserNotifications: data.browserNotifications ?? DEFAULTS.browserNotifications,
            sidebarCollapsed:     data.sidebarCollapsed     ?? DEFAULTS.sidebarCollapsed,
            showWelcomeBanner:    data.showWelcomeBanner    ?? DEFAULTS.showWelcomeBanner,
          };
          set(prefs);
          applyPreferencesToDOM(prefs);
        } catch {
          // Not authenticated or server unavailable — keep local prefs
        }
      },

      syncToServer: () => {
        const { loadFromServer: _l, syncToServer: _s, applyToDOM: _a, reset: _r,
                setThemeMode: _sm, setAccentColor: _ac, setDensity: _d,
                setLanguage: _lang, setPref: _sp, ...prefs } = get();
        authApi.updatePreferences(prefs as unknown as Record<string, unknown>).catch(() => {
          // Ignore sync errors silently
        });
      },
    }),
    {
      name: 'eyeflow-preferences',
    },
  ),
);

// ─── Accent color metadata ────────────────────────────────────────────────────

export const ACCENT_COLORS: {
  id: AccentColor;
  label: string;
  hex: string;
  cssHsl: string;
}[] = [
  { id: 'blue',   label: 'Bleu',    hex: '#3b82f6', cssHsl: '217 91% 60%' },
  { id: 'cyan',   label: 'Cyan',    hex: '#06b6d4', cssHsl: '193 95% 42%' },
  { id: 'green',  label: 'Vert',    hex: '#10b981', cssHsl: '158 64% 40%' },
  { id: 'amber',  label: 'Ambre',   hex: '#f59e0b', cssHsl: '38 92% 50%'  },
  { id: 'violet', label: 'Violet',  hex: '#8b5cf6', cssHsl: '258 90% 66%' },
  { id: 'rose',   label: 'Rose',    hex: '#f43f5e', cssHsl: '351 95% 60%' },
];
