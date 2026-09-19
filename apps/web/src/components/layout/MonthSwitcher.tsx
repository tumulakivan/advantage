import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMonth } from "@/hooks/useMonth";

export function MonthSwitcher() {
  const { label, isCurrent, step, toCurrent } = useMonth();

  return (
    <div className="border-border bg-card flex h-9 items-center gap-1 rounded-lg border px-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => step(-1)}
        aria-label="Previous month"
      >
        <ChevronLeft />
      </Button>

      <button
        type="button"
        onClick={toCurrent}
        disabled={isCurrent}
        className="min-w-[8.5rem] px-1 text-[13px] font-bold disabled:cursor-default"
        title={isCurrent ? "Showing this month" : "Jump to this month"}
      >
        {label}
      </button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => step(1)}
        aria-label="Next month"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
