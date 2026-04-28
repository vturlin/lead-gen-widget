# Lead-Gen Widget

An embeddable React popup that hotels paste into their direct-booking site
to capture newsletter opt-ins. The widget shows a centred (or corner-pinned)
card with a hotel-branded title, message, image and email field — and
funnels the visitor's address to the operator's CRM (D-EDGE CRM
integration coming).

<p align="center"><em>One script tag. Configurable trigger. GDPR-friendly.</em></p>

---

## How it works

1. The hotel deploys a config JSON (e.g. `hm_demo001.json`) describing the
   copy, image, button colors, privacy-policy link, position and trigger
   strategy. Configs are managed via the admin SPA (`hotel-widget-admin`)
   which publishes them to this repo's `public/configs/` directory.
2. The widget loads `widget.js?id=<hotelId>` on the host page, fetches the
   matching config from `configs/<id>.json`, and waits for its trigger
   (immediate / time / scroll / time_or_scroll).
3. When triggered, it shows the popup. The visitor enters an email,
   ticks the privacy consent checkbox, and submits.
4. The submission handler is a TODO — once the D-EDGE CRM endpoint is
   wired, the widget will POST `{ email, hotelId }` to it. For now the
   form transitions to the success state without persisting the email.

The widget itself is static (a CDN-served IIFE bundle). The CRM endpoint
will be the only backend dependency once integrated.

---

## Quick start (hotelier)

After `widget.js` is deployed to a CDN with a sibling `configs/<id>.json`,
paste this into any page:

```html
<div id="lead-widget"></div>
<script async src="https://your-cdn/widget.js?id=YOUR_HOTEL_ID"></script>
```

The mount point is optional — if no `#lead-widget` (or
`[data-lead-widget]`) exists, the widget auto-creates one and appends it
to `<body>`.

For an inline config (testing without a remote fetch), set
`window.LEAD_WIDGET_CONFIG = { … }` before loading `widget.js`.

---

## Configuration reference

Configs are JSON, served from `configs/<hotelId>.json` next to `widget.js`.

| Key                     | Type                          | Description                                                                       |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `title`                 | string                        | Popup headline (plain text).                                                      |
| `message`               | string                        | Body copy. Sanitized HTML allowed (`<strong>`, `<em>`); other tags stripped.      |
| `imageUrl`              | string                        | Image displayed on the left pane (right pane on RTL).                             |
| `imageAlt`              | string                        | Alt text for the image.                                                           |
| `imageWidth`            | number                        | Image-pane width in px (clamped 180–500). Card width = imageWidth + 340.          |
| `buttonColor`           | hex string                    | CTA background.                                                                   |
| `buttonHoverColor`      | hex string                    | Optional. Defaults to a 10% darker shade of `buttonColor`.                        |
| `buttonLabel`           | string                        | CTA text. Defaults to `Subscribe`.                                                |
| `privacyPolicyUrl`      | string                        | Link target for the consent line. Only `http(s):` and `mailto:` accepted.         |
| `position`              | `'center'` \| `'top-right'` \| `'top-left'` \| `'bottom-right'` \| `'bottom-left'` \| `'center-right'` \| `'center-left'` | Where the card pins. |
| `triggerMode`           | `'immediate'` \| `'time'` \| `'scroll'` \| `'time_or_scroll'` | When the popup appears. |
| `triggerDelaySec`       | seconds                       | Delay before time-based triggers (default 5s).                                    |
| `triggerScrollPercent`  | 0–100                         | Scroll-depth threshold for scroll triggers (default 50).                          |
| `dismissOnOutsideClick` | boolean                       | Click-outside-to-close. Default `false` (would surprise users on corner positions).|

See `public/configs/hm_demo001.json` for a concrete example.

---

## Style isolation

The widget mounts into **Shadow DOM**. Host-page CSS can't reach inside;
the widget's styles can't leak out. This matters because hotel marketing
sites often ship aggressive global resets (`* { all: revert; }`) that
would otherwise destroy the popup layout.

Styles are inline (CSS-in-JS) — there is no sibling stylesheet to fetch.
A single `<style>` tag is injected on mount to host the keyframes and
the mobile media query.

The popup respects `prefers-reduced-motion` — the shake-on-error
animation is disabled for users with vestibular sensitivity.

---

## Preview mode

The admin SPA edits the config in real time and previews the result via
an iframe pointing at `transparent.html?preview=<base64>`. The base64
payload is the live form state. The widget decodes it and bypasses the
remote fetch entirely.

Preview mode is gated to the `transparent.html` pathname — phishing
links of the form `https://hotel.com/?preview=<malicious>` on the
operator's actual site are ignored. See `loader.js::isPreviewHost`.

---

## Development

```bash
npm install
npm run dev       # Vite dev server at :5173, opens demo.html
npm run build     # Produces dist/widget.js + dist/configs/ + dist/demo.html
```

### Project structure

```
├── src/
│   ├── embed.jsx        # Entry: Shadow DOM mount, hands over to Widget
│   ├── Widget.jsx       # Main component — popup, form, success state
│   └── loader.js        # Config resolution: ?preview= / ?id= / window.LEAD_WIDGET_CONFIG
├── public/
│   ├── demo.html        # Mock hotel landing page for local dev
│   ├── transparent.html # Transparent host for the admin preview iframe
│   └── configs/
│       └── hm_demo001.json  # Demo hotel config
├── scripts/
│   └── postbuild.js     # Copies demo.html + configs/ into dist/
├── vite.config.js
└── package.json
```

### Build output

```
dist/
├── widget.js     # ~50 kB min (~18 kB gzip) — React + ReactDOM bundled
├── configs/      # Hotel config JSONs (one per hotelId)
└── demo.html
```

### Tech choices

- **React + ReactDOM are bundled in.** Adds ~40 kB gzip but lets the
  hotel paste a single `<script>` tag.
- **No CSS file.** All styles are inline (CSS-in-JS). The whole popup
  fits in a single bundle, no extra fetch on slow networks.
- **No build-time React import.** Vite's JSX transform handles JSX
  directly, so `embed.jsx` and `Widget.jsx` don't need
  `import React from 'react'`.

---

## Security notes

- `privacyPolicyUrl` is scheme-validated in the loader (`safeHref`).
  `javascript:` and `data:` are rejected — the inert `'#'` default
  takes over.
- `message` is rendered via `dangerouslySetInnerHTML` to allow
  `<strong>` / `<em>` emphasis. Sanitization is the responsibility of
  the admin (which uses Gemini and a server-side strip). Defence in
  depth via the preview-mode pathname gate above.
- `id` query param is regex-validated (`^[A-Za-z0-9_-]{3,64}$`) before
  the CDN fetch — garbage paths never hit the network.
- Config fetch has a 5s `AbortController` timeout — a flapping CDN can
  no longer leave the widget invisible indefinitely.

---

## License

MIT.
