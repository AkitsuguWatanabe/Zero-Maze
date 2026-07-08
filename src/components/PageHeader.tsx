import type { ReactNode } from "react";

const TITLE_SIZES = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
} as const;

/**
 * The "eyebrow (uppercase, tracking-widest, accent) + font-serif heading"
 * pattern used at the top of nearly every page and section in the app.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  as = "h1",
  size = "lg",
  mono = false,
  compact = false,
  className = "",
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  as?: "h1" | "h2";
  size?: "sm" | "md" | "lg";
  mono?: boolean;
  /** Tighter spacing + smaller description, for headers inside a card/box rather than at the top of a page. */
  compact?: boolean;
  className?: string;
}) {
  const Heading = as;
  const gap = compact ? "mt-1" : "mt-2";
  return (
    <div className={className}>
      <div className={`text-xs uppercase tracking-widest text-accent ${mono ? "font-mono" : ""}`}>{eyebrow}</div>
      <Heading className={`${gap} font-serif font-semibold ${TITLE_SIZES[size]} ${compact ? "leading-tight" : ""}`}>{title}</Heading>
      {description && (
        <p className={`${gap} text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>{description}</p>
      )}
    </div>
  );
}
