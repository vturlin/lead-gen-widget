import { createRoot } from 'react-dom/client';
import LeadGenWidget from './Widget.jsx';
import { loadConfig } from './loader.js';

/**
 * Auto-mount on DOM ready. Finds #lead-widget (documented target) or
 * falls back to data-lead-widget for advanced users; auto-creates one
 * otherwise so the widget is embeddable via tag managers (GTM/Wix)
 * where injecting markup is not always possible.
 *
 * Style isolation: mounted into Shadow DOM so host-page CSS resets
 * cannot reach the popup. The component styles itself inline
 * (CSS-in-JS) so there is no sibling stylesheet to fetch.
 */

function findMountNode() {
  let node =
    document.getElementById('lead-widget') ||
    document.querySelector('[data-lead-widget]');
  if (node) return node;
  node = document.createElement('div');
  node.id = 'lead-widget';
  document.body.appendChild(node);
  return node;
}

async function mount() {
  const host = findMountNode();
  if (!host) return;
  if (host.shadowRoot) {
    // Surface the silent no-op so a duplicated <script> tag, GTM
    // re-firing, or HMR don't look like the widget never loaded.
    console.warn('[lead-widget] already mounted, skipping');
    return;
  }

  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error('[lead-widget]', err.message);
    return;
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  container.className = 'lead-widget-root';
  shadow.appendChild(container);

  const root = createRoot(container);
  root.render(
    <LeadGenWidget
      title={config.title}
      message={config.message}
      imageUrl={config.imageUrl}
      imageAlt={config.imageAlt}
      imageWidth={config.imageWidth}
      buttonColor={config.buttonColor}
      buttonHoverColor={config.buttonHoverColor}
      buttonLabel={config.buttonLabel}
      privacyPolicyUrl={config.privacyPolicyUrl}
      onClose={() => {
        // Default close: unmount the popup. Host can override by
        // catching the event upstream — useful when integrating with
        // their own session-suppression logic.
        root.unmount();
        host.remove();
      }}
    />
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
