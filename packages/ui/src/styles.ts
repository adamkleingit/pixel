// Self-contained styles for the overlay, radar blip, and REC indicator.
// Injected once into <head>; scoped under .screenshare-* class names so they
// never collide with the host app.

const STYLE_ID = 'screenshare-styles'

const CSS = `
.screenshare-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483000;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}

.screenshare-blip {
  position: fixed;
  width: 28px;
  height: 28px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.screenshare-blip .screenshare-blip-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(168, 85, 247, 0.9);
  box-shadow:
    0 0 14px 4px rgba(168, 85, 247, 0.65),
    inset 0 0 10px rgba(168, 85, 247, 0.45);
  animation: screenshare-ring 1100ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}
.screenshare-blip .screenshare-blip-ring.delay {
  animation-delay: 160ms;
}
.screenshare-blip .screenshare-blip-dot {
  position: absolute;
  inset: 36%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #d8b4fe, #7c3aed);
  box-shadow: 0 0 12px 3px rgba(168, 85, 247, 0.95);
  animation: screenshare-dot 1100ms ease-out forwards;
}

@keyframes screenshare-ring {
  from { transform: scale(0.35); opacity: 1; }
  to   { transform: scale(3.4);  opacity: 0; }
}
@keyframes screenshare-dot {
  0%   { transform: scale(1);   opacity: 1; }
  55%  { opacity: 0.85; }
  100% { transform: scale(0.4); opacity: 0; }
}

.screenshare-rec {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 5px 3px 9px;
  border-radius: 999px;
  background: rgba(24, 12, 38, 0.92);
  color: #f3e8ff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2px;
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.45);
  pointer-events: auto;
  backdrop-filter: blur(4px);
  transition: opacity 160ms ease;
}
.screenshare-rec:hover { opacity: 1 !important; }
.screenshare-rec.minimized { padding: 3px; }

/* positions */
.screenshare-rec.pos-top-left { top: 16px; left: 16px; }
.screenshare-rec.pos-top-center { top: 16px; left: 50%; transform: translateX(-50%); }
.screenshare-rec.pos-top-right { top: 16px; right: 16px; }
.screenshare-rec.pos-center-left { top: 50%; left: 16px; transform: translateY(-50%); }
.screenshare-rec.pos-center-right { top: 50%; right: 16px; transform: translateY(-50%); }
.screenshare-rec.pos-bottom-left { bottom: 16px; left: 16px; }
.screenshare-rec.pos-bottom-center { bottom: 16px; left: 50%; transform: translateX(-50%); }
.screenshare-rec.pos-bottom-right { bottom: 16px; right: 16px; }

/* vertical layout for center-left / center-right */
.screenshare-rec.vertical {
  flex-direction: column;
  border-radius: 14px;
  padding: 7px 5px;
}
.screenshare-rec.vertical .screenshare-rec-sep {
  width: 60%;
  height: 1px;
  align-self: center;
  margin: 1px 0;
}
.screenshare-rec.vertical .screenshare-rec-time {
  min-width: 0;
  font-size: 10px;
}

.screenshare-rec .screenshare-rec-record {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: #f3e8ff;
  font: 600 11px ui-sans-serif, system-ui;
  cursor: pointer;
  padding: 1px 3px;
}
.screenshare-rec .screenshare-rec-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a855f7;
  box-shadow: 0 0 8px #a855f7;
  animation: screenshare-pulse 1.2s ease-in-out infinite;
}
.screenshare-rec.paused .screenshare-rec-dot {
  animation: none;
  opacity: 0.5;
}
.screenshare-rec .screenshare-rec-time {
  min-width: 58px;
}
.screenshare-rec .screenshare-rec-sep {
  width: 1px;
  align-self: stretch;
  margin: 1px;
  background: rgba(243, 232, 255, 0.18);
}
.screenshare-rec .screenshare-rec-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #f3e8ff;
  cursor: pointer;
  transition: background 120ms ease;
}
.screenshare-rec .screenshare-rec-btn:hover {
  background: rgba(168, 85, 247, 0.35);
}
.screenshare-rec .screenshare-rec-btn.active {
  background: rgba(168, 85, 247, 0.5);
  color: #fff;
}
/* pass-through toggle: dim when off, lit + filled when on */
.screenshare-rec .screenshare-rec-pass {
  opacity: 0.45;
}
.screenshare-rec .screenshare-rec-pass.active {
  opacity: 1;
}
@keyframes screenshare-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.25; }
}

.screenshare-rect {
  position: fixed;
  border: 2px solid rgba(168, 85, 247, 0.95);
  background: rgba(168, 85, 247, 0.14);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25), 0 0 18px rgba(168, 85, 247, 0.5);
  border-radius: 4px;
  pointer-events: none;
}
.screenshare-rect-flash {
  position: fixed;
  border: 2px solid rgba(168, 85, 247, 0.95);
  background: rgba(168, 85, 247, 0.12);
  border-radius: 4px;
  pointer-events: none;
  animation: screenshare-rect-fade 900ms ease-out forwards;
}
@keyframes screenshare-rect-fade {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.screenshare-save-error {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(92vw, 460px);
  padding: 10px 12px 10px 16px;
  border-radius: 10px;
  background: rgba(70, 10, 10, 0.96);
  border: 1px solid rgba(248, 113, 113, 0.55);
  color: #fee2e2;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
  backdrop-filter: blur(4px);
}
.screenshare-save-error-msg { flex: 1; }
.screenshare-save-error-btn {
  flex: none;
  border: none;
  border-radius: 7px;
  padding: 6px 12px;
  background: #ef4444;
  color: #fff;
  font: 600 13px ui-sans-serif, system-ui;
  cursor: pointer;
  transition: background 120ms ease;
}
.screenshare-save-error-btn:hover { background: #dc2626; }
.screenshare-save-error-btn:disabled { opacity: 0.6; cursor: default; }
`

export function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
