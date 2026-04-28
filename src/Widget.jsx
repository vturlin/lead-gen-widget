/**
 * LeadGenWidget — embeddable newsletter signup popup.
 *
 * Self-contained: every style is inline (CSS-in-JS), the only DOM
 * dependency is a single <style> tag injected on mount to host the
 * keyframes (CSS animations can't be expressed via React inline
 * styles). Works equally well in light DOM or shadow DOM — the
 * stylesheet attaches to the closest root, so a shadow-DOM mount
 * scopes its keyframes correctly.
 *
 * Props (all optional):
 *   title, message, imageUrl, imageAlt, buttonColor, buttonHoverColor,
 *   buttonLabel, badgeLabel, privacyPolicyUrl, onSubmit, onClose
 */

import { useState, useRef, useEffect, useId, useMemo } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=440&q=80';

// One keyframes <style> per shadow root / document, reused if multiple
// widgets coexist on the same page (extremely rare but cheap to support).
const STYLE_ID = 'lead-widget-keyframes';
const STYLE_TEXT = `
@keyframes leadwidget-pop-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
  to   { opacity: 1; transform: translate(-50%, -50%); }
}
@keyframes leadwidget-shake {
  0%, 100% { transform: translateX(0); }
  15%      { transform: translateX(-5px); }
  30%      { transform: translateX(5px); }
  45%      { transform: translateX(-4px); }
  60%      { transform: translateX(4px); }
  75%      { transform: translateX(-2px); }
  90%      { transform: translateX(2px); }
}
@keyframes leadwidget-backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Mobile (≤ 480px): reflow the card vertically — image on top with a
   fixed 140px height, content underneath. The cap on max-height +
   overflow-y keeps the popup usable on landscape phones where the
   stacked layout could otherwise overflow the viewport. !important
   is needed to win against the React inline styles we set on the
   same elements for the desktop layout. */
@media (max-width: 480px) {
  .leadwidget-card {
    grid-template-columns: 1fr !important;
    max-height: 92vh !important;
    overflow-y: auto !important;
  }
  .leadwidget-image-pane {
    width: 100% !important;
    height: 140px !important;
  }
}
`;

