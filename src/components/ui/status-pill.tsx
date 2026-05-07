import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "error";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-cream-deep text-text-muted",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-amber/15 text-amber",
  error: "bg-error/10 text-error",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-text-muted",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-amber",
  error: "bg-error",
};

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[1.2px]",
        toneClasses[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5", dotClasses[tone])} aria-hidden />
      {children}
    </span>
  );
}
