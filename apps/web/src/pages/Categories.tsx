import { ICON_CHOICES, type CategoryKind } from "@advantage/core";
import {
  archiveCategory,
  createCategory,
  updateCategory,
  type Category,
  type CategoryNode,
} from "@advantage/api-client";
import { CHART_SLOTS, slotColor } from "@advantage/theme";
import { Loader2, Plus, Tag, Trash2 } from "lucide-react";
import * as React from "react";

import { CategoryIcon } from "@/components/common/CategoryChip";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCategoryTree } from "@/hooks/useData";
import { useMutation } from "@/hooks/useLiveQuery";
import { iconFor } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useApi } from "@/providers/SessionProvider";

/**
 * Seven groups, each owning one chart hue, with subcategories beneath them.
 * That cap is the reason every breakdown chart in the app stays readable, so
 * the editor makes the structure visible rather than hiding it behind a flat
 * list.
 */
export function CategoriesPage() {
  const [kind, setKind] = React.useState<CategoryKind>("expense");
  const { data: tree } = useCategoryTree(kind);
  const [editing, setEditing] = React.useState<{ category: Category | null; parentId: string | null }>({
    category: null,
    parentId: null,
  });
  const [open, setOpen] = React.useState(false);

  function edit(category: Category | null, parentId: string | null = null) {
    setEditing({ category, parentId });
    setOpen(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Categories"
        description="Groups carry the color, subcategories carry the detail. Charts always roll up to the group."
        actions={
          <>
            <Tabs value={kind} onValueChange={(value) => setKind(value as CategoryKind)}>
              <TabsList>
                <TabsTrigger value="expense">Expense</TabsTrigger>
                <TabsTrigger value="income">Income</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={() => edit(null, null)}>
              <Plus />
              New group
            </Button>
          </>
        }
      />

      {tree.length === 0 ? (
        <Card>
          <EmptyState icon={Tag} title="No categories" description="Add a group to get started." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tree.map((group) => (
            <GroupCard key={group.id} group={group} onEdit={edit} />
          ))}
        </div>
      )}

      <CategoryDialog
        open={open}
        onOpenChange={setOpen}
        category={editing.category}
        parentId={editing.parentId}
        kind={kind}
        groups={tree}
      />
    </div>
  );
}

function GroupCard({
  group,
  onEdit,
}: {
  group: CategoryNode;
  onEdit: (category: Category | null, parentId: string | null) => void;
}) {
  const api = useApi();
  const { run, pending } = useMutation();

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <CategoryIcon icon={group.icon} color={group.color} size="lg" />
          <div className="min-w-0">
            <CardTitle className="truncate">{group.name}</CardTitle>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 text-[12px]">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ backgroundColor: slotColor(group.color) }}
              />
              {group.color ? `Color ${group.color.replace("chart-", "")}` : "No color"}{" "}
              &middot; {group.usageCount} {group.usageCount === 1 ? "record" : "records"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(group, null)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={() => void run(() => archiveCategory(api, group.id))}
            title="Archive group and its subcategories"
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-0.5">
          {group.children.map((child) => (
            <li key={child.id} className="flex items-center gap-2.5 rounded-md px-1 py-1">
              <CategoryIcon icon={child.icon} color={group.color} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{child.name}</span>
              {child.isSystem ? null : <Badge variant="outline">custom</Badge>}
              <Button variant="ghost" size="sm" onClick={() => onEdit(child, group.id)}>
                Edit
              </Button>
            </li>
          ))}
        </ul>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground mt-2"
          onClick={() => onEdit(null, group.id)}
        >
          <Plus />
          Add subcategory
        </Button>
      </CardContent>
    </Card>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  parentId,
  kind,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  parentId: string | null;
  kind: CategoryKind;
  groups: CategoryNode[];
}) {
  const api = useApi();
  const { run, pending, error } = useMutation();
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState<string>("Tag");
  const [color, setColor] = React.useState<string | null>(null);
  const [parent, setParent] = React.useState<string | null>(null);

  const isChild = Boolean(parent);

  React.useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? "Tag");
    setColor(category?.color ?? (category?.parentId || parentId ? null : "chart-1"));
    setParent(category?.parentId ?? parentId ?? null);
  }, [open, category, parentId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      kind,
      icon,
      color: isChild ? null : color,
      parentId: parent,
      isSystem: false,
      sortOrder: 99,
    };

    const saved = await run(async () => {
      if (category) await updateCategory(api, category.id, payload);
      else await createCategory(api, payload);
      return true;
    });
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>
              {category ? "Edit category" : isChild ? "New subcategory" : "New group"}
            </DialogTitle>
            <DialogDescription>
              {isChild
                ? "Subcategories inherit their group color, so charts stay consistent."
                : "A group owns one of the seven chart colors."}
            </DialogDescription>
          </DialogHeader>

          <Field label="Name" htmlFor="category-name">
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isChild ? "Water, Netflix, Grab" : "Bills & Utilities"}
            />
          </Field>

          <Field label="Inside group" hint="Leave as a group to give it its own color.">
            <Select
              value={parent ?? "__none__"}
              onValueChange={(value) => setParent(value === "__none__" ? null : value)}
            >
              <SelectTrigger aria-label="Parent group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Top level group</SelectItem>
                {groups
                  .filter((group) => group.id !== category?.id)
                  .map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>

          {!isChild ? (
            <Field label="Chart color">
              <div className="flex flex-wrap gap-2">
                {CHART_SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setColor(slot)}
                    aria-label={slot}
                    aria-pressed={color === slot}
                    className={cn(
                      "size-8 rounded-lg border-2 transition-transform",
                      color === slot ? "border-foreground scale-105" : "border-transparent",
                    )}
                    style={{ backgroundColor: slotColor(slot) }}
                  />
                ))}
              </div>
            </Field>
          ) : null}

          <Field label="Icon">
            <div className="border-border grid max-h-40 grid-cols-9 gap-1 overflow-y-auto rounded-lg border p-2">
              {ICON_CHOICES.map((name) => {
                const Icon = iconFor(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIcon(name)}
                    aria-label={name}
                    aria-pressed={icon === name}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md transition-colors",
                      icon === name
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </Field>

          {error ? <p className="text-destructive text-[13px] font-medium">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
