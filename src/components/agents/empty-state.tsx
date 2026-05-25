import type { ReactNode } from "react";

export type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  cta?: string;
};

export function EmptyState({ icon, title, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {cta && (
        <p className="mt-1 text-xs text-muted-foreground/70 italic">{cta}</p>
      )}
    </div>
  );
}
