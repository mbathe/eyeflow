/**
 * useWidgetsStore
 *
 * Persisted Zustand store for pinned DataExplorer widgets.
 * Widgets survive page refreshes via localStorage.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'table';

export interface PinnedWidget {
  id: string;
  title: string;
  query: string;
  chartType: ChartType;
  data: { name: string; value: number }[];
  pinnedAt: string;      // ISO timestamp
  sourceConnectorId?: string;
}

interface WidgetsState {
  pinnedWidgets: PinnedWidget[];
  pinWidget: (widget: Omit<PinnedWidget, 'id' | 'pinnedAt'>) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, patch: Partial<Omit<PinnedWidget, 'id'>>) => void;
  clearAll: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useWidgetsStore = create<WidgetsState>()(
  persist(
    (set) => ({
      pinnedWidgets: [],

      pinWidget: (widget) =>
        set((state) => ({
          pinnedWidgets: [
            {
              ...widget,
              id: `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              pinnedAt: new Date().toISOString(),
            },
            ...state.pinnedWidgets,
          ],
        })),

      removeWidget: (id) =>
        set((state) => ({
          pinnedWidgets: state.pinnedWidgets.filter((w) => w.id !== id),
        })),

      updateWidget: (id, patch) =>
        set((state) => ({
          pinnedWidgets: state.pinnedWidgets.map((w) =>
            w.id === id ? { ...w, ...patch } : w
          ),
        })),

      clearAll: () => set({ pinnedWidgets: [] }),
    }),
    {
      name: 'eyeflow-pinned-widgets',
    }
  )
);

// ── Selectors ─────────────────────────────────────────────────────────────────

export const usePinnedWidgets = () => useWidgetsStore((s) => s.pinnedWidgets);
export const usePinnedCount   = () => useWidgetsStore((s) => s.pinnedWidgets.length);
