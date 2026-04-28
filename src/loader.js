/**
 * Remote config loader for the lead-gen widget.
 *
 * Resolves the widget config from (in priority order):
 *   1. ?preview=<base64> on the host page URL  (admin live preview)
 *   2. ?id=xxx in the <script src>             (remote CDN fetch)
 *   3. window.LEAD_WIDGET_CONFIG               (inline override)
 *   4. {} — render with the component's defaults
 *
 * If remote fetch fails AND inline config exists, fall back to inline.
 */

const CONFIGS_BASE_URL = resolveConfigsBase();

function resolveConfigsBase() {
  const scripts = document.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].src || '';
    if (src.includes('widget.js')) {
      return src.replace(/widget\.js(?:\?.*)?$/, '') + 'configs/';
    }
  }
  return './configs/';
}

function findSelfScript() {
  if (document.currentScript && document.currentScript.src) {
    return document.currentScript.src;
  }
  const scripts = document.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].src || '';
    if (src.includes('widget.js')) return src;
  }
  return null;
}

function extractIdFromScript() {
  const src = findSelfScript();
  if (!src) return null;
  try {
    const url = new URL(src);
    const id = url.searchParams.get('id');
    return id && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Normalize the raw config into the shape LeadGenWidget expects. All
 * fields are optional — undefined values let the component fall back
 * to its built-in defaults.
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const pick = (k) =>
    typeof raw[k] === 'string' && raw[k].trim() ? raw[k] : undefined;
  // Image width: clamp to a usable range so a misconfigured value
  // can't push the content pane off-screen. Falls back to undefined
  // when missing so the component default (300) wins.
  let imageWidth;
  if (Number.isFinite(raw.imageWidth)) {
    imageWidth = Math.max(180, Math.min(500, Math.round(raw.imageWidth)));
  }

  return {
    _hotelId: raw._hotelId || null,
    title: pick('title'),
    message: pick('message'),
    imageUrl: pick('imageUrl'),
    imageAlt: pick('imageAlt'),
    imageWidth,
    buttonColor: pick('buttonColor'),
    buttonHoverColor: pick('buttonHoverColor'),
    buttonLabel: pick('buttonLabel'),
    privacyPolicyUrl: pick('privacyPolicyUrl'),
    _preview: raw._preview === true,
  };
}

export function extractPreviewConfig() {
  try {
    const params = new URLSearchParams(window.location.search);
    const b64 = params.get('preview');
    if (!b64) return null;
    const std = b64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = std.length % 4 === 0 ? '' : '='.repeat(4 - (std.length % 4));
    const binary = atob(std + pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch (err) {
    console.warn('[lead-widget] extractPreviewConfig failed', err);
    return null;
  }
}

export async function loadConfig() {
  // Priority 1: admin live preview
  const previewConfig = extractPreviewConfig();
  if (previewConfig) {
    previewConfig._hotelId = previewConfig._hotelId || 'preview';
    return normalizeConfig(previewConfig);
  }

  // Priority 2: remote config by ID
  const id = extractIdFromScript();
  if (id) {
    const url = `${CONFIGS_BASE_URL}${encodeURIComponent(id)}.json`;
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching config ${id}`);
      const raw = await res.json();
      raw._hotelId = id;
      return normalizeConfig(raw);
    } catch (err) {
      if (window.LEAD_WIDGET_CONFIG) {
        console.warn(
          `[lead-widget] Remote config '${id}' failed, falling back to inline.`,
          err
        );
        return normalizeConfig(window.LEAD_WIDGET_CONFIG);
      }
      throw err;
    }
  }

  // Priority 3: inline override
  if (window.LEAD_WIDGET_CONFIG) {
    return normalizeConfig(window.LEAD_WIDGET_CONFIG);
  }

  // Priority 4: render with defaults
  return {};
}
