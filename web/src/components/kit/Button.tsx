import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Buttons. Full round, because only CTAs are fully round in this system --
 * chips, cells and pills are 7px (docs/design-lessons.md section 3).
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-moss text-on-moss hover:bg-moss-hover",
  secondary: "border border-line bg-paper text-ink hover:bg-oat",
  ghost: "bg-transparent text-ink hover:bg-paper",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const SIZES: Record<ButtonSize, string> = {
  // 44px: the smallest target that is a target (docs/design-lessons.md).
  md: "h-11 px-5 text-[15px]",
  sm: "h-11 px-4 text-[13px] sm:h-9",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-display font-semibold",
    "transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

/**
 * A square icon-only button: a row control, not a CTA.
 *
 * 44px where fingers are, the designed 36px from `sm` up, and an accessible
 * name is required rather than optional -- an icon with no label is invisible
 * to a screen reader, and these are the only control on their row.
 */
export function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-[10px] text-ink-muted transition-colors duration-150 hover:bg-paper hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:size-9"
    >
      {children}
    </button>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks double-submits, keeping the label's width. */
  busy?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
