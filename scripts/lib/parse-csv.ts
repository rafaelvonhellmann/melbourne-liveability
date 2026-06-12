export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/**
 * Minimal GTFS CSV row parser (handles quoted fields).
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function csvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < header.length) continue;
    rows.push(cols);
  }
  return rows;
}

export function csvTable(text: string): Record<string, string>[] {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  // Trim header cells: real feeds ship headers like "stop_id, stop_lat" with
  // stray spaces (Transperth GTFS), which would silently break keyed lookups.
  const header = parseCsvLine(lines[0]).map((h) => stripBom(h).trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cols[j] ?? "";
    out.push(row);
  }
  return out;
}

export function gtfsTimeSeconds(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (!Number.isFinite(h) || h > 48) return null;
  return h * 3600 + min * 60 + s;
}
