// Report exports, all generated in the browser (no extra libraries):
// CSV, Excel (SpreadsheetML workbook with a sheet per section), Word (an
// HTML document Word opens and edits) and a print-ready page for PDF.
import type { Cell, Column, Report } from "./model";

export function formatCell(col: Column, v: Cell | undefined): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "string") return v;
  switch (col.kind) {
    case "money":
      return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "percent":
      return `${v}%`;
    case "rating":
      return `${v} ★`;
    case "number":
      return v.toLocaleString("en-PH");
    default:
      return String(v);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function dateLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function generatedLabel(r: Report) {
  return new Date(r.generatedAt).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fileBase(r: Report) {
  return `${r.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}_${r.period.from}_to_${r.period.to}`;
}

// ── CSV ────────────────────────────────────────────────────────────────

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Raw values (numbers unformatted) so spreadsheets can calculate. */
export function toCsv(r: Report): string {
  const lines: string[] = [csvCell(r.title), ...r.filtersUsed.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`), `Generated,${csvCell(generatedLabel(r))}`, ""];
  if (r.summary.length) {
    lines.push("Summary");
    for (const s of r.summary) lines.push(`${csvCell(s.label)},${csvCell(s.value)}`);
    lines.push("");
  }
  for (const sec of r.sections) {
    lines.push(csvCell(sec.title));
    lines.push(sec.columns.map((c) => csvCell(c.label)).join(","));
    for (const row of sec.rows) lines.push(sec.columns.map((c) => csvCell(String(row[c.key] ?? ""))).join(","));
    lines.push("");
  }
  return "﻿" + lines.join("\r\n");
}

// ── Excel (SpreadsheetML 2003) ─────────────────────────────────────────

function sheetName(name: string, used: Set<string>) {
  const base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Sheet";
  let n = base;
  let i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

function xCell(v: Cell | undefined, col?: Column, style?: string) {
  const s = style ? ` ss:StyleID="${style}"` : "";
  if (typeof v === "number" && col?.kind !== "rating") {
    const st = col?.kind === "money" ? ' ss:StyleID="money"' : col?.kind === "percent" ? ' ss:StyleID="pct"' : s;
    const val = col?.kind === "percent" ? v / 100 : v;
    return `<Cell${st}><Data ss:Type="Number">${val}</Data></Cell>`;
  }
  return `<Cell${s}><Data ss:Type="String">${esc(v === undefined ? "" : String(v))}</Data></Cell>`;
}

export function toExcelXml(r: Report): string {
  const used = new Set<string>();
  const summaryRows = [
    `<Row>${xCell(r.title, undefined, "title")}</Row>`,
    `<Row>${xCell("Blush Spa & Aesthetics · GlowSync")}</Row>`,
    ...r.filtersUsed.map(([k, v]) => `<Row>${xCell(k, undefined, "head")}${xCell(v)}</Row>`),
    `<Row>${xCell("Generated", undefined, "head")}${xCell(generatedLabel(r))}</Row>`,
    "<Row></Row>",
    ...r.summary.map((s) => `<Row>${xCell(s.label, undefined, "head")}${xCell(s.value)}</Row>`),
    ...(r.findings.length ? ["<Row></Row>", `<Row>${xCell("Key Findings", undefined, "head")}</Row>`, ...r.findings.map((f) => `<Row>${xCell(f)}</Row>`)] : []),
  ];
  const sheets = [
    `<Worksheet ss:Name="${esc(sheetName("Summary", used))}"><Table><Column ss:Width="180"/><Column ss:Width="260"/>${summaryRows.join("")}</Table></Worksheet>`,
    ...r.sections.map((sec) => {
      const head = `<Row>${sec.columns.map((c) => xCell(c.label, undefined, "head")).join("")}</Row>`;
      const body = sec.rows.map((row) => `<Row>${sec.columns.map((c) => xCell(row[c.key], c)).join("")}</Row>`).join("");
      const cols = sec.columns.map(() => '<Column ss:Width="120"/>').join("");
      return `<Worksheet ss:Name="${esc(sheetName(sec.title, used))}"><Table>${cols}${head}${body}</Table></Worksheet>`;
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#7C5F18"/></Style>
<Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#F5E9DC" ss:Pattern="Solid"/></Style>
<Style ss:ID="money"><NumberFormat ss:Format="&quot;₱&quot;#,##0.00"/></Style>
<Style ss:ID="pct"><NumberFormat ss:Format="0.0%"/></Style>
</Styles>
${sheets.join("\n")}
</Workbook>`;
}

// ── Shared HTML (Word + PDF/print) ─────────────────────────────────────

function tableHtml(columns: Column[], rows: Record<string, Cell>[]) {
  const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const body = rows.length
    ? rows.map((row) => `<tr>${columns.map((c) => `<td class="${c.kind && c.kind !== "text" ? "num" : ""}">${esc(formatCell(c, row[c.key]))}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}" class="empty">No data for this period.</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function reportBody(r: Report, logoUrl: string | null) {
  const filters = r.filtersUsed.map(([k, v]) => `<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join("");
  const summary = r.summary.map((s) => `<div class="card"><div class="lbl">${esc(s.label)}</div><div class="val">${esc(s.value)}</div></div>`).join("");
  const findings = r.findings.length ? `<h2>Key Findings</h2><ul>${r.findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";
  const sections = r.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}${tableHtml(s.columns, s.rows)}`).join("");
  return `
<header>
  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="" class="logo"/>` : ""}
  <div><div class="brand">Blush Spa &amp; Aesthetics</div><div class="sub">GlowSync · Report</div></div>
</header>
<h1>${esc(r.title)}</h1>
<p class="period">${esc(dateLabel(r.period.from))} – ${esc(dateLabel(r.period.to))}</p>
<div class="filters">${filters}</div>
${summary ? `<h2>Summary</h2><div class="cards">${summary}</div>` : ""}
${findings}
${sections}
<p class="gen">Generated ${esc(generatedLabel(r))} · GlowSync</p>`;
}

const STYLES = `
body{font-family:Arial,Helvetica,sans-serif;color:#3b2a1f;margin:28px;font-size:12px}
header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #c9a44a;padding-bottom:10px;margin-bottom:14px}
.logo{width:44px;height:44px;border-radius:50%;object-fit:contain}
.brand{font-family:Georgia,serif;font-size:20px;color:#7c5f18}
.sub{font-size:11px;color:#8b7360}
h1{font-family:Georgia,serif;font-size:22px;margin:6px 0 2px;color:#3b2a1f}
h2{font-size:14px;color:#7c5f18;margin:18px 0 6px;border-bottom:1px solid #ead8c5;padding-bottom:3px}
.period{margin:0 0 8px;color:#654f3e}
.filters span{display:inline-block;margin:0 14px 4px 0;color:#654f3e}
.cards{display:flex;flex-wrap:wrap;gap:8px}
.card{border:1px solid #ead8c5;border-radius:8px;padding:8px 10px;min-width:130px;background:#fbf7ef}
.lbl{font-size:10px;color:#8b7360;text-transform:uppercase;letter-spacing:.04em}
.val{font-size:15px;font-weight:bold;margin-top:2px}
table{border-collapse:collapse;width:100%;margin-top:4px}
th{background:#f5e9dc;text-align:left;padding:5px 6px;font-size:11px;border:1px solid #ead8c5}
td{padding:4px 6px;border:1px solid #f1e5d6;font-size:11px;vertical-align:top}
td.num{text-align:right;white-space:nowrap}
td.empty{text-align:center;color:#8b7360}
.note{font-size:10px;color:#8b7360;margin:0 0 4px}
.gen{margin-top:20px;font-size:10px;color:#8b7360;text-align:right}
@media print{body{margin:12mm}h2{break-after:avoid}tr{break-inside:avoid}}
`;

export function toWordHtml(r: Report, logoUrl: string | null): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(r.title)}</title><style>${STYLES}</style></head>
<body>${reportBody(r, logoUrl)}</body></html>`;
}

export function toPrintHtml(r: Report, logoUrl: string | null): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>${STYLES}</style></head>
<body>${reportBody(r, logoUrl)}<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

// ── Download helpers (browser) ─────────────────────────────────────────

export function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportFormat = "pdf" | "excel" | "csv" | "word";

/** Returns false if the PDF window was blocked by the browser. */
export function exportReport(r: Report, format: ExportFormat): boolean {
  const logo = `${window.location.origin}/images/logo/cropblushicon2.png`;
  const base = fileBase(r);
  if (format === "csv") downloadText(toCsv(r), `${base}.csv`, "text/csv;charset=utf-8");
  else if (format === "excel") downloadText(toExcelXml(r), `${base}.xls`, "application/vnd.ms-excel");
  else if (format === "word") downloadText(toWordHtml(r, logo), `${base}.doc`, "application/msword");
  else {
    const w = window.open("", "_blank");
    if (!w) return false;
    w.document.open();
    w.document.write(toPrintHtml(r, logo));
    w.document.close();
  }
  return true;
}
