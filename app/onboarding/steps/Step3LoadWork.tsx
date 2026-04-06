"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, FileSpreadsheet, PenLine, Download, FolderOpen, ArrowRight, ArrowLeft } from "lucide-react";
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from "@/components/ui/item";
import { ReviewTable, type ReviewItem } from "./ReviewTable";

type Method = "picker" | "ai" | "csv" | "review-ai" | "review-csv";

type Props = {
  teamId: string;
};

export function Step3LoadWork({ teamId: _teamId }: Props) {
  const router = useRouter();
  const [view, setView] = React.useState<Method>("picker");
  const [reviewItems, setReviewItems] = React.useState<ReviewItem[]>([]);
  const [importSource, setImportSource] = React.useState<"ai" | "csv">("ai");

  // AI import state
  const [aiText, setAiText] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);

  // CSV import state
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [csvLoading, setCsvLoading] = React.useState(false);

  // "Skip" — manual entry (mark onboarding complete immediately)
  const [skipPending, startSkipTransition] = React.useTransition();

  function handleSkip() {
    startSkipTransition(async () => {
      try {
        const res = await fetch("/api/work-items/bulk-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [], import_source: "manual" }),
        });
        if (!res.ok) throw new Error("Failed to complete onboarding");
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  async function handleAiSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/onboarding/ai-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: aiText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI import failed");
      setReviewItems(
        (data as ReviewItem[]).map((item, i) => ({ ...item, id: `ai-${i}` }))
      );
      setImportSource("ai");
      setView("review-ai");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse text");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [".csv", ".xlsx", ".xls"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      toast.error("Please upload a .csv, .xlsx, or .xls file");
      return;
    }

    setCsvLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/onboarding/csv-import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "CSV import failed");
      if (!Array.isArray(data) || data.length === 0) {
        toast.error("No valid rows found in the file");
        return;
      }
      setReviewItems(
        (data as ReviewItem[]).map((item, i) => ({ ...item, id: `csv-${i}` }))
      );
      setImportSource("csv");
      setView("review-csv");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setCsvLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Method picker ──────────────────────────────────────────────────────────
  if (view === "picker") {
    return (
      <div className="space-y-8 text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Load your work</h1>
          <p className="text-muted-foreground">
            Get your team&apos;s current projects into Klyra. Choose how you&apos;d like to add them.
          </p>
        </div>

        <div className="space-y-2">
          <Item
            asChild
            variant="outline"
            className="w-full cursor-pointer justify-start text-left hover:bg-muted/40 hover:border-foreground/30 transition-colors"
          >
            <button type="button" onClick={() => setView("ai")}>
              <ItemMedia variant="icon">
                <Sparkles />
              </ItemMedia>
              <ItemContent className="min-w-0 items-start text-left">
                <ItemTitle className="w-full text-left">Describe your work</ItemTitle>
                <ItemDescription className="w-full text-left text-pretty">
                  Tell us what your team is working on in plain language — AI will parse it.
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>

          <Item
            asChild
            variant="outline"
            className="w-full cursor-pointer justify-start text-left hover:bg-muted/40 hover:border-foreground/30 transition-colors"
          >
            <button type="button" onClick={() => setView("csv")}>
              <ItemMedia variant="icon">
                <FileSpreadsheet />
              </ItemMedia>
              <ItemContent className="min-w-0 items-start text-left">
                <ItemTitle className="w-full text-left">Upload a file</ItemTitle>
                <ItemDescription className="w-full text-left text-pretty">
                  Import projects from a CSV or Excel spreadsheet.
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>

          <Item
            asChild
            variant="outline"
            className="w-full cursor-pointer justify-start text-left hover:bg-muted/40 hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <button type="button" onClick={handleSkip} disabled={skipPending}>
              <ItemMedia variant="icon">
                <PenLine />
              </ItemMedia>
              <ItemContent className="min-w-0 items-start text-left">
                <ItemTitle className="w-full text-left">
                  {skipPending ? "Setting up…" : "I'll add it manually"}
                </ItemTitle>
                <ItemDescription className="w-full text-left text-pretty">
                  Skip to the dashboard and add projects there.
                </ItemDescription>
              </ItemContent>
            </button>
          </Item>
        </div>
      </div>
    );
  }

  // ── AI text input ──────────────────────────────────────────────────────────
  if (view === "ai") {
    return (
      <div className="space-y-6 text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Describe your work</h1>
          <p className="text-muted-foreground">
            Write naturally — don&apos;t worry about format.
          </p>
        </div>

        <form onSubmit={handleAiSubmit}>
          <InputGroup className="rounded-xl bg-muted/60 border-border has-[[data-slot=input-group-control]:focus-visible]:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-foreground/25 has-[[data-slot=input-group-control]:focus-visible]:shadow-sm">
            <InputGroupTextarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder={`Tell us what your team is currently working on. Don't worry about format — just describe it naturally.\n\ne.g. We're redesigning a client's e-commerce site, around 60 hours of work, started last week and due by end of April. Also have a logo project, roughly 15 hours, needs to be done by the 20th…`}
              className="min-h-[200px] text-sm resize-y"
              disabled={aiLoading}
            />
            <InputGroupAddon align="block-end" className="border-t justify-between px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-md text-muted-foreground"
                onClick={() => setView("picker")}
                disabled={aiLoading}
              >
                <ArrowLeft className="size-4" />
                Go back
              </Button>
              <InputGroupButton
                type="submit"
                size="sm"
                variant={aiText.trim() ? "default" : "ghost"}
                disabled={aiLoading || !aiText.trim()}
              >
                {aiLoading ? "Analysing…" : "Parse my projects"}
                {!aiLoading && <ArrowRight className="size-4" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          {aiLoading && (
            <p className="text-left text-sm text-muted-foreground animate-pulse">
              Analysing your work…
            </p>
          )}
        </form>
      </div>
    );
  }

  // ── CSV upload ─────────────────────────────────────────────────────────────
  if (view === "csv") {
    return (
      <div className="space-y-6 text-left">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Upload a file</h1>
          <p className="text-muted-foreground">
            Upload a CSV or Excel file with your projects.
          </p>
        </div>

        <div className="rounded-md border border-dashed p-6 space-y-4 text-left">
          <div className="space-y-2">
            <p className="text-sm font-medium">Need a template?</p>
            <a
              href="/api/onboarding/csv-template"
              download="Klyra-import-template.xlsx"
              className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2 text-foreground hover:text-foreground/80"
            >
              <Download className="size-3.5" />
              Download template (.xlsx)
            </a>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5 mt-2 [list-style-position:outside]">
              <li>Dates: YYYY-MM-DD or DD/MM/YYYY</li>
              <li>Hours: a number (e.g. 40, not "40h")</li>
              <li>Leave cells blank if unknown</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Upload your file</p>
            <label
              htmlFor="csv-upload"
              className={`flex flex-col items-start gap-2 rounded-md border-2 border-dashed border-border p-8 cursor-pointer hover:border-foreground/30 hover:bg-muted/30 transition-colors ${
                csvLoading ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <FolderOpen className="size-6 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground text-left">
                {csvLoading ? "Parsing file…" : "Click to browse or drag and drop"}
              </span>
              <span className="text-xs text-muted-foreground text-left">.csv, .xlsx, .xls accepted</span>
            </label>
            <input
              id="csv-upload"
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={handleFileChange}
              disabled={csvLoading}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="rounded-md text-muted-foreground"
          onClick={() => setView("picker")}
          disabled={csvLoading}
        >
          <ArrowLeft className="size-4" />
          Go back
        </Button>
      </div>
    );
  }

  // ── Review table (shared for AI and CSV) ───────────────────────────────────
  if (view === "review-ai" || view === "review-csv") {
    return (
      <ReviewTable
        items={reviewItems}
        importSource={importSource}
        onBack={() => setView(importSource === "ai" ? "ai" : "csv")}
      />
    );
  }

  return null;
}
