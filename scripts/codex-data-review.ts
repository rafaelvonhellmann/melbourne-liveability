/**
 * Codex-driven data + reference audit - the deeper, human-in-the-loop half of the
 * double-check (the always-on automated half is scripts/verify-sources.ts).
 * Invokes the local Codex CLI to cross-check our headline data claims + the source
 * manifest against authoritative public sources (ABS, Vicmap, Vicplan, VCSA, DEECA)
 * and write findings to CODEX-DATA-REVIEW.md.
 *
 *   npm run data:codex-review
 *
 * This is a REVIEW aid, not a CI gate (it can't run headless everywhere) -
 * verify-sources.ts is the gate. `--disable image_generation` avoids the known
 * gpt-image tool crash; `-s workspace-write` lets Codex write the review file only.
 */
import { spawn } from "node:child_process";
import { ROOT } from "./lib/paths.js";

const PROMPT = [
  "You are auditing the DATA and CITATIONS of liveable.melbourne / Buyer Check, a",
  "static Melbourne property-liveability app. Goal: catch any figure or claim that is",
  "unsupported, mislabelled, stale, or overstated relative to its cited source.",
  "",
  "Steps:",
  "1. Read data/generated/sources.json (manifest) and lib/source-manifest.ts.",
  "2. Read lib/buyer-report.ts, scripts/normalize.ts and scripts/score.ts to list the",
  "   headline CLAIMS (scored domains + buyer findings) and the sourceId each cites.",
  "3. For each claim, confirm the cited source supports it. Where possible cross-check",
  "   the figure/definition on the web against the authoritative source (ABS Census /",
  "   Data by Region, ABS ERP, Vicmap, Vicplan overlays, VCSA crime, DEECA coasts).",
  "4. Flag: claims with no real backing source; wrong period/licence/url; definitions",
  "   that overstate precision (e.g. an SA2 area-share implied as a parcel result);",
  "   anything that reads as fabricated or not reproducible from the cited data.",
  "",
  "Write findings to CODEX-DATA-REVIEW.md as a markdown table:",
  "Claim | Cited source | Verdict (supported / weak / unsupported) | Evidence or URL |",
  "Recommended fix. Be specific and conservative - if you cannot verify a figure, say",
  "so rather than guessing. Do NOT modify app code; only write the review file.",
].join("\n");

// Codex reads the prompt from STDIN when the positional prompt is "-", which
// avoids any multi-line/quoting issues. On Windows the npm shim is codex.cmd and
// Node 24 refuses to spawn a .cmd without a shell, so use shell:true there (and
// quote the cwd path for the shell); on POSIX spawn codex directly.
const isWin = process.platform === "win32";
const child = spawn(
  "codex",
  [
    "exec",
    "--disable",
    "image_generation",
    "-s",
    "workspace-write",
    "-C",
    isWin ? `"${ROOT}"` : ROOT,
    "-",
  ],
  { stdio: ["pipe", "inherit", "inherit"], shell: isWin }
);
child.on("error", (e) => {
  console.error(
    "Could not launch the Codex CLI (install it - see the codex:setup skill):",
    (e as Error).message
  );
  process.exit(2);
});
child.stdin?.write(PROMPT);
child.stdin?.end();
child.on("exit", (code) => process.exit(code ?? 0));
