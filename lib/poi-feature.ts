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

export function buildPoiPopupHtml(props: PoiFeatureProps): string {
  const name = escapeHtml(props.name?.trim() || "Unnamed place");
  const category = escapeHtml(poiCategoryLabel(props.pinType));
  const links: string[] = [];

  if (props.url) {
    const href = escapeHtml(props.url);
    links.push(
      `<a class="poi-popup-link" href="${href}" target="_blank" rel="noopener noreferrer">Visit website</a>`
    );
  }
  if (props.osmUrl) {
    const href = escapeHtml(props.osmUrl);
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
  <p class="poi-popup-source">Context only — not used in scores</p>
</div>`;
}
