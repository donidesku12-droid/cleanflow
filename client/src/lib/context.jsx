import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { api } from './api.js';

// ---------------- Auth ----------------
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, company: null, subscription: null, unreadNotifications: 0 });

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setState({ loading: false, ...data, user: data.user ?? null });
    } catch {
      setState((s) => ({ ...s, loading: false, user: null }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onUnauthorized = () => setState((s) => ({ ...s, user: null }));
    window.addEventListener('cf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cf:unauthorized', onUnauthorized);
  }, []);

  const setSession = (data) => setState({ loading: false, ...data });
  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setState({ loading: false, user: null, company: null, subscription: null, unreadNotifications: 0 });
  };
  const can = (feature) => state.subscription?.features?.includes(feature);
  const isAdmin = state.user && ['owner', 'manager'].includes(state.user.role);

  return <AuthContext.Provider value={{ ...state, refresh, setSession, logout, can, isAdmin }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

// ---------------- Toasts ----------------
const ToastContext = createContext(null);
let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((type, message) => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3500);
  }, []);
  const toast = { success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) };
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  const colors = { success: 'text-emerald-500', error: 'text-red-500', info: 'text-sky-500' };
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-navy-100 bg-white p-3.5 shadow-soft">
              <Icon className={`mt-0.5 size-5 shrink-0 ${colors[t.type]}`} />
              <p className="flex-1 text-sm text-navy-700">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-navy-300 hover:text-navy-600" aria-label="Sluiten"><X className="size-4" /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// ---------------- Data loading hook ----------------
export function useApi(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const load = useCallback(async (silent = false) => {
    if (!url) return;
    const n = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(url);
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (n === seq.current) setState({ data: null, error, loading: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}
