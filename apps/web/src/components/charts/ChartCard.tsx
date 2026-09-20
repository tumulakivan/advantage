import { Table2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Every chart ships with a table view. It is the accessibility fallback for a
 * colorblind or screen-reader reader, and it is also just the fastest way to
 * read an exact number off a bar.
 */
export function ChartCard({
  title,
  description,
  legend,
  table,
  actions,
  className,
  children,
}: {
  title: string;
  description?: string;
  legend?: React.ReactNode;
  table?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = React.useState(false);

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div className="min-w-0 flex-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {/* Wraps rather than shrink-0: the Outlook controls are wider than a
            phone, and a header that cannot yield pushes the whole page
            sideways. */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {actions}
          {table ? (
            <Button
              variant={showTable ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setShowTable((value) => !value)}
              aria-pressed={showTable}
              title={showTable ? "Show chart" : "Show the numbers"}
            >
              <Table2 />
              <span className="sr-only">Toggle table view</span>
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {showTable && table ? table : children}
        {legend && !showTable ? <div className="mt-4">{legend}</div> : null}
      </CardContent>
    </Card>
  );
}

/** Legend row: a swatch beside a text label, never color alone. */
export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; shape?: "square" | "line" }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="text-muted-foreground flex items-center gap-2 text-[12px] font-medium">
          <span
            aria-hidden="true"
            className={cn("shrink-0", item.shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]")}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
