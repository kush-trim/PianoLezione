"use client";

import { Loader2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { COLOR_NAMES, PALETTE } from "@/lib/colors";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// --- Button ---

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

const VARIANTS = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface hover:bg-sunken",
  ghost: "text-ink hover:bg-sunken",
  danger: "text-danger hover:bg-danger-soft",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2 text-[13px]" : "h-9 px-3",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// --- Campi ---

const inputBase =
  "h-9 rounded-md border border-line-strong bg-surface px-2.5 placeholder:text-muted/60 disabled:bg-sunken disabled:text-muted";
export const inputClass = `${inputBase} w-full`;

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  // La larghezza piena è solo il valore predefinito: se chi usa il campo indica una larghezza
  // (w-20, w-56…) deve valere quella. Con entrambe le classi vincerebbe quella scritta per ultima
  // nel CSS generato, non quella voluta.
  const hasWidth = /(^|\s)(max-sm:|sm:|md:|lg:)?w-/.test(className ?? "");
  return <input className={cx(hasWidth ? inputBase : inputClass, className)} {...rest} />;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Textarea che cresce con il contenuto. */
export function AutoTextarea({
  value,
  className,
  minRows = 1,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} rows={minRows} className={className} {...rest} />;
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Colore">
      {COLOR_NAMES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={PALETTE[c].label}
          title={PALETTE[c].label}
          onClick={() => onChange(c)}
          className={cx(
            "size-6 rounded-full border-2 transition-transform",
            value === c ? "scale-110 border-ink" : "border-transparent",
          )}
          style={{ background: PALETTE[c].solid }}
        />
      ))}
    </div>
  );
}

// --- Dialog ---

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    // Next tiene montata (nascosta) la pagina da cui si esce: una finestra modale rimasta
    // aperta bloccherebbe i clic sulla pagina nuova. Va chiusa quando la pagina si nasconde.
    return () => {
      if (el.open) el.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/40",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <IconButton label="Chiudi" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}

// --- Stati di pagina ---

export function PageHeader({
  title,
  subtitle,
  actions,
  compact,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Meno spazio sotto: per le pagine che devono stare in una schermata. */
  compact?: boolean;
}) {
  return (
    <header className={cx("flex flex-wrap items-end justify-between gap-3", compact ? "mb-3" : "mb-5")}>
      <div>
        <h1 className="font-display text-[26px] leading-tight font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Caricamento…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
      {children}
    </p>
  );
}

// --- Toast ---

type ToastAction = { label: string; run: () => void };
type Toast = { id: number; text: string; kind: "ok" | "error"; action?: ToastAction };
type PushToast = (text: string, kind?: Toast["kind"], action?: ToastAction) => void;
const ToastContext = createContext<PushToast>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<PushToast>(
    (text, kind = "ok", action) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, text, kind, action }]);
      // Con un pulsante (es. Annulla) il messaggio resta un po' di più.
      setTimeout(() => dismiss(id), kind === "error" || action ? 6000 : 3000);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg px-3.5 py-2.5 text-[13px] shadow-lg",
              t.kind === "error" ? "bg-danger text-white" : "bg-ink text-white",
            )}
          >
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="shrink-0 font-semibold underline-offset-2 hover:underline"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// --- Tastiera ---

/** Cmd su Mac, Ctrl su Windows e Linux. */
export const isMod = (e: { metaKey: boolean; ctrlKey: boolean }) => e.metaKey || e.ctrlKey;

/** Il tasto è stato premuto mentre si scrive (campo di testo) o dentro una finestra aperta? */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  if (el.closest("dialog[open]")) return true;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** "⌘" su Mac, "Ctrl+" altrove: per scrivere le scorciatoie nei suggerimenti. */
export const modLabel = () => (isMac() ? "⌘" : "Ctrl+");
