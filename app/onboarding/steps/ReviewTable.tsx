"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Pencil, ArrowRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export type ReviewItem = {
  id: string;
  name: string;
  estimated_hours: number | null;
  start_date: string | null;
  deadline: string | null;
};

type Props = {
  items: ReviewItem[];
  importSource: "ai" | "csv";
  onBack: () => void;
};

let _nextId = 1;
function makeId() {
  return `row-${_nextId++}`;
}

type EditingCell = { rowId: string; field: keyof ReviewItem } | null;

export function ReviewTable({ items: initialItems, importSource, onBack }: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState<ReviewItem[]>(() =>
    initialItems.map((item) => ({ ...item, id: makeId() }))
  );
  const [editingCell, setEditingCell] = React.useState<EditingCell>(null);
  const [editValue, setEditValue] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  function startEdit(rowId: string, field: keyof ReviewItem, currentValue: string) {
    setEditingCell({ rowId, field });
    setEditValue(currentValue);
  }

  function commitEdit() {
    if (!editingCell) return;
    const { rowId, field } = editingCell;
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;
        if (field === "name") return { ...row, name: editValue };
        if (field === "estimated_hours") {
          const num = parseFloat(editValue);
          return { ...row, estimated_hours: Number.isFinite(num) ? num : null };
        }
        if (field === "start_date" || field === "deadline") {
          return { ...row, [field]: editValue.trim() || null };
        }
        return row;
      })
    );
    setEditingCell(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditingCell(null);
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: makeId(), name: "New project", estimated_hours: null, start_date: null, deadline: null },
    ]);
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/work-items/bulk-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: rows.map(({ name, estimated_hours, start_date, deadline }) => ({
              name,
              estimated_hours,
              start_date,
              deadline,
            })),
            import_source: importSource,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to save");
        }

        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save projects");
      }
    });
  }

  function renderCell(row: ReviewItem, field: keyof ReviewItem) {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
    const value =
      field === "estimated_hours"
        ? row.estimated_hours != null
          ? String(row.estimated_hours)
          : ""
        : String((row[field] as string | null) ?? "");

    if (isEditing) {
      return (
        <Input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="h-7 text-xs"
          placeholder={field === "estimated_hours" ? "e.g. 40" : field === "name" ? "Project name" : "YYYY-MM-DD"}
        />
      );
    }

    const isEmpty = !value;
    return (
      <button
        type="button"
        onClick={() => startEdit(row.id, field, value)}
        className={`group flex items-center gap-1 w-full text-left text-sm rounded px-1 py-0.5 hover:bg-muted/60 transition-colors ${
          isEmpty ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        <span className="flex-1 truncate">{isEmpty ? "—" : value}</span>
        <Pencil className="size-3 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="space-y-5 text-left">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Review your projects</h2>
        <p className="text-sm text-muted-foreground">
          Edit any field inline, remove rows you don&apos;t need, or add missing ones.
        </p>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="text-left font-medium px-3 py-2 w-[35%]">Project name</th>
              <th className="text-left font-medium px-3 py-2 w-[15%]">Est. hours</th>
              <th className="text-left font-medium px-3 py-2 w-[20%]">Start date</th>
              <th className="text-left font-medium px-3 py-2 w-[20%]">Deadline</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-sm text-muted-foreground text-left">
                  No rows — add one below
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/20">
                <td className="px-3 py-1.5">{renderCell(row, "name")}</td>
                <td className="px-3 py-1.5">{renderCell(row, "estimated_hours")}</td>
                <td className="px-3 py-1.5">{renderCell(row, "start_date")}</td>
                <td className="px-3 py-1.5">{renderCell(row, "deadline")}</td>
                <td className="px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRow(row.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={isPending}
      >
        <Plus className="size-4 mr-1" />
        Add row
      </Button>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleConfirm} disabled={isPending}>
          {isPending
            ? "Saving…"
            : `Add ${rows.length} project${rows.length !== 1 ? "s" : ""} to Klira`}
          {!isPending && <ArrowRight className="size-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-md text-muted-foreground"
          onClick={onBack}
          disabled={isPending}
        >
          <ArrowLeft className="size-4" />
          Go back
        </Button>
      </div>
    </div>
  );
}
