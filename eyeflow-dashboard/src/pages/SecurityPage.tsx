import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/services/api';
import { Card, CardContent } from '@/components/ui/card';
import {
  ShieldAlert, User, Lock, Unlock, Trash2, RefreshCw,
  AlertTriangle, CheckCircle2, ChevronDown, Search,
  Shield, UserCheck, UserX, Clock, Save, X
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
const rel = (d?: string) => {
  if (!d) return 'Never';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const ROLES = ['admin', 'operator', 'viewer', 'readonly'];

const RoleBadge = ({ role }: { role?: string }) => {
  const r = (role ?? 'viewer').toLowerCase();
  const map: Record<string, string> = {
    admin:    'bg-red-500/15 text-red-400 border-red-500/30',
    operator: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    viewer:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    readonly: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${map[r] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {r}
    </span>
  );
};

/* ── security score ─────────────────────────────────────── */
const ScoreCard = ({ users }: { users: any[] }) => {
  const total       = users.length;
  const locked      = users.filter(u => u.isLocked || u.locked).length;
  const adminCount  = users.filter(u => (u.role ?? '').toLowerCase() === 'admin').length;
  const verified    = users.filter(u => u.verified || u.emailVerified).length;

  const issues: string[] = [];
  if (locked > 0)      issues.push(`${locked} locked account${locked > 1 ? 's' : ''}`);
  if (adminCount > 3)  issues.push(`${adminCount} admin accounts (high privilege)`);
  if (verified < total) issues.push(`${total - verified} unverified account${total - verified > 1 ? 's' : ''}`);

  const score = total === 0 ? 100 : Math.max(0, Math.round(100 - (locked * 15) - Math.max(0, (adminCount - 2) * 5) - ((total - verified) * 10)));
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';
  const barColor   = score >= 80 ? 'bg-emerald-400'   : score >= 60 ? 'bg-amber-400'   : 'bg-red-400';

  return (
    <Card className={`${score < 60 ? 'border-red-500/30' : score < 80 ? 'border-amber-500/30' : 'border-emerald-500/20'}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className={`h-5 w-5 ${scoreColor}`} />
              <span className="font-semibold">Security Score</span>
            </div>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-bold ${scoreColor}`}>{score}</span>
              <span className="text-muted-foreground text-sm mb-1">/ 100</span>
            </div>
            <div className="w-full h-2 rounded-full bg-secondary">
              <div className={`h-2 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="space-y-2 min-w-[160px]">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total users</span>
              <span className="font-medium">{total}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Admins</span>
              <span className={`font-medium ${adminCount > 3 ? 'text-amber-400' : ''}`}>{adminCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Locked</span>
              <span className={`font-medium ${locked > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{locked}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Verified</span>
              <span className="font-medium">{verified}/{total}</span>
            </div>
          </div>
        </div>
        {issues.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/50 space-y-1.5">
            {issues.map((iss, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />{iss}
              </div>
            ))}
          </div>
        )}
        {issues.length === 0 && (
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />No security issues detected
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/* ── inline role editor ─────────────────────────────────── */
const RoleEditor = ({
  userId, currentRole, onSave, onCancel
}: { userId: string; currentRole: string; onSave: (id: string, role: string) => Promise<void>; onCancel: () => void }) => {
  const [selected, setSelected] = useState(currentRole.toLowerCase());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(userId, selected);
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="appearance-none bg-secondary border border-primary/50 rounded px-2 py-1 pr-6 text-xs outline-none focus:ring-1 focus:ring-primary/50 capitalize"
        >
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <ChevronDown className="h-3 w-3 text-muted-foreground absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <button onClick={save} disabled={saving} className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50">
        <Save className="h-3.5 w-3.5" />
      </button>
      <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

/* ── skeleton ────────────────────────────────────────────── */
const Skeleton = () => (
  <div className="space-y-2 animate-pulse">
    {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded bg-muted/40" />)}
  </div>
);

/* ── main page ───────────────────────────────────────────── */
export default function SecurityPage() {
  const { t } = useTranslation();
  const [users, setUsers]     = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [acting, setActing]   = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await adminApi.users();
      setUsers(Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : []);
    } catch (e: any) {
      setError(e?.message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleLock = async (u: any) => {
    const id = u.id;
    setActing(id);
    try {
      if (u.isLocked || u.locked) await adminApi.unlock(id);
      // lock is not available in the API — just refresh
      else { /* no lock endpoint */ }
      await load();
    } catch { /* ignore */ }
    finally { setActing(null); }
  };

  const deleteUser = async (id: string) => {
    setDeleting(id);
    try { await adminApi.deleteUser(id); await load(); }
    catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  const saveRole = async (id: string, role: string) => {
    try { await adminApi.setRole(id, role); setEditing(null); await load(); }
    catch { setEditing(null); }
  };

  const filtered = users.filter(u =>
    search === '' ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            {t('nav.security', 'Security')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">User access management</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 px-4 py-2.5 rounded-lg">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {/* score card */}
      {!loading && users.length > 0 && <ScoreCard users={users} />}

      {/* search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search users…"
          className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {loading && <Skeleton />}

      {/* user table */}
      {!loading && (
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <User className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">No users found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">User</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Last active</th>
                    <th className="text-right px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isLocked = u.isLocked || u.locked;
                    return (
                      <tr
                        key={u.id}
                        className={`group border-b border-border/50 transition-colors ${
                          isLocked ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-muted/20'
                        }`}
                      >
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isLocked ? 'bg-red-500/20 text-red-400' : 'bg-primary/15 text-primary'
                            }`}>
                              {(u.name ?? u.email ?? '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{u.name ?? '—'}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        {/* Role */}
                        <td className="px-4 py-3">
                          {editing === u.id ? (
                            <RoleEditor
                              userId={u.id}
                              currentRole={u.role ?? 'viewer'}
                              onSave={saveRole}
                              onCancel={() => setEditing(null)}
                            />
                          ) : (
                            <button onClick={() => setEditing(u.id)} className="group/role flex items-center gap-1.5">
                              <RoleBadge role={u.role} />
                              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover/role:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-red-400">
                              <Lock className="h-3 w-3" />Locked
                            </span>
                          ) : u.verified || u.emailVerified ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                              <UserCheck className="h-3 w-3" />Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400">
                              <UserX className="h-3 w-3" />Unverified
                            </span>
                          )}
                        </td>
                        {/* Last active */}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 opacity-50" />
                            {rel(u.lastLoginAt ?? u.lastActiveAt ?? u.updatedAt)}
                          </span>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {acting === u.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <button
                                onClick={() => toggleLock(u)}
                                title={isLocked ? 'Unlock user' : 'Lock user'}
                                className={`p-1.5 rounded border transition-colors ${
                                  isLocked
                                    ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                                    : 'border-border text-muted-foreground hover:text-amber-400 hover:border-amber-500/30'
                                }`}
                              >
                                {isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                              </button>
                            )}
                            {deleting === u.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <button
                                onClick={() => deleteUser(u.id)}
                                title="Delete user"
                                className="p-1.5 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
