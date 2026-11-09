import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '../lib/util';
import { LOGO_DATA_URL } from '../lib/logo';

// ---- Button ------------------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-900/20',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-elevated',
  ghost: 'text-ink/80 hover:bg-elevated',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55',
        size === 'sm' ? 'h-9 px-3 text-sm' : size === 'icon' ? 'h-10 w-10' : 'h-11 px-4 text-sm',
        VARIANTS[variant], className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---- Form fields ---------------------------------------------------------------------------
export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('h-5 w-5 animate-spin text-brand-500', className)} />;

export function Logo({ size = 36, withText = true, className }: { size?: number; withText?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img src={LOGO_DATA_URL} width={size} height={size} alt="TripVault logo" className="shrink-0 drop-shadow-sm" />
      {withText && (
        <div className="leading-tight">
          <div className="text-[17px] font-extrabold tracking-tight">Trip<span className="text-brand-500">Vault</span></div>
          <div className="text-[10.5px] font-medium text-muted">Your Business Travel Knowledge</div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center animate-in">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-200">{icon}</div>
      <h3 className="text-base font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <XCircle className="mb-3 h-10 w-10 text-red-500" />
      <p className="text-sm text-muted">{text}</p>
      {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export const SkeletonCards = ({ n = 6 }: { n?: number }) => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="card overflow-hidden"><div className="skeleton h-32 rounded-none" /><div className="space-y-2 p-4"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-3 w-1/2" /></div></div>
    ))}
  </div>
);

// ---- Modal ---------------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cn('card flex max-h-[92vh] w-full flex-col rounded-b-none outline-none animate-in sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-elevated" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Toasts + confirm dialogs --------------------------------------------------------------
type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface Toast { id: number; kind: ToastKind; text: string }
interface ConfirmOpts { title: string; text?: string; confirmLabel?: string; danger?: boolean; extra?: { label: string; value: string } }
interface UiCtx { toast(text: string, kind?: ToastKind): void; confirm(o: ConfirmOpts): Promise<boolean | string> }
const UiContext = createContext<UiCtx>(null as any);
export const useUi = () => useContext(UiContext);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const TONE = { success: 'text-emerald-500', error: 'text-red-500', info: 'text-brand-500', warning: 'text-accent-500' };

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean | string) => void }) | null>(null);

  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean | string>((resolve) => setDialog({ ...o, resolve })), []);
  const done = (v: boolean | string) => { dialog?.resolve(v); setDialog(null); };

  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 safe-top sm:bottom-6 sm:right-6 sm:top-auto sm:items-end">
        {toasts.map((t) => {
          const I = ICONS[t.kind];
          return (
            <div key={t.id} role="status" className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3 text-sm animate-in">
              <I className={cn('mt-0.5 h-5 w-5 shrink-0', TONE[t.kind])} />
              <span className="flex-1">{t.text}</span>
            </div>
          );
        })}
      </div>
      <Modal open={!!dialog} onClose={() => done(false)} title={dialog?.title ?? ''}
        footer={<>
          {dialog?.extra && <Button variant="secondary" className="mr-auto" onClick={() => done(dialog.extra!.value)}>{dialog.extra.label}</Button>}
          <Button variant="secondary" onClick={() => done(false)}>Cancel</Button>
          <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => done(true)}>{dialog?.confirmLabel ?? 'Confirm'}</Button>
        </>}>
        <p className="text-sm text-muted">{dialog?.text}</p>
      </Modal>
    </UiContext.Provider>
  );
}

export function Stars({ value, onChange, size = 'h-5 w-5' }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label={`Rating ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n === value ? 0 : n)} aria-label={`${n} star`}
          className={cn('transition disabled:cursor-default', onChange && 'hover:scale-110')}>
          <svg viewBox="0 0 24 24" className={cn(size, n <= value ? 'fill-accent-400 text-accent-400' : 'fill-none text-muted/40')} stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}
