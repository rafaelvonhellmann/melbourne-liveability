/**
 * Privacy-friendly, cookieless analytics (Plausible), env-gated + opt-in.
 *
 * No `NEXT_PUBLIC_ANALYTICS_DOMAIN` set => no script loads => ZERO tracking
 * (the default, matching the privacy policy). When a domain is configured the
 * Plausible script is loaded in the root layout; `track()` then records
 * aggregate, no-PII, no-cookie custom events. `track()` is always safe to call —
 * it no-ops when analytics is absent.
 */
export const ANALYTICS_DOMAIN = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN;

type EventProps = Record<string, string | number | boolean>;

export function track(event: string, props?: EventProps): void {
  if (typeof window === "undefined") return;
  const plausible = (
    window as unknown as { plausible?: (e: string, o?: { props: EventProps }) => void }
  ).plausible;
  if (typeof plausible === "function") plausible(event, props ? { props } : undefined);
}
