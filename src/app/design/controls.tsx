import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "./Icon.tsx";

export const spring = { type: "spring", stiffness: 380, damping: 34 } as const;

/** Side sheet over the live view. The camera stays visible to the left, so changes are seen live. */
export function Sheet({ open, title, onClose, children, testId, wide }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; testId?: string; wide?: boolean;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          ref={panel}
          className={`sheet glass${wide ? " wide" : ""}`}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          data-testid={testId}
          initial={{ x: "105%", opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "105%", opacity: 0.6 }}
          transition={spring}
        >
          <header className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
              <Icon name="close" />
            </button>
          </header>
          <div className="sheet-body">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function Section({ title, icon, children, hint }: { title: string; icon?: IconName; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="section">
      <h3>{icon && <Icon name={icon} size={18} />}{title}</h3>
      {hint && <p className="section-hint">{hint}</p>}
      <div className="section-body">{children}</div>
    </section>
  );
}

/** Label on the left (with an optional explanation), control on the right. */
export function Row({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="row">
      <div className="row-text">
        <label htmlFor={htmlFor}>{label}</label>
        {hint && <small>{hint}</small>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

/** Radio group drawn as segmented buttons; arrow keys move the selection. */
export function Segmented<T extends string>({ value, options, onChange, label, testId, large }: {
  value: T; options: SegmentOption<T>[]; onChange: (v: T) => void; label: string; testId?: string; large?: boolean;
}) {
  const id = useId();
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = options[(i + d + options.length) % options.length]!;
    onChange(next.value);
    document.getElementById(`${id}-${next.value}`)?.focus();
  };
  return (
    <div className={`segmented${large ? " large" : ""}`} role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            id={`${id}-${o.value}`}
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="segment"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            title={o.hint}
          >
            {checked && <motion.span layoutId={`${id}-pill`} className="segment-bg" transition={spring} />}
            <span className="segment-content">
              {o.icon}
              <span>{o.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button id={id} role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <motion.span className="knob" layout transition={spring} />
    </button>
  );
}

export function Select<T extends string>({ value, options, onChange, id, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id?: string; label?: string;
}) {
  return (
    <select id={id} aria-label={label} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
