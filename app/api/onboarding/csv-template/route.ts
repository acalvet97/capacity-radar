import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  const wb = XLSX.utils.book_new();

  // Instructions sheet
  const instructions = [
    ["Klira Import Template — Instructions"],
    [""],
    ["Fill in the 'Import' sheet with your projects."],
    ["Column format:"],
    ["  Project Name    — required, any text"],
    ["  Estimated Hours — a number (e.g. 40), not '40h'"],
    ["  Start Date      — YYYY-MM-DD or DD/MM/YYYY (leave blank if unknown)"],
    ["  Deadline        — YYYY-MM-DD or DD/MM/YYYY (leave blank if unknown)"],
    [""],
    ["Delete the example rows before importing."],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

  // Import sheet
  const data = [
    ["Project Name", "Estimated Hours", "Start Date", "Deadline"],
    ["Example: Website redesign", 60, "2026-04-01", "2026-04-30"],
    ["Example: Logo project", 15, "", "2026-04-20"],
  ];
  const wsImport = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  wsImport["!cols"] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, wsImport, "Import");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as unknown as ArrayBuffer;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Klira-import-template.xlsx"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
