import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { motion } from "motion/react";

import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Form controls.
 *
 * Borders use --color-field, not --color-line: a control's boundary has to
 * meet WCAG 1.4.11's 3:1 against its ground, and the decorative hairline
 * colour does not. Radius 12 sits between the 7px cells and the 15px cards,
 * so a field inside a panel stays concentric.
 */

const CONTROL =
  "w-full rounded-[12px] border border-field bg-oat px-3.5 text-[16px] text-ink outline-none sm:text-[15px] " +
  "transition-colors duration-150 placeholder:text-ink-faint focus:border-moss " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] leading-snug text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[13px] leading-snug text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-11", className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-[96px] resize-y py-2.5", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  // `appearance-none` removes the platform arrow, so one is drawn back in: a
  // select with no affordance reads as a text box that refuses to type.
  return (
    <div className="relative">
      <select className={cn(CONTROL, "h-11 appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

/** An on/off switch. A real `role="switch"`, so screen readers say "on". */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const reduced = prefersReducedMotion();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-[15px] font-medium text-ink">
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:opacity-50",
          checked ? "bg-moss" : "bg-field/45",
        )}
      >
        <motion.span
          aria-hidden
          layout
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 600, damping: 36 }}
          className={cn("size-6 rounded-full bg-paper shadow-sm", checked ? "ml-auto" : "ml-0")}
        />
      </button>
    </div>
  );
}

/**
 * A segmented control -- a small set of mutually exclusive views. The active
 * fill is one shared element with a layoutId, so it slides between options
 * the same way the front page's tabs do.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  label: string;
  /** Distinct per instance on a page, so two controls never share a slide. */
  id: string;
}) {
  const reduced = prefersReducedMotion();
  return (
    <div role="tablist" aria-label={label} className="scroll-x inline-flex max-w-full gap-1 rounded-full bg-oat p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors duration-200 sm:h-9",
              active ? "text-on-moss" : "text-ink-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={`segmented-${id}`}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 40 }}
                className="absolute inset-0 -z-10 rounded-full bg-moss"
              />
            )}
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span
                data-numeric
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold",
                  active ? "bg-on-moss/20 text-on-moss" : "bg-paper text-ink-muted",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A selectable chip for multi-choice sets (skills, languages, shifts). */
export function ChipToggle({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center rounded-[10px] border px-3.5 text-[14px] font-medium transition-colors duration-150",
        selected
          ? "border-moss bg-moss text-on-moss"
          : "border-field bg-oat text-ink hover:bg-paper",
      )}
    >
      {children}
    </button>
  );
}
