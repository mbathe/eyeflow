/**
 * useNotificationStore
 *
 * Central in-app notification bus.
 * Sources:
 *  - rt:suggestion_new    → full SuggestionEntity pushed by the WS
 *  - rt:suggestion_decided → update existing notification
 *  - rt:engine_completed   → engine run summary
 *  - rt:engine_error       → engine crash
 *  - rt:event_new          → system events (severity ≥ warning)
 *
 * Nothing is static: widget type, icon, colour and actions are all derived
 * at render time from the notification payload.
 */

import { create } from 'zustand';

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotifKind =
  | 'suggestion_new'
  | 'suggestion_decided'
  | 'engine_completed'
  | 'engine_error'
  | 'system_event';

export type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low';
export type SuggestionStatus   = 'pending' | 'accepted' | 'rejected' | 'deferred';

export interface SuggestionPayload {
  id: string;
  title: string;
  description: string;
  priority: SuggestionPriority;
  status: SuggestionStatus;
  confidence: number;
  category?: string;
  source: string;
  impact?: string;
  reasoning?: string;
}

export interface EngineCompletedPayload {
  ts: string;
  suggestionsCreated: number;
  durationMs: number;
  llmUsed?: boolean;
  llmProvider?: string;
}

export interface SystemEventPayload {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  connectorId?: string;
  timestamp: string;
}

export interface AppNotification {
  id: string;             // unique id (suggestion id or generated uuid)
  kind: NotifKind;
  read: boolean;
  createdAt: string;      // ISO
  dismissed: boolean;
  // kind-specific payloads (at most one set)
  suggestion?: SuggestionPayload;
  engineRun?: EngineCompletedPayload;
  engineError?: { error: string; ts: string };
  systemEvent?: SystemEventPayload;
}

// ── Store ───────────────────────────────────────────────────────────────────────

const MAX_NOTIFS = 100;

let _seq = 0;
const uid = () => `notif_${Date.now()}_${++_seq}`;

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;

  // actions
  pushSuggestion:     (s: SuggestionPayload) => void;
  updateSuggestion:   (id: string, patch: Partial<SuggestionPayload>) => void;
  pushEngineCompleted:(p: EngineCompletedPayload) => void;
  pushEngineError:    (p: { error: string; ts: string }) => void;
  pushSystemEvent:    (p: SystemEventPayload) => void;
  markRead:           (id: string) => void;
  markAllRead:        () => void;
  dismiss:            (id: string) => void;
  clearAll:           () => void;
}

const recalc = (list: AppNotification[]): number =>
  list.filter((n) => !n.read && !n.dismissed).length;

const trim = (list: AppNotification[]): AppNotification[] =>
  list.slice(0, MAX_NOTIFS);

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  pushSuggestion: (s) => {
    const notif: AppNotification = {
      id: s.id,
      kind: 'suggestion_new',
      read: false,
      dismissed: false,
      createdAt: new Date().toISOString(),
      suggestion: s,
    };
    set((state) => {
      // Don't duplicate
      if (state.notifications.some((n) => n.id === s.id)) return {};
      const next = trim([notif, ...state.notifications]);
      return { notifications: next, unreadCount: recalc(next) };
    });
  },

  updateSuggestion: (id, patch) => {
    set((state) => {
      const next = state.notifications.map((n) =>
        n.id === id && n.suggestion
          ? { ...n, suggestion: { ...n.suggestion, ...patch } }
          : n,
      );
      return { notifications: next };
    });
  },

  pushEngineCompleted: (p) => {
    // Only push if engine created suggestions (avoids noise on empty runs)
    if (p.suggestionsCreated === 0) return;
    const notif: AppNotification = {
      id: uid(),
      kind: 'engine_completed',
      read: false,
      dismissed: false,
      createdAt: p.ts ?? new Date().toISOString(),
      engineRun: p,
    };
    set((state) => {
      const next = trim([notif, ...state.notifications]);
      return { notifications: next, unreadCount: recalc(next) };
    });
  },

  pushEngineError: (p) => {
    const notif: AppNotification = {
      id: uid(),
      kind: 'engine_error',
      read: false,
      dismissed: false,
      createdAt: p.ts ?? new Date().toISOString(),
      engineError: p,
    };
    set((state) => {
      const next = trim([notif, ...state.notifications]);
      return { notifications: next, unreadCount: recalc(next) };
    });
  },

  pushSystemEvent: (p) => {
    // Only push warning/error/critical events
    if (p.severity === 'info') return;
    const notif: AppNotification = {
      id: p.id ?? uid(),
      kind: 'system_event',
      read: false,
      dismissed: false,
      createdAt: p.timestamp ?? new Date().toISOString(),
      systemEvent: p,
    };
    set((state) => {
      if (state.notifications.some((n) => n.id === notif.id)) return {};
      const next = trim([notif, ...state.notifications]);
      return { notifications: next, unreadCount: recalc(next) };
    });
  },

  markRead: (id) => {
    set((state) => {
      const next = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      return { notifications: next, unreadCount: recalc(next) };
    });
  },

  markAllRead: () => {
    set((state) => {
      const next = state.notifications.map((n) => ({ ...n, read: true }));
      return { notifications: next, unreadCount: 0 };
    });
  },

  dismiss: (id) => {
    set((state) => {
      const next = state.notifications.map((n) =>
        n.id === id ? { ...n, dismissed: true, read: true } : n,
      );
      return { notifications: next, unreadCount: recalc(next) };
    });
  },

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}));

// ── Selectors ──────────────────────────────────────────────────────────────────

export const useUnreadCount     = () => useNotificationStore((s) => s.unreadCount);
export const useNotifications   = () =>
  useNotificationStore((s) =>
    s.notifications.filter((n) => !n.dismissed).slice(0, 50),
  );
export const useNewSuggestions  = () =>
  useNotificationStore((s) =>
    s.notifications.filter((n) => n.kind === 'suggestion_new' && !n.dismissed),
  );
