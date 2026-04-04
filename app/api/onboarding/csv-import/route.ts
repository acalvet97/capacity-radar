import { supabaseServer } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export type ParsedWorkItem = {
  name: string;
  estimated_hours: number | null;
  start_date: string | null;
  deadline: string | null;
};

/**
 * Normalise a date cell value to ISO 8601 (YYYY-MM-DD).
 * Accepts:
 *  - ISO 8601 strings: "2026-04-01"
 *  - DD/MM/YYYY strings: "01/04/2026"
 *  - Excel serial numbers (handled by XLSX.SSF.parse_date_code)
 */
function normaliseDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;

  if (typeof raw === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(raw);
    if (!date) return null;
    const y = String(date.y).padStart(4, "0");
    const m = String(date.m).padStart(2, "0");
    const d = String(date.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // DD/MM/YYYY
  const ddmm = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm) {
    const [, d, m, y] = ddmm;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // MM/DD/YYYY (less common but handle gracefully)
  const mmddy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddy) {
    const [, m, d, y] = mmddy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function normaliseHours(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    return NextResponse.json({ error: "Failed to parse file" }, { status: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ error: "File has no sheets" }, { status: 400 });
  }

  const sheet = workbook.Sheets[sheetName];
  // Use header:1 to get raw rows as arrays
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) {
    return NextResponse.json({ error: "File has no data rows" }, { status: 400 });
  }

  // Find the header row (first row that contains "Project Name" or similar)
  const headerRow = rows[0] as unknown[];
  const headers = headerRow.map((h) => String(h ?? "").toLowerCase().trim());

  function findCol(keywords: string[]): number {
    return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
  }

  const nameCol = findCol(["project name", "name", "project"]);
  const hoursCol = findCol(["estimated hours", "hours", "estimate"]);
  const startCol = findCol(["start date", "start"]);
  const deadlineCol = findCol(["deadline", "due date", "due", "end date"]);

  if (nameCol === -1) {
    return NextResponse.json(
      { error: "Could not find a 'Project Name' column" },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const items: ParsedWorkItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const name = String(row[nameCol] ?? "").trim();
    if (!name || name.toLowerCase().startsWith("example")) continue;

    items.push({
      name,
      estimated_hours: hoursCol >= 0 ? normaliseHours(row[hoursCol]) : null,
      start_date: (startCol >= 0 ? normaliseDate(row[startCol]) : null) ?? today,
      deadline: deadlineCol >= 0 ? normaliseDate(row[deadlineCol]) : null,
    });
  }

  return NextResponse.json(items);
}
