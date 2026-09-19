import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-[14px] font-bold">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-xs text-[13px] leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
