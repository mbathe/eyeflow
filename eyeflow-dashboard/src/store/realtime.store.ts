/**
 * useRealtimeStore
 *
 * Zustand store that manages the Socket.io /realtime connection.
 * Provides live state for: suggestions count, recent events, system health.
 *
 * Usage:
 *   const { connect, disconnect, suggestionsCount, recentEvents, health } = useRealtimeStore();
 *   useEffect(() => { connect(token); return disconnect; }, [token]);
 */
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useNotificationStore } from './notification.store';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SystemHealth = 'ok' | 'degraded' | 'critical';
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface RealtimeEvent {
  id: string;
  severity: EventSeverity;
  message: string;
  connectorId?: string;
  timestamp: string;
}

export interface SuggestionStats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  deferred: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface RealtimeState {
  // Connection
  socket: Socket | null;
  status: ConnectionStatus;
  lastPing: number | null;

  // Live data
  suggestionsCount: number;
  suggestionStats: SuggestionStats;
  recentEvents: RealtimeEvent[];
  health: SystemHealth;
  lastSuggestionId: string | null; // triggers refetch in components

  // Actions
  connect: (baseUrl?: string) => void;
  disconnect: () => void;
  resetSuggestionsCount: () => void;
}

const MAX_EVENTS = 50;
const DEFAULT_URL =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any)?.env?.VITE_API_URL ?? 'http://localhost:3000';

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  // ── Initial state ───────────────────────────────────────────────────────────
  socket: null,
  status: 'disconnected',
  lastPing: null,
  suggestionsCount: 0,
  suggestionStats: { total: 0, pending: 0, accepted: 0, rejected: 0, deferred: 0 },
  recentEvents: [],
  health: 'ok',
  lastSuggestionId: null,

  // ── connect ─────────────────────────────────────────────────────────────────
  connect: (baseUrl = DEFAULT_URL) => {
    const existing = get().socket;
    if (existing?.connected) return; // already connected
    if (existing) existing.disconnect();

    set({ status: 'connecting' });

    const socket = io(`${baseUrl}/realtime`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      set({ status: 'connected' });
      socket.emit('rt:request_snapshot', {});
    });

    socket.on('disconnect', () => set({ status: 'disconnected' }));
    socket.on('connect_error', () => set({ status: 'error' }));

    // ── Server push events ───────────────────────────────────────────────────

    socket.on('rt:suggestions_count', ({ count }: { count: number }) => {
      set({ suggestionsCount: count });
    });

    socket.on('rt:suggestions_stats', (stats: SuggestionStats) => {
      set({ suggestionStats: stats, suggestionsCount: stats.pending });
    });

    socket.on('rt:suggestion_new', (s: { id: string; title?: string; description?: string; priority?: string; status?: string; confidence?: number; category?: string; source?: string; impact?: string; reasoning?: string }) => {
      set((state) => ({
        suggestionsCount: state.suggestionsCount + 1,
        lastSuggestionId: s.id,
      }));
      // Forward full payload to notification store
      if (s.title) {
        useNotificationStore.getState().pushSuggestion({
          id:          s.id,
          title:       s.title ?? 'Nouvelle suggestion',
          description: s.description ?? '',
          priority:    (s.priority as 'critical' | 'high' | 'medium' | 'low') ?? 'medium',
          status:      (s.status as 'pending') ?? 'pending',
          confidence:  s.confidence ?? 0,
          category:    s.category,
          source:      s.source ?? 'manual',
          impact:      s.impact,
          reasoning:   s.reasoning,
        });
      }
    });

    socket.on('rt:suggestion_decided', (payload: { id: string; status: string }) => {
      useNotificationStore.getState().updateSuggestion(payload.id, {
        status: payload.status as 'accepted' | 'rejected' | 'deferred',
      });
      // lastSuggestionId change triggers list refresh in SuggestionsPage
      set((state) => ({
        suggestionsCount: Math.max(0, state.suggestionsCount - 1),
      }));
    });

    socket.on('rt:event_new', (event: RealtimeEvent) => {
      set((state) => ({
        recentEvents: [event, ...state.recentEvents].slice(0, MAX_EVENTS),
        // Auto-degrade health on critical events
        health:
          event.severity === 'critical'
            ? 'critical'
            : event.severity === 'error' && state.health === 'ok'
            ? 'degraded'
            : state.health,
      }));
      // Forward to notification store (warning and above only)
      useNotificationStore.getState().pushSystemEvent(event);
    });

    socket.on('rt:engine_completed', (p: { ts: string; suggestionsCreated: number; durationMs: number; llmUsed?: boolean; llmProvider?: string }) => {
      useNotificationStore.getState().pushEngineCompleted(p);
    });

    socket.on('rt:engine_error', (p: { error: string; ts: string }) => {
      useNotificationStore.getState().pushEngineError(p);
    });

    socket.on('rt:health', ({ status }: { status: SystemHealth }) => {
      set({ health: status });
    });

    socket.on('rt:ping', ({ ts }: { ts: number }) => {
      set({ lastPing: ts, status: 'connected' });
    });

    set({ socket });
  },

  // ── disconnect ──────────────────────────────────────────────────────────────
  disconnect: () => {
    const { socket } = get();
    socket?.disconnect();
    set({ socket: null, status: 'disconnected' });
  },

  resetSuggestionsCount: () => set({ suggestionsCount: 0 }),
}));

// ── Convenience selectors ─────────────────────────────────────────────────────

export const useConnectionStatus = () => useRealtimeStore((s) => s.status);
export const useSuggestionsCount = () => useRealtimeStore((s) => s.suggestionsCount);
export const useRecentEvents     = () => useRealtimeStore((s) => s.recentEvents);
export const useSystemHealth     = () => useRealtimeStore((s) => s.health);
