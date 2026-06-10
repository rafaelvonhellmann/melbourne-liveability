import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "Festra - privacy policy",
  description:
    "What data Festra collects, how it is used, third parties involved, and your rights under the Australian Privacy Act.",
};

const UPDATED = "2026-06-10";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Map
        </Link>
        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">Privacy Policy</h1>
        <p className="mt-1 text-xs text-ink-muted">Last updated {UPDATED}</p>

        <DraftNotice />

        <Section title="1. Who we are">
          <p>
            Festra (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a free tool that
            compiles Australian government open data into a liveability map of Greater
            Melbourne. This policy explains what personal information we handle and how,
            consistent with the <strong className="text-ink">Australian Privacy Act 1988
            (Cth)</strong> and the Australian Privacy Principles (APPs).
          </p>
        </Section>

        <Section title="2. What we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">On-device preferences (no account needed).</strong>{" "}
              Your chosen lens/persona, priority weights, suburb shortlist, and recently
              viewed areas are stored in your browser&apos;s <code className="text-xs">localStorage</code>{" "}
              only. They stay on your device, are not transmitted to us, and you can clear
              them any time from the{" "}
              <Link href="/account" className="text-accent hover:underline">
                Your data
              </Link>{" "}
              page or your browser settings.
            </li>
            <li>
              <strong className="text-ink">Email address - only if you provide it.</strong>{" "}
              If you send feedback, we collect the email address you enter (it is
              optional), along with your message and the page you were on. We use it
              solely to respond. Email update alerts are not yet available - they will
              arrive with optional accounts, and we will update this policy before
              launching them.
            </li>
            <li>
              <strong className="text-ink">Standard server logs.</strong> Our static host
              and content-delivery / map-tile providers may log technical data (IP address,
              browser type, timestamps) to deliver and secure the site, as is standard for
              any website.
            </li>
          </ul>
          <p className="mt-3">
            We do <strong className="text-ink">not</strong> run user accounts or logins, do
            not collect payment information, do not show advertising, and do not run
            behavioural ad-tracking.
          </p>
        </Section>

        <Section title="3. Third parties (data processors)">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-ink">Form handling.</strong> When configured,
              feedback is delivered via Formspree, a third-party form processor based in
              the United States, which receives the email and message you submit in
              order to forward it to us. When no form processor is configured, the
              feedback button may instead open your own email app (a local mailto link),
              in which case nothing passes through a third party.
            </li>
            <li>
              <strong className="text-ink">Hosting &amp; map tiles.</strong> The site is
              served as static files by our host; the base map is loaded from a map-tile
              provider and © OpenStreetMap contributors. These providers may receive your
              IP address to serve content.
            </li>
          </ul>
          <p className="mt-3">
            We never sell your personal information. We only share it with the processors
            above to provide the features you request.
          </p>
        </Section>

        <Section title="4. Analytics">
          <p>
            We may run <strong className="text-ink">privacy-friendly, cookieless
            analytics</strong> (Plausible-style) to count page views in aggregate. If
            enabled: no cookies, no personal data stored, no cross-site tracking, no
            behavioural profiles - just anonymous, aggregate counts (e.g. how many people
            viewed a page), which cannot identify you. If it is not enabled, no analytics
            run at all.
          </p>
        </Section>

        <Section title="5. How we use it">
          <p>
            To send the update alerts or feedback responses you request, to operate and
            secure the site, and to improve the data and features (for example, acting on a
            data-problem report). On-device preferences exist purely to personalise your own
            view.
          </p>
        </Section>

        <Section title="6. Retention">
          <p>
            On-device preferences persist until you clear them. Email addresses provided for
            alerts are kept until you unsubscribe or ask us to delete them; feedback
            messages are kept while we act on them.
          </p>
        </Section>

        <Section title="7. Your rights">
          <p>
            Under the APPs you may request access to, correction of, or deletion of personal
            information we hold about you, and you can unsubscribe from alerts at any time.
            To exercise these, use the{" "}
            <strong className="text-ink">Feedback</strong> button or the contact below. You
            can delete all on-device data yourself from the{" "}
            <Link href="/account" className="text-accent hover:underline">
              Your data
            </Link>{" "}
            page.
          </p>
        </Section>

        <Section title="8. Children">
          <p>
            The service is intended for a general adult audience (movers / renters) and is
            not directed at children.
          </p>
        </Section>

        <Section title="9. Changes & contact">
          <p>
            We may update this policy; the “last updated” date above will change. Questions
            or privacy requests: use the in-app{" "}
            <strong className="text-ink">Feedback</strong> button. If a complaint is not
            resolved, you may contact the{" "}
            <a
              href="https://www.oaic.gov.au/"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Office of the Australian Information Commissioner (OAIC)
            </a>
            .
          </p>
        </Section>

        <p className="mt-8 text-xs text-ink-muted">
          See also our{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link href="/disclaimer" className="text-accent hover:underline">
            Disclaimer
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}

function DraftNotice() {
  return (
    <div className="mt-4 rounded-lg border border-[#E9C8B4] bg-[#FBEEE6] p-3 text-sm text-[#9A552F]">
      <strong>Draft - not yet legal advice.</strong> This policy is an honest first draft
      reflecting how the site currently works. Have it reviewed by a qualified
      Australian privacy lawyer before relying on it, especially before enabling
      accounts or payments.
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
