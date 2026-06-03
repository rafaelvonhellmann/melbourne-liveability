import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Terms of Use · Melbourne Liveability",
  description:
    "The terms under which you may use liveable.melbourne, including data accuracy, acceptable use, intellectual property, and liability.",
};

const UPDATED = "2026-06-01";

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Terms of Use</h1>
        <p className="mt-1 text-xs text-ink-muted">Last updated {UPDATED}</p>

        <div className="mt-4 rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] p-3 text-sm text-[#9A552F]">
          <strong>Draft - not yet legal advice.</strong> An honest first draft reflecting how
          the site works today. Have it reviewed by a qualified Australian lawyer before
          relying on it, especially before charging for any paid tier.
        </div>

        <Section title="1. Acceptance">
          <p>
            By using liveable.melbourne (the &ldquo;Service&rdquo;) you agree to these Terms.
            If you do not agree, please do not use the Service.
          </p>
        </Section>

        <Section title="2. What the Service is">
          <p>
            The Service compiles Australian government and other official open data into an
            accessible liveability map and place profiles. It is an{" "}
            <strong className="text-ink">information and data-access tool</strong>. Scores
            are percentile-ranked lenses over open data, presented for general information.
          </p>
        </Section>

        <Section title="3. Not advice">
          <p>
            The Service is <strong className="text-ink">not relocation, financial,
            investment, legal, or professional advice</strong>, and creates no
            client/adviser relationship. Underlying data is approximate, aggregated, and
            often lagged. Always verify anything important against primary sources before
            making decisions. See the{" "}
            <Link href="/disclaimer" className="text-accent hover:underline">
              Disclaimer
            </Link>{" "}
            and{" "}
            <Link href="/methodology" className="text-accent hover:underline">
              Methodology
            </Link>
            .
          </p>
        </Section>

        <Section title="4. Acceptable use">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Use the Service lawfully and do not attempt to disrupt or attack it.</li>
            <li>
              Do not misrepresent the data as official, authoritative, or endorsed by the
              data publishers.
            </li>
            <li>
              Do not scrape at a volume that degrades the Service for others; the underlying
              open datasets are available from their original publishers.
            </li>
          </ul>
        </Section>

        <Section title="5. Intellectual property & attribution">
          <p>
            The underlying datasets remain the property of their publishers and are licensed
            openly - ABS, PTV, VCSA and Victorian government data under{" "}
            <strong className="text-ink">CC BY 4.0</strong>, and map / point data ©
            OpenStreetMap contributors under <strong className="text-ink">ODbL</strong>. We
            charge only for tooling, presentation, and derived analysis - never for reselling
            the open data - and we retain attribution. Our own site design, code, and
            compiled presentation are ours; please do not copy them wholesale.
          </p>
        </Section>

        <Section title="6. Paid features (when offered)">
          <p>
            The core map and all liveability data remain free. Any future paid tier (e.g.
            synced lists, exports, area report cards) will be described at point of purchase,
            with its own billing terms. Nothing here obliges us to keep any particular paid
            feature available.
          </p>
        </Section>

        <Section title="7. No warranty">
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of accuracy,
            completeness, currency, or fitness for a particular purpose, to the extent
            permitted by law. Certain consumer guarantees under the Australian Consumer Law
            may apply and are not excluded.
          </p>
        </Section>

        <Section title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by law, we are not liable for any loss or damage
            arising from reliance on the Service or its data. Where liability cannot be
            excluded, it is limited to re-supplying the Service.
          </p>
        </Section>

        <Section title="9. Changes & governing law">
          <p>
            We may update these Terms; the &ldquo;last updated&rdquo; date will change.
            These Terms are governed by the laws of Victoria, Australia. Questions: use the
            in-app <strong className="text-ink">Feedback</strong> button.
          </p>
        </Section>
      </div>
      <SiteFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}
