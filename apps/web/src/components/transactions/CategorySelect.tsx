import type { CategoryOption } from "@advantage/db";

import { CategoryIcon } from "@/components/common/CategoryChip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Groups are selectable headings, subcategories are indented beneath them, so
 * one control covers both levels of the taxonomy.
 */
export function CategorySelect({
  options,
  value,
  onChange,
  placeholder = "Pick a category",
  id,
}: {
  options: CategoryOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const selected = options.find((option) => option.id === value);
  const groups = options.filter((option) => option.depth === 0);

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label="Category">
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <CategoryIcon icon={selected.icon} color={selected.color} size="sm" />
            <span className="truncate font-medium">{selected.name}</span>
            {selected.parentName ? (
              <span className="text-muted-foreground shrink-0 text-[12px]">
                in {selected.parentName}
              </span>
            ) : null}
          </span>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>

      <SelectContent className="max-h-[22rem]">
        {groups.map((group) => {
          const children = options.filter((option) => option.parentId === group.id);
          return (
            <SelectGroup key={group.id}>
              <SelectLabel className="flex items-center gap-2 normal-case">
                <CategoryIcon icon={group.icon} color={group.color} size="sm" />
                <span className="text-foreground text-[12.5px] font-bold tracking-normal">
                  {group.name}
                </span>
              </SelectLabel>

              <SelectItem value={group.id} className="pl-9 text-[13px]">
                Anything in {group.name}
              </SelectItem>

              {children.map((child) => (
                <SelectItem key={child.id} value={child.id} className="pl-9">
                  {child.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
