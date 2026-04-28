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

// Hotel IDs follow the convention used in the admin: short
// alphanumeric tokens with optional dashes/underscores. Reject
// anything else early so a malformed id never reaches the CDN
// fetch (and so request logs aren't peppered with garbage paths).
const ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

function extractIdFromScript() {
  const src = findSelfScript();
  if (!src) return null;
  try {
    const url = new URL(src);
    const id = (url.searchParams.get('id') || '').trim();
    return ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Normalize the raw config into the shape LeadGenWidget expects. All
 * fields are optional — undefined values let the component fall back
 * to its built-in defaults.
 */
// Reject href values that aren't a regular link target — most
// importantly `javascript:` and `data:`, which would execute in the
// host origin when clicked. Allow http(s), mailto, and the inert
// '#' default. Anything else falls back to '#'.
function safeHref(value) {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v || v === '#') return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^mailto:/i.test(v)) return v;
  return undefined;
}

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
    privacyPolicyUrl: safeHref(raw.privacyPolicyUrl),
    _preview: raw._preview === true,
  };
}

// Restrict preview-mode to the dedicated transparent.html iframe used
// by the admin app. Without this, an attacker could craft a phishing
// link `https://hotel.com/?preview=<base64>` that bypasses the
// remote-fetch path and injects an operator-controlled `message` —
// rendered via dangerouslySetInnerHTML in the host's origin.
function isPreviewHost() {
  if (typeof window === 'undefined') return false;
  return /\/transparent\.html$/i.test(window.location.pathname);
}

export function extractPreviewConfig() {
  if (!isPreviewHost()) return null;
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
    // Cap the fetch so a flapping CDN can't leave the widget in a
    // permanent loading state. 5s is generous for a static JSON.
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { credentials: 'omit', signal: ctrl.signal });
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
    } finally {
      clearTimeout(timeout);
    }
  }

  // Priority 3: inline override
  if (window.LEAD_WIDGET_CONFIG) {
    return normalizeConfig(window.LEAD_WIDGET_CONFIG);
  }

  // Priority 4: render with defaults
  return {};
}
