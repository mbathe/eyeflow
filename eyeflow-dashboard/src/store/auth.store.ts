import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/services/api';
import { usePreferencesStore } from './preferences.store';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  avatarUrl: string | null;
  isLocked: boolean;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authApi.login(email, password);
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          set({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            user: data.user ?? null,
          });
          if (!data.user) await get().fetchMe();
        } catch (err: any) {
          const retryAfter: number | undefined = err.response?.data?.retryAfter;
          const msg =
            err.response?.status === 429
              ? retryAfter && retryAfter > 60
                ? `Compte verrouillé. Réessayez dans ${Math.ceil(retryAfter / 60)} min.`
                : `Compte verrouillé. Réessayez dans ${retryAfter ?? 900} secondes.`
              : Array.isArray(err.response?.data?.message)
              ? err.response.data.message.join(' · ')
              : err.response?.data?.message ?? 'Identifiants incorrects';
          set({ error: msg });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const { data: res } = await authApi.register(data);
          localStorage.setItem('accessToken', res.accessToken);
          localStorage.setItem('refreshToken', res.refreshToken);
          set({
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
          });
          await get().fetchMe();
        } catch (err: any) {
          const msg = Array.isArray(err.response?.data?.message)
            ? err.response.data.message.join(' · ')
            : err.response?.data?.message ?? "Erreur lors de l'inscription";
          set({ error: msg });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // ignore
        } finally {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          set({ user: null, accessToken: null, refreshToken: null });
        }
      },

      fetchMe: async () => {
        try {
          const { data } = await authApi.me();
          set({ user: data });
          // Load preferences from backend and apply to DOM
          await usePreferencesStore.getState().loadFromServer();
        } catch {
          set({ user: null });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'eyeflow-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);

/** Selector helpers */
export const useUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => !!s.accessToken);
export const useIsAdmin = () =>
  useAuthStore((s) => ['ADMIN', 'SUPER_ADMIN'].includes(s.user?.role ?? ''));
