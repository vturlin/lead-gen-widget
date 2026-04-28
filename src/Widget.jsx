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
 *   buttonLabel, privacyPolicyUrl, onSubmit, onClose
 */

import { useState, useRef, useEffect, useId, useMemo } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=440&q=80';

// One keyframes <style> per shadow root / document, reused if multiple
// widgets coexist on the same page (extremely rare but cheap to support).
const STYLE_ID = 'lead-widget-keyframes';
const STYLE_TEXT = `
@keyframes leadwidget-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
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

/* Mobile (≤ 480px): reflow the card vertically — image on top with a
   fixed 140px height, content underneath. Resets corner anchoring +
   the centring transform so the popup renders as a single bottom-
   aligned full-width sheet. !important is needed to win against the
   React inline styles we set on the same elements for desktop. */
@media (max-width: 480px) {
  .leadwidget-card {
    left: 12px !important;
    right: 12px !important;
    top: auto !important;
    bottom: 12px !important;
    transform: none !important;
    width: auto !important;
    max-width: none !important;
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

// Position-aware fixed offsets. 'center' keeps the modal-style
// centered placement (no backdrop anymore — the page underneath
// stays interactive); the six corner positions pin the card to
// that edge with a 24px inset. Mobile media query overrides this
// to a bottom-aligned full-width sheet regardless of the choice.
function positionStyle(position) {
  switch (position) {
    case 'top-left':
      return { top: 24, left: 24 };
    case 'top-right':
      return { top: 24, right: 24 };
    case 'center-left':
      return { top: '50%', left: 24, transform: 'translateY(-50%)' };
    case 'center-right':
      return { top: '50%', right: 24, transform: 'translateY(-50%)' };
    case 'bottom-left':
      return { bottom: 24, left: 24 };
    case 'bottom-right':
      return { bottom: 24, right: 24 };
    case 'center':
    default:
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
}

// Visibility gate. 'immediate' (or undefined) renders straight
// away; 'time' waits triggerDelaySec seconds; 'scroll' waits for
// the user to scroll past triggerScrollPercent of the page;
// 'time_or_scroll' fires on whichever lands first.
function useTriggeredVisibility(triggerMode, triggerDelaySec, triggerScrollPercent) {
  const isImmediate = !triggerMode || triggerMode === 'immediate';
  const [visible, setVisible] = useState(isImmediate);

  useEffect(() => {
    if (isImmediate || visible) return;
    const fire = () => setVisible(true);
    let timer;
    let scrollHandler;

    if (triggerMode === 'time' || triggerMode === 'time_or_scroll') {
      const ms = Math.max(0, triggerDelaySec || 5) * 1000;
      timer = setTimeout(fire, ms);
    }
    if (triggerMode === 'scroll' || triggerMode === 'time_or_scroll') {
      const threshold = (triggerScrollPercent || 50) / 100;
      scrollHandler = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 0) return;
        if (window.scrollY / max >= threshold) fire();
      };
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
    };
  }, [isImmediate, triggerMode, triggerDelaySec, triggerScrollPercent, visible]);

  return visible;
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
  // Desktop image-pane width in px. Bounded server-side so the
  // content pane stays usable; mobile (<480px) reflows the image
  // to 100% width and ignores this value.
  imageWidth = 300,
  buttonColor = '#432975',
  buttonHoverColor,
  buttonLabel = 'Subscribe',
  privacyPolicyUrl = '#',
  // Display behaviour
  position = 'center',
  triggerMode = 'immediate',
  triggerDelaySec = 5,
  triggerScrollPercent = 50,
  // When true, a click anywhere outside the card dismisses the
  // popup. Default false: the operator opts in explicitly because
  // a corner-anchored popup that closes on any click would be
  // surprising.
  dismissOnOutsideClick = false,
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

  // Optional click-outside dismissal. composedPath() lets us
  // correctly resolve the target through Shadow DOM — without it
  // the event target on a shadow-mounted widget would always be
  // the host node, never the card itself.
  useEffect(() => {
    if (!dismissOnOutsideClick) return;
    if (submittedEmail) return;
    const onClick = (e) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.includes(cardRef.current)) return;
      handleClose();
    };
    // setTimeout 0 so the click that opened the widget (if it
    // bubbled to document) doesn't immediately dismiss it.
    const t = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissOnOutsideClick, submittedEmail]);

  // Visibility gate — ALL hooks above this point run unconditionally,
  // and the styles useMemo below also runs before the early return,
  // so the React rules-of-hooks invariant holds across both branches.
  const triggerVisible = useTriggeredVisibility(
    triggerMode,
    triggerDelaySec,
    triggerScrollPercent
  );

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
    () => buildStyles(
      buttonColor, hoverColor, buttonHover, emailError, imageWidth, position
    ),
    [buttonColor, hoverColor, buttonHover, emailError, imageWidth, position]
  );

  if (!triggerVisible) return null;

  return (
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

function buildStyles(buttonColor, hoverColor, buttonHover, emailError, imageWidth) {
  const inputBorderColor = emailError ? '#EF4444' : '#E7E5E4';
  // Card width tracks the image pane: 220 → 560, 300 → 640, 380 → 720,
  // 440 → 780. Keeps the content pane at 340px regardless of the chosen
  // image size so the form stays comfortable to fill in.
  const cardWidth = imageWidth + 340;
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
      width: cardWidth,
      maxWidth: 'calc(100vw - 32px)',
      background: '#FFFFFF',
      borderRadius: 8,
      boxShadow:
        '0 20px 50px -10px rgba(20, 14, 28, 0.25), 0 4px 12px rgba(20, 14, 28, 0.10)',
      display: 'grid',
      gridTemplateColumns: `${imageWidth}px 1fr`,
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
      width: imageWidth,
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
