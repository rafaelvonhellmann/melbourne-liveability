export type MmmSa1Row = Record<string, unknown>;

export type MmmSa2Rollup = {
  code: number;
  name: string | null;
  note: string;
  totalSa1: number;
  modalSa1: number;
  spread: number[];
};

function field(row: MmmSa1Row, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return undefined;
}

export function sa1ToSa2Code(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(0, 9) : null;
}

export function parseMmmCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7) {
    return value;
  }
  const match = String(value ?? "").match(/[1-7]/);
  if (!match) return null;
  return Number(match[0]);
}

export function rollupMmmSa1ToSa2(rows: MmmSa1Row[]): Map<string, MmmSa2Rollup> {
  const grouped = new Map<
    string,
    Map<number, { count: number; name: string | null }>
  >();

  for (const row of rows) {
    const sa2 = sa1ToSa2Code(field(row, ["SA1_CODE21", "sa1_code21"]));
    const code = parseMmmCode(field(row, ["MMM_CODE23", "mmm_code23"]));
    if (!sa2 || code == null) continue;

    const nameRaw = field(row, ["MMM_NAME23", "mmm_name23"]);
    const name = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : null;
    let counts = grouped.get(sa2);
    if (!counts) {
      counts = new Map();
      grouped.set(sa2, counts);
    }
    const current = counts.get(code);
    counts.set(code, {
      count: (current?.count ?? 0) + 1,
      name: current?.name ?? name,
    });
  }

  const out = new Map<string, MmmSa2Rollup>();
  for (const [sa2, counts] of grouped) {
    const ranked = [...counts.entries()].sort(
      (a, b) => b[1].count - a[1].count || a[0] - b[0]
    );
    const [code, modal] = ranked[0];
    const totalSa1 = ranked.reduce((sum, [, v]) => sum + v.count, 0);
    const spread = ranked.map(([k]) => k).sort((a, b) => a - b);
    const spreadText = spread.map((v) => `MM${v}`).join("/");
    const modalLabel = modal.name ? `${modal.name} (MM${code})` : `MM${code}`;
    const note =
      spread.length > 1
        ? `${modalLabel}; SA1 modal ${modal.count}/${totalSa1}, SA2 spans ${spreadText}`
        : `${modalLabel}; SA1 modal ${modal.count}/${totalSa1}`;
    out.set(sa2, {
      code,
      name: modal.name,
      note,
      totalSa1,
      modalSa1: modal.count,
      spread,
    });
  }

  return out;
}
