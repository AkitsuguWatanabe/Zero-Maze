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
  className = "",
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  as?: "h1" | "h2";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Heading = as;
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-widest text-accent">{eyebrow}</div>
      <Heading className={`mt-2 font-serif font-semibold ${TITLE_SIZES[size]}`}>{title}</Heading>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