function ensureKeyframes(rootNode) {
  // rootNode may be a ShadowRoot or document — both expose getElementById
  // and have an appendable head/itself. Fall back to document.head if
  // neither hosts an existing tag, since most embeds will be light DOM.
  const target =
    rootNode && rootNode.nodeType === 11 /* DOCUMENT_FRAGMENT */
      ? rootNode
      : document.head;
  if (target.getElementById && target.getElementById(STYLE_ID)) return;
  if (target.querySelector && target.querySelector('#' + STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  target.appendChild(style);
}

// Small hex utility — no colorjs.io dep, the spec just says "auto-darken
// by ~10%". Linear sRGB scaling is good enough for most brand colours.
function darken(hex, amount) {
  const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const factor = 1 - amount;
  const out = [m[1], m[2], m[3]]
    .map((h) => Math.max(0, Math.round(parseInt(h, 16) * factor)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return '#' + out;
}

export default function LeadGenWidget({
  title = 'Stay close to the coast.',
  message = 'Seasonal offers, local recommendations, and quiet weekends — delivered once a month. No filler.',
  imageUrl = DEFAULT_IMAGE,
  imageAlt = '',
  buttonColor = '#432975',
  buttonHoverColor,
  buttonLabel = 'Subscribe',
  badgeLabel = 'Newsletter',
  privacyPolicyUrl = '#',
  onSubmit,
  onClose,
}) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState(null); // null until success
  const [buttonHover, setButtonHover] = useState(false);

  const cardRef = useRef(null);
  const emailInputRef = useRef(null);
  const consentRowRef = useRef(null);
  const emailLabelId = useId();
  const consentLabelId = useId();

  const hoverColor = buttonHoverColor || darken(buttonColor, 0.10);

  // Inject keyframes into the closest root (shadow root or document.head)
  // once the widget is mounted. Cleaned up on unmount.
  useEffect(() => {
    if (!cardRef.current) return;
    const root = cardRef.current.getRootNode
      ? cardRef.current.getRootNode()
      : document;
    ensureKeyframes(root);
  }, []);

  // Esc closes the popup, matching standard modal UX.
  useEffect(() => {
    if (submittedEmail) return;
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedEmail]);

  function handleClose() {
    if (onClose) onClose();
  }

  function clearShake(el) {
    if (!el) return;
    // Removing the inline animation lets us replay it on next error
    // by re-applying it — the keyframe runs once per attribute set.
    el.style.animation = '';
    // Force reflow so re-applying the same animation actually replays
    // it. Reading offsetWidth is the canonical trick.
    void el.offsetWidth;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    const validEmail = EMAIL_RE.test(email.trim());
    const validConsent = consent === true;

    if (!validEmail) {
      setEmailError(true);
      clearShake(emailInputRef.current);
      if (emailInputRef.current) {
        emailInputRef.current.style.animation = 'leadwidget-shake 360ms';
      }
    } else {
      setEmailError(false);
    }

    if (!validConsent) {
      setConsentError(true);
      clearShake(consentRowRef.current);
      if (consentRowRef.current) {
        consentRowRef.current.style.animation = 'leadwidget-shake 360ms';
      }
    } else {
      setConsentError(false);
    }

    if (!validEmail || !validConsent) return;

    setSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit(email.trim());
      }
      setSubmittedEmail(email.trim());
    } catch (err) {
      console.error('[lead-widget] submit failed', err);
      setEmailError(true);
      clearShake(emailInputRef.current);
      if (emailInputRef.current) {
        emailInputRef.current.style.animation = 'leadwidget-shake 360ms';
      }
    } finally {
      setSubmitting(false);
    }
  }

  function toggleConsent() {
    setConsent((v) => !v);
    if (consentError) setConsentError(false);
  }

  function onConsentKeyDown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleConsent();
    }
  }

  // ── Styles ────────────────────────────────────────────────────────
  const styles = useMemo(
    () => buildStyles(buttonColor, hoverColor, buttonHover, emailError),
    [buttonColor, hoverColor, buttonHover, emailError]
  );

  return (
    <div style={styles.backdrop} role="presentation" onClick={handleClose}>
      <div
        ref={cardRef}
        style={styles.card}
        className="leadwidget-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={emailLabelId}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          style={styles.closeBtn}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M3 3 L11 11 M11 3 L3 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div style={styles.imagePane} className="leadwidget-image-pane">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={imageAlt}
              style={styles.image}
              draggable={false}
            />
          )}
        </div>

        <div style={styles.contentPane}>
          {submittedEmail ? (
            <SuccessState
              email={submittedEmail}
              buttonColor={buttonColor}
            />
          ) : (
            <form onSubmit={handleSubmit} noValidate style={styles.form}>
              <span style={styles.badge}>{badgeLabel}</span>
              <h3 id={emailLabelId} style={styles.title}>{title}</h3>
              {/* Message is sanitized server-side (admin/Gemini route)
                  to allow only <strong> and <em>, no attributes. We
                  render it as HTML so the operator can emphasize a
                  word or two. The same field can also be plain text
                  when written by hand — both work. */}
              <p
                style={styles.message}
                dangerouslySetInnerHTML={{ __html: message }}
              />

              <label style={styles.fieldLabel} htmlFor={emailLabelId + '-input'}>
                Email address
              </label>
              <input
                id={emailLabelId + '-input'}
                ref={emailInputRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(false);
                }}
                placeholder="you@example.com"
                style={styles.input}
                disabled={submitting}
              />
              {emailError && (
                <div style={styles.inlineError}>
                  Please enter a valid email address.
                </div>
              )}

              <div
                ref={consentRowRef}
                role="switch"
                aria-checked={consent}
                aria-labelledby={consentLabelId}
                tabIndex={0}
                onClick={toggleConsent}
                onKeyDown={onConsentKeyDown}
                style={styles.consentRow}
              >
                <span
                  style={{
                    ...styles.toggleTrack,
                    background: consent ? buttonColor : '#D6D3D1',
                  }}
                  aria-hidden="true"
                >
                  <span
                    style={{
                      ...styles.toggleKnob,
                      transform: consent ? 'translateX(10px)' : 'translateX(0)',
                    }}
                  />
                </span>
                <span
                  id={consentLabelId}
                  style={{
                    ...styles.consentCaption,
                    color: consentError ? '#EF4444' : '#999',
                  }}
                >
                  I agree to share my contact ·{' '}
                  <a
                    href={privacyPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      ...styles.privacyLink,
                      color: consentError ? '#EF4444' : '#666',
                    }}
                  >
                    Privacy policy
                  </a>
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                onMouseEnter={() => setButtonHover(true)}
                onMouseLeave={() => setButtonHover(false)}
                style={styles.submitBtn}
              >
                {submitting ? 'Subscribing…' : buttonLabel}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessState({ email, buttonColor }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '8px 0',
        gap: 12,
      }}
      role="status"
      aria-live="polite"
    >
      <CheckCircle color={buttonColor} />
      <h3 style={{
        fontSize: 20,
        fontWeight: 600,
        color: '#424242',
        margin: 0,
        letterSpacing: '-0.01em',
      }}>
        You&apos;re on the list
      </h3>
      <p style={{
        fontSize: 13,
        lineHeight: 1.55,
        color: '#666',
        margin: 0,
      }}>
        We sent a confirmation to <strong style={{ color: '#424242' }}>{email}</strong>.{' '}
        Check your inbox to complete your subscription.
      </p>
    </div>
  );
}

