// Self-contained styles for the overlay, radar blip, and REC indicator.
// Injected once into <head>; scoped under .pixel-* class names so they
// never collide with the host app.

import { THEME_CSS } from './design-system/theme-css'
import { HANDLES_CSS } from './drag/handles-css'

const STYLE_ID = 'pixel-styles'

const CSS = `
.pixel-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  /* Sits above ~all host UI, but MUST stay below Pixel's own body-portaled
     menus (Z_INDEX.popover/modal/overlay = 2147483010+). Those dropdowns/
     popovers are siblings of this overlay at <body>, not children, so they
     can only clear the design pane by out-z-indexing this container. Pushing
     this to the 32-bit max (2147483647) hides every dropdown behind the pane
     and eats its clicks — see the Z_INDEX comment in design-system/theme.ts. */
  z-index: 2147483000;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
}

.pixel-blip {
  position: fixed;
  width: 28px;
  height: 28px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.pixel-blip .pixel-blip-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(168, 85, 247, 0.9);
  box-shadow:
    0 0 14px 4px rgba(168, 85, 247, 0.65),
    inset 0 0 10px rgba(168, 85, 247, 0.45);
  animation: pixel-ring 1100ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}
.pixel-blip .pixel-blip-ring.delay {
  animation-delay: 160ms;
}
.pixel-blip .pixel-blip-dot {
  position: absolute;
  inset: 36%;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #d8b4fe, #7c3aed);
  box-shadow: 0 0 12px 3px rgba(168, 85, 247, 0.95);
  animation: pixel-dot 1100ms ease-out forwards;
}

@keyframes pixel-ring {
  from { transform: scale(0.35); opacity: 1; }
  to   { transform: scale(3.4);  opacity: 0; }
}
@keyframes pixel-dot {
  0%   { transform: scale(1);   opacity: 1; }
  55%  { opacity: 0.85; }
  100% { transform: scale(0.4); opacity: 0; }
}

.pixel-rec {
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
.pixel-rec:hover { opacity: 1 !important; }
.pixel-rec.minimized { padding: 3px; }

/* positions */
.pixel-rec.pos-top-left { top: 16px; left: calc(16px + var(--pixel-dock-left, 0px)); }
.pixel-rec.pos-top-center { top: 16px; left: 50%; transform: translateX(-50%); }
/* Right-docked positions account for the design pane's width (a CSS var the
   pane sets on :root) so the bar floats beside the pane, not under it. */
.pixel-rec.pos-top-right { top: 16px; right: calc(16px + var(--pixel-dock-right, 0px)); }
.pixel-rec.pos-center-left { top: 50%; left: calc(16px + var(--pixel-dock-left, 0px)); transform: translateY(-50%); }
.pixel-rec.pos-center-right { top: 50%; right: calc(16px + var(--pixel-dock-right, 0px)); transform: translateY(-50%); }
.pixel-rec.pos-bottom-left { bottom: 16px; left: calc(16px + var(--pixel-dock-left, 0px)); }
.pixel-rec.pos-bottom-center { bottom: 16px; left: 50%; transform: translateX(-50%); }
.pixel-rec.pos-bottom-right { bottom: 16px; right: calc(16px + var(--pixel-dock-right, 0px)); }

/* vertical layout for center-left / center-right */
.pixel-rec.vertical {
  flex-direction: column;
  border-radius: 14px;
  padding: 7px 5px;
}
.pixel-rec.vertical .pixel-rec-sep {
  width: 60%;
  height: 1px;
  align-self: center;
  margin: 1px 0;
}
.pixel-rec.vertical .pixel-rec-time {
  min-width: 0;
  font-size: 10px;
}

.pixel-rec .pixel-rec-record {
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
.pixel-rec .pixel-rec-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a855f7;
  box-shadow: 0 0 8px #a855f7;
  animation: pixel-pulse 1.2s ease-in-out infinite;
}
.pixel-rec.paused .pixel-rec-dot {
  animation: none;
  opacity: 0.5;
}
/* Stop button's red square pulses while actively recording (like the old dot),
   and goes steady + dimmed when paused. */
.pixel-rec .pixel-rec-stop-ind {
  animation: pixel-pulse 1.2s ease-in-out infinite;
}
.pixel-rec.paused .pixel-rec-stop-ind {
  animation: none;
  opacity: 0.6;
}
/* Edit-mode indicator: a steady (non-pulsing) blue dot, distinct from the
   recording dot, so the bar reads as "editing" at a glance. */
.pixel-rec .pixel-rec-edit-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3b82f6;
  box-shadow: 0 0 8px #3b82f6;
}
.pixel-rec .pixel-rec-comment-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
}
/* Save (diskette) tinted green to read as the primary/confirm action. */
.pixel-rec .pixel-rec-save {
  color: #4ade80;
}
.pixel-rec .pixel-rec-time {
  min-width: 58px;
}
.pixel-rec .pixel-rec-sep {
  width: 1px;
  align-self: stretch;
  margin: 1px;
  background: rgba(243, 232, 255, 0.18);
}
.pixel-rec .pixel-rec-btn {
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
.pixel-rec .pixel-rec-btn:hover {
  background: rgba(168, 85, 247, 0.35);
}
.pixel-rec .pixel-rec-btn.active {
  background: rgba(168, 85, 247, 0.5);
  color: #fff;
}
/* mouse-tool toggle: lit when the tool is on (active), dim when off */
.pixel-rec .pixel-rec-tool {
  opacity: 0.45;
}
.pixel-rec .pixel-rec-tool.active {
  opacity: 1;
}
@keyframes pixel-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.25; }
}

/* Task status indicator: a count badge, or an error tint when the server is down. */
.pixel-rec .pixel-rec-tasks { position: relative; }
.pixel-rec .pixel-rec-tasks.error {
  color: #fca5a5;
  animation: pixel-pulse 1.4s ease-in-out infinite;
}
.pixel-rec .pixel-rec-tasks.error:hover { background: rgba(248, 113, 113, 0.3); }
.pixel-rec .pixel-rec-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  box-sizing: border-box;
  border-radius: 7px;
  background: #a855f7;
  color: #fff;
  font: 700 9px ui-sans-serif, system-ui;
  line-height: 14px;
  text-align: center;
  box-shadow: 0 0 0 1.5px rgba(24, 12, 38, 0.92);
}

/* Tasks popup, anchored just outside the bar (positioned inline by JS). */
.pixel-tasks {
  position: absolute;
  z-index: 1;
  width: 232px;
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 12px;
  background: rgba(24, 12, 38, 0.97);
  border: 1px solid rgba(168, 85, 247, 0.3);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  color: #f3e8ff;
  cursor: default;
}
.pixel-tasks-head {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #c4b5fd;
  padding: 2px 6px 8px;
}
.pixel-tasks-empty {
  font-size: 12px;
  color: #b9a9d6;
  padding: 4px 6px 8px;
}
.pixel-tasks-list { list-style: none; margin: 0; padding: 0; }
.pixel-tasks-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
}
.pixel-tasks-item + .pixel-tasks-item { margin-top: 2px; }
.pixel-tasks-item:hover { background: rgba(168, 85, 247, 0.14); }
.pixel-tasks-open {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pixel-tasks-label {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.pixel-tasks-kind {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pixel-tasks-kind.recording { color: #c4b5fd; }
.pixel-tasks-kind.edit { color: #f0abfc; }
.pixel-tasks-kind.comment { color: #fbbf24; }
.pixel-tasks-id {
  font: 500 11px ui-monospace, monospace;
  color: #e9d5ff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pixel-tasks-pill {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.pixel-tasks-pill.pending { background: rgba(251, 191, 36, 0.18); color: #fcd34d; }
.pixel-tasks-pill.executing {
  background: rgba(96, 165, 250, 0.2);
  color: #93c5fd;
  animation: pixel-pulse 1.4s ease-in-out infinite;
}
.pixel-tasks-pill.done { background: rgba(74, 222, 128, 0.18); color: #86efac; }
.pixel-tasks-pill.error { background: rgba(248, 113, 113, 0.2); color: #fca5a5; }

.pixel-editlog {
  position: absolute;
  z-index: 1;
  width: 248px;
  max-height: 340px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 12px;
  background: rgba(24, 12, 38, 0.97);
  border: 1px solid rgba(168, 85, 247, 0.3);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  color: #f3e8ff;
  cursor: default;
}
.pixel-editlog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #c4b5fd;
  padding: 2px 4px 8px 6px;
}
.pixel-editlog-nav { display: inline-flex; gap: 2px; }
.pixel-editlog-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #e9d5ff;
  cursor: pointer;
}
.pixel-editlog-nav-btn:hover:not(:disabled) { background: rgba(168, 85, 247, 0.22); }
.pixel-editlog-nav-btn:disabled { opacity: 0.35; cursor: default; }
.pixel-editlog-empty { font-size: 12px; color: #b9a9d6; padding: 4px 6px 8px; }
.pixel-editlog-list { list-style: none; margin: 0; padding: 0; }
.pixel-editlog-item { border-radius: 8px; }
.pixel-editlog-item + .pixel-editlog-item { margin-top: 2px; }
.pixel-editlog-item:hover { background: rgba(168, 85, 247, 0.14); }
.pixel-editlog-item.undone { opacity: 0.4; }
.pixel-editlog-item.current { background: rgba(168, 85, 247, 0.2); }
.pixel-editlog-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.pixel-editlog-num {
  flex: none;
  min-width: 16px;
  font: 600 10px ui-monospace, monospace;
  color: #a78bda;
}
.pixel-editlog-label {
  font: 500 12px ui-monospace, monospace;
  color: #e9d5ff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Bug-report button while recording the screen — red, pulsing. */
.pixel-bug-recording {
  color: #ef4444 !important;
  animation: pixel-pulse 1.4s ease-in-out infinite;
}

.pixel-rect {
  position: fixed;
  border: 2px solid rgba(168, 85, 247, 0.95);
  background: rgba(168, 85, 247, 0.14);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25), 0 0 18px rgba(168, 85, 247, 0.5);
  border-radius: 4px;
  pointer-events: none;
}
.pixel-rect-flash {
  position: fixed;
  border: 2px solid rgba(168, 85, 247, 0.95);
  background: rgba(168, 85, 247, 0.12);
  border-radius: 4px;
  pointer-events: none;
  animation: pixel-rect-fade 900ms ease-out forwards;
}
@keyframes pixel-rect-fade {
  from { opacity: 1; }
  to   { opacity: 0; }
}

/* Freehand strokes (Cmd+drag). Full-viewport SVG; coords are client px. They
   stay visible until the Cmd key is released. */
.pixel-stroke {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.pixel-stroke path {
  fill: none;
  stroke: rgba(168, 85, 247, 0.95);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.6));
}

.pixel-save-error {
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
.pixel-save-error-msg { flex: 1; }
.pixel-save-error-btn {
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
.pixel-save-error-btn:hover { background: #dc2626; }
.pixel-save-error-btn:disabled { opacity: 0.6; cursor: default; }

/* Bug-report outcome toast (bottom-center), coloured by phase. */
.pixel-bug-toast {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(92vw, 460px);
  padding: 10px 12px 10px 16px;
  border-radius: 10px;
  font: 500 13px ui-sans-serif, system-ui, sans-serif;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  pointer-events: auto;
  animation: pixel-bug-toast-in 160ms ease-out;
}
.pixel-bug-toast.uploading {
  background: rgba(24, 12, 38, 0.96);
  border: 1px solid rgba(168, 85, 247, 0.5);
  color: #f3e8ff;
}
.pixel-bug-toast.sent {
  background: rgba(6, 40, 20, 0.96);
  border: 1px solid rgba(74, 222, 128, 0.55);
  color: #dcfce7;
}
.pixel-bug-toast.error {
  background: rgba(70, 10, 10, 0.96);
  border: 1px solid rgba(248, 113, 113, 0.55);
  color: #fee2e2;
}
.pixel-bug-toast-msg { flex: 1; }
.pixel-bug-toast-close {
  flex: none;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  opacity: 0.7;
}
.pixel-bug-toast-close:hover { opacity: 1; }
@keyframes pixel-bug-toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* Edit-mode selection outlines — drawn over the picked element's box. */
.pixel-sel {
  position: fixed;
  pointer-events: none;
  box-sizing: border-box;
  z-index: 2147483001;
  transform-origin: center center;
}
.pixel-sel-anchor {
  border: 2px solid rgba(168, 85, 247, 0.95);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4), 0 0 10px rgba(168, 85, 247, 0.5);
}
.pixel-sel-match {
  border: 2px solid rgba(168, 85, 247, 0.55);
}
.pixel-sel-hover {
  border: 1.5px dashed rgba(168, 85, 247, 0.8);
}

/* Edit-mode cursor/selection normalization (in-app port of Pixel's edit-mode
   stylesheet — its :host * scoping becomes "the app, excluding Pixel's own
   UI"). The designer is picking elements, not interacting, so neutralize the
   app's cursors (no pointer on buttons, no not-allowed on disabled inputs) and
   disable text selection.

   Scoping is the whole trick. In Pixel the rule lived inside the tile shadow
   root, so the :host * scope could never reach the chrome. Here everything is
   light DOM, so we must explicitly exclude Pixel's own UI — and the
   class-substring :not() is NOT enough: it only skips elements that themselves
   carry a pixel- class, not the inline-styled controls deep inside the
   design pane (DesignPanel buttons / inputs / scrub handles). Those would
   inherit cursor:default !important, clobbering their pointer / ew-resize
   cursors. The extra :not(.pixel-overlay *) excludes the entire overlay
   subtree, so Pixel's UI keeps its own cursors. Body-portaled Pixel menus and
   popovers (color / shadow / dropdowns) live OUTSIDE .pixel-overlay — they
   carry the data-pixel-ui marker instead — so they need their own
   exclusion, or their scrub handles / inputs would show cursor:default too. The
   element under an inline edit re-enables a text caret below. */
html.pixel-editing body *:not([class*='pixel-']):not(.pixel-overlay *):not([data-pixel-ui]):not([data-pixel-ui] *) {
  cursor: default !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
/* Comment mode: comment cursor over the page; leave Pixel chrome alone. */
html.pixel-commenting body *:not([class*='pixel-']):not(.pixel-overlay *):not([data-pixel-ui]):not([data-pixel-ui] *) {
  cursor: cell !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
.pixel-comments {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483015;
}
.pixel-comment-pin {
  position: fixed;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #f59e0b;
  color: #fff;
  font: 700 11px/18px system-ui, sans-serif;
  text-align: center;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  z-index: 2147483016;
}
.pixel-comment-pin.open,
.pixel-comment-pin.filled {
  background: #d97706;
}
.pixel-comment-composer {
  position: fixed;
  width: 240px;
  padding: 8px;
  border-radius: 10px;
  background: #1f152e;
  border: 1px solid rgba(245, 158, 11, 0.55);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
  z-index: 2147483017;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pixel-comment-input {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 64px;
  padding: 7px 8px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: #f8fafc;
  font: 13px/1.4 system-ui, sans-serif;
}
.pixel-comment-input:focus {
  outline: 1px solid #f59e0b;
  border-color: #f59e0b;
}
.pixel-comment-composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.pixel-comment-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 7px;
  font: 600 12px system-ui, sans-serif;
  cursor: pointer;
}
.pixel-comment-btn.primary {
  background: #f59e0b;
  color: #1a1000;
}
.pixel-comment-btn.danger {
  background: transparent;
  color: #fca5a5;
  border: 1px solid rgba(252, 165, 165, 0.35);
}
.pixel-confirm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 8, 18, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483500;
  pointer-events: auto;
}
.pixel-confirm {
  width: min(320px, calc(100vw - 32px));
  padding: 16px 16px 14px;
  border-radius: 12px;
  background: #241b38;
  border: 1px solid rgba(139, 92, 246, 0.45);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
  color: #f4f1fb;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.pixel-confirm-title {
  font-size: 14px;
  font-weight: 650;
  margin-bottom: 6px;
}
.pixel-confirm-msg {
  font-size: 12.5px;
  line-height: 1.45;
  color: #d6d0e6;
  margin-bottom: 14px;
}
.pixel-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.pixel-confirm-btn {
  padding: 7px 12px;
  border-radius: 8px;
  border: none;
  font: 600 12.5px system-ui, sans-serif;
  cursor: pointer;
}
.pixel-confirm-btn.keep {
  background: rgba(255, 255, 255, 0.08);
  color: #efeaff;
}
.pixel-confirm-btn.discard {
  background: #ef4444;
  color: #fff;
}
html.pixel-editing [data-pixel-editing],
html.pixel-editing [data-pixel-editing] * {
  cursor: text !important;
  user-select: text !important;
  -webkit-user-select: text !important;
}
/* While an inline edit is active, let clicks reach the contenteditable to place
   the caret — the resize / spacing / radius handles overlay the element (and on
   a short element cover it entirely), so they must not intercept the pointer.
   The :has() scope matches exactly the edit-active window; handles re-enable the
   moment data-pixel-editing is removed on exit. */
html.pixel-editing:has([data-pixel-editing]) [data-resize-handle],
html.pixel-editing:has([data-pixel-editing]) [data-spacing-handle] {
  pointer-events: none !important;
}

/* Design pane — docks on the right and reserves layout width (the body is
   shrunk via documentElement margin-right, set from DesignPane). */
.pixel-pane {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 280px;
  pointer-events: auto;
  background: #faf8ff;
  border-left: 1px solid #e6deff;
  box-shadow: -2px 0 16px rgba(124, 58, 237, 0.12);
  display: flex;
  flex-direction: column;
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: #2a1f3d;
  z-index: 2147483002;
}
.pixel-pane.collapsed {
  width: 36px;
}
.pixel-pane-resize {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 1;
}
.pixel-pane-resize:hover {
  background: linear-gradient(to right, rgba(124, 58, 237, 0.35), transparent);
}
.pixel-pane-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid #ece6ff;
  flex-shrink: 0;
}
.pixel-pane-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: #6b5b8a;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
}
.pixel-pane-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #6b5b8a;
  flex-shrink: 0;
}
.pixel-pane-collapse:hover { background: #efe9ff; }
.pixel-pane.collapsed .pixel-pane-head {
  padding: 0;
  justify-content: center;
}
.pixel-pane-body {
  flex: 1;
  overflow-y: auto;
  /* Let deeply-indented / long element rows scroll sideways instead of being
     clipped (the tree rows opt out of wrapping). Harmless for panes whose
     content fits — no scrollbar appears. */
  overflow-x: auto;
  padding: 12px;
}
.pixel-pane-empty {
  color: #8b7fa6;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 2px;
}
.pixel-pane-tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  font-weight: 700;
  color: #7c3aed;
  margin-bottom: 10px;
  word-break: break-all;
}
.pixel-pane-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
  border-top: 1px solid #f1ecff;
}
.pixel-pane-row:first-of-type { border-top: none; }
.pixel-pane-key { color: #8b7fa6; white-space: nowrap; }
.pixel-pane-val {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #2a1f3d;
  text-align: right;
  word-break: break-word;
}

/* Elements pane — the same pane chrome docked on the LEFT edge (reserves
   layout width via documentElement margin-left, set from ElementsPane). */
.pixel-pane.pixel-pane-left {
  left: 0;
  right: auto;
  border-left: none;
  border-right: 1px solid #e6deff;
  box-shadow: 2px 0 16px rgba(124, 58, 237, 0.12);
}
.pixel-pane-left .pixel-pane-resize {
  left: auto;
  right: -3px;
}
.pixel-pane-left .pixel-pane-resize:hover {
  background: linear-gradient(to left, rgba(124, 58, 237, 0.35), transparent);
}

/* States (time-travel) pane — list of captured commits + freeze controls. */
.pixel-states-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid #ece6ff;
  flex-shrink: 0;
}
.pixel-states-navbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #e4dcff;
  background: #faf8ff;
  border-radius: 7px;
  cursor: pointer;
  color: #4a3d6b;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
}
.pixel-states-navbtn:hover:not(:disabled) { background: #efe9ff; }
.pixel-states-navbtn:disabled { opacity: 0.35; cursor: default; }
.pixel-states-frozen {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #7c3aed;
  background: #f3ecff;
  border: 1px solid #e0d3ff;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
}
.pixel-states-frozen-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7c3aed;
  flex-shrink: 0;
}
.pixel-states-resume {
  margin-left: auto;
  border: none;
  background: #7c3aed;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
}
.pixel-states-resume:hover { background: #6d28d9; }
.pixel-states-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column-reverse;
}
.pixel-states-item { border-top: 1px solid #f1ecff; }
.pixel-states-item:last-child { border-top: none; }
.pixel-states-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 7px 6px;
  cursor: pointer;
  text-align: left;
  border-radius: 6px;
  font-family: inherit;
}
.pixel-states-row:hover { background: #efe9ff; }
.pixel-states-item.current .pixel-states-row {
  background: #e6d8ff;
}
.pixel-states-num {
  font-size: 11px;
  font-weight: 700;
  color: #8b7fa6;
  min-width: 20px;
}
.pixel-states-time {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #2a1f3d;
}

/* --- First-run onboarding ------------------------------------------------- */
.pixel-onb-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483400;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.pixel-onb-lines {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.pixel-onb-lines line {
  stroke: #8b5cf6;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  opacity: 0.9;
}
.pixel-onb-lines circle { fill: #8b5cf6; }
.pixel-onb-ring {
  position: fixed;
  border-radius: 8px;
  box-shadow: 0 0 0 2px #8b5cf6, 0 0 0 6px rgba(139, 92, 246, 0.28);
  pointer-events: none;
  animation: pixel-onb-pulse 1.6s ease-in-out infinite;
}
@keyframes pixel-onb-pulse {
  0%, 100% { box-shadow: 0 0 0 2px #8b5cf6, 0 0 0 6px rgba(139, 92, 246, 0.28); }
  50% { box-shadow: 0 0 0 2px #8b5cf6, 0 0 0 9px rgba(139, 92, 246, 0.12); }
}
.pixel-onb-tip {
  position: fixed;
  max-width: 232px;
  box-sizing: border-box;
  padding: 9px 12px;
  border-radius: 10px;
  background: #241b38;
  color: #f4f1fb;
  font-size: 12.5px;
  line-height: 1.45;
  box-shadow: 0 8px 28px rgba(20, 12, 40, 0.45);
  border: 1px solid rgba(139, 92, 246, 0.5);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}
.pixel-onb-tip.placed { opacity: 1; }
.pixel-onb-tip strong { color: #fff; font-weight: 650; }
.pixel-onb-kbd {
  display: inline-block;
  padding: 0 5px;
  min-width: 8px;
  border-radius: 5px;
  background: rgba(139, 92, 246, 0.28);
  border: 1px solid rgba(139, 92, 246, 0.55);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 17px;
  color: #efeaff;
}
.pixel-onb-cta {
  position: fixed;
  transform: translateX(-50%);
  pointer-events: auto;
}
.pixel-onb-popup {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: min(440px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 12px 12px 12px 16px;
  border-radius: 12px;
  background: #241b38;
  color: #f4f1fb;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 12px 40px rgba(20, 12, 40, 0.5);
  border: 1px solid rgba(139, 92, 246, 0.5);
  pointer-events: auto;
  animation: pixel-onb-rise 0.24s ease;
}
@keyframes pixel-onb-rise {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
.pixel-onb-popup-text { flex: 1; }
.pixel-onb-btn {
  flex: none;
  padding: 7px 16px;
  border: none;
  border-radius: 8px;
  background: #8b5cf6;
  color: #fff;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(139, 92, 246, 0.4);
}
.pixel-onb-btn:hover { background: #7c4ef0; }
`

export function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS + THEME_CSS + HANDLES_CSS
  document.head.appendChild(style)
}
