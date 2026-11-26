import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Toast = { id: number; text: string; type: 'info' | 'success' | 'error' };
type ToastApi = { push: (text: string, type?: Toast['type']) => void };

const ToastContext = createContext<ToastApi>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, type: Toast['type'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { id, text, type }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
        {footer ? <div style={{ marginTop: 14 }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-label={label || '切換'}
      aria-pressed={on}
      type="button"
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="stat-box">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function Progress({ value, total, green = false }: { value: number; total: number; green?: boolean }) {
  const p = total ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div className={`progress ${green ? 'green' : ''}`}>
      <i style={{ width: `${p}%` }} />
    </div>
  );
}

export function Loading({ text = '載入中…' }: { text?: string }) {
  return (
    <div className="empty">
      <div className="spinner" />
      <div style={{ marginTop: 10 }}>{text}</div>
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div style={{ marginBottom: 12 }}>{text}</div>
      {action}
    </div>
  );
}

export function useInterval(cb: () => void, ms: number | null) {
  useEffect(() => {
    if (!ms) return undefined;
    const id = setInterval(cb, ms);
    return () => clearInterval(id);
  }, [cb, ms]);
}
