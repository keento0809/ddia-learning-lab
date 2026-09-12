import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "default" | "small";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-white dark:focus-visible:ring-brand-300 dark:focus-visible:ring-offset-neutral-950 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 " +
    "dark:bg-brand-400 dark:text-neutral-950 dark:hover:bg-brand-300 dark:active:bg-brand-200",
  secondary:
    "bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100 " +
    "dark:bg-neutral-900 dark:text-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:active:bg-neutral-700",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800 " +
    "dark:bg-danger-500 dark:text-white dark:hover:bg-danger-400 dark:active:bg-danger-300",
};

// モバイル診断#5(タップ領域不足の指摘)を踏まえ、sizeに関わらずタップ領域として
// 高さ44px(min-h-11)以上を確保する。small は水平方向の密度のみを下げる。
const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: "min-h-11 px-4 py-2 text-sm",
  small: "min-h-11 px-3 py-1.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "default", className, ...props },
  ref,
) {
  const classes = [BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(" ");
  return <button ref={ref} className={classes} {...props} />;
});
