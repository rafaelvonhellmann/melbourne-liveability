import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 text-slate-300">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">
        ← Map
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100">Disclaimer</h1>
      <p className="mt-4">
        This tool is for general information only. It is not relocation, financial,
        or legal advice. Scores use approximate and lagged government open data;
        verify important decisions with primary sources.
      </p>
      <p className="mt-4">
        Crime rates can overstate inner areas with large daytime populations. Hazard
        and health layers may be spatially coarse. See methodology for licences and
        update dates.
      </p>
    </div>
  );
}
