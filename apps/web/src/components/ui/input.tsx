import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "border-input bg-background flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-sm transition-[color,box-shadow,border-color] outline-none",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-ring/60 focus-visible:ring-ring/25 focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/25",
        "dark:[color-scheme:dark]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-input bg-background flex min-h-16 w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-[color,box-shadow] outline-none",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-ring/60 focus-visible:ring-ring/25 focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
