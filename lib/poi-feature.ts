import { POI_CATEGORY_BY_ID, type PoiCategoryId } from "@/lib/poi-categories";

export type PoiFeatureProps = {
  pinType: string;
  name: string;
  url?: string;
  osmUrl?: string;
};

export function poiCategoryLabel(pinType: string): string {
  const cat = POI_CATEGORY_BY_ID[pinType as PoiCategoryId];
  return cat?.label ?? pinType.replace(/_/g, " ");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns the URL only if it is a safe http(s) link, else null. POI website
 * values come from community OpenStreetMap tags, so a hostile `website` tag
 * could carry a `javascript:` (or `data:`) URI that would execute on click even
 * though escapeHtml prevents attribute breakout. Restrict to http/https.
 */
export function safeHttpUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export function buildPoiPopupHtml(props: PoiFeatureProps): string {
  const name = escapeHtml(props.name?.trim() || "Unnamed place");
  const category = escapeHtml(poiCategoryLabel(props.pinType));
  const links: string[] = [];

  const websiteUrl = safeHttpUrl(props.url);
  if (websiteUrl) {
    const href = escapeHtml(websiteUrl);
    links.push(
      `<a class="poi-popup-link" href="${href}" target="_blank" rel="noopener noreferrer">Visit website</a>`
    );
  }
  const osmHref = safeHttpUrl(props.osmUrl);
  if (osmHref) {
    const href = escapeHtml(osmHref);
    links.push(
      `<a class="poi-popup-link poi-popup-link--muted" href="${href}" target="_blank" rel="noopener noreferrer">View on OpenStreetMap</a>`
    );
  }

  const linksBlock =
    links.length > 0
      ? `<div class="poi-popup-links">${links.join("")}</div>`
      : `<p class="poi-popup-note">No website listed in OpenStreetMap for this point.</p>`;

  return `<div class="poi-popup">
  <p class="poi-popup-category">${category}</p>
  <p class="poi-popup-name">${name}</p>
  ${linksBlock}
  <p class="poi-popup-source">Context only - not used in scores</p>
</div>`;
}