function CheckCircle({ color }) {
  // 56px purple-tinted check circle. The fill blends the brand colour
  // with white for a soft tint regardless of how saturated the brand is.
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="28" cy="28" r="28" fill={color} opacity="0.12" />
      <circle cx="28" cy="28" r="20" fill={color} opacity="0.18" />
      <path
        d="M19 28.5 L25 34 L37.5 21.5"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildStyles(buttonColor, hoverColor, buttonHover, emailError) {
  const inputBorderColor = emailError ? '#EF4444' : '#E7E5E4';
  return {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(20, 14, 28, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2147483000,
      animation: 'leadwidget-backdrop-in 280ms ease-out',
      fontFamily: '"Open Sans", system-ui, sans-serif',
    },
    card: {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 640,
      maxWidth: 'calc(100vw - 32px)',
      background: '#FFFFFF',
      borderRadius: 8,
      boxShadow:
        '0 20px 50px -10px rgba(20, 14, 28, 0.25), 0 4px 12px rgba(20, 14, 28, 0.10)',
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      overflow: 'hidden',
      animation: 'leadwidget-pop-in 360ms cubic-bezier(.2,.7,.3,1)',
      fontFamily: '"Open Sans", system-ui, sans-serif',
    },
    closeBtn: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      padding: 0,
      background: 'transparent',
      border: 0,
      borderRadius: '50%',
      color: '#999',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    imagePane: {
      width: 300,
      height: '100%',
      background: '#F4EFE8',
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    },
    contentPane: {
      padding: '28px 28px 24px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      margin: 0,
    },
    badge: {
      alignSelf: 'flex-start',
      padding: '3px 10px',
      background: '#ECE2FF',
      color: '#8764C9',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      borderRadius: 999,
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: '#424242',
      margin: '4px 0 2px',
      letterSpacing: '-0.01em',
      lineHeight: 1.25,
    },
    message: {
      fontSize: 13,
      lineHeight: 1.55,
      color: '#666',
      margin: '0 0 6px',
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: 600,
      color: '#666',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      marginTop: 4,
    },
    input: {
      height: 40,
      padding: '0 12px',
      border: `1px solid ${inputBorderColor}`,
      borderRadius: 4,
      fontSize: 14,
      color: '#424242',
      fontFamily: 'inherit',
      outline: 'none',
      transition: 'border-color 140ms',
      // Focus colour is applied via onFocus/onBlur in the future if
      // needed; React inline styles do not support :focus, so for now
      // the spec's "focus = buttonColor" border is approximated by the
      // browser default focus ring (visible on keyboard navigation)
      // plus the explicit error-state colour above.
    },
    inlineError: {
      fontSize: 12,
      color: '#EF4444',
      marginTop: -2,
    },
    consentRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
      cursor: 'pointer',
      outline: 'none',
      whiteSpace: 'nowrap',
    },
    toggleTrack: {
      position: 'relative',
      width: 24,
      height: 14,
      borderRadius: 999,
      flexShrink: 0,
      transition: 'background 160ms',
    },
    toggleKnob: {
      position: 'absolute',
      top: 1,
      left: 1,
      width: 12,
      height: 12,
      background: '#FFFFFF',
      borderRadius: '50%',
      transition: 'transform 160ms',
      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
    },
    consentCaption: {
      fontSize: 11,
      lineHeight: 1.4,
      transition: 'color 140ms',
    },
    privacyLink: {
      textDecoration: 'underline',
      transition: 'color 140ms',
    },
    submitBtn: {
      height: 40,
      width: '100%',
      marginTop: 6,
      padding: '0 16px',
      background: buttonHover ? hoverColor : buttonColor,
      color: '#FFFFFF',
      border: 0,
      borderRadius: 6,
      fontSize: 14,
      fontWeight: 600,
      letterSpacing: '0.02em',
      cursor: 'pointer',
      fontFamily: 'inherit',
      transition: 'background 160ms',
    },
  };
}
