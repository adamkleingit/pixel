/**
 * CSS for the DesignSections panel. Injected by the host (not auto-applied).
 * Light theme: text #2a1f3d, muted #8b7fa6, accent #7c3aed, borders #ece6ff.
 * Compact rows, 12px base, right-aligned value-style inputs.
 */
export const DESIGN_SECTIONS_CSS = `
.screenshare-ds-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  color: #2a1f3d;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  box-sizing: border-box;
}

.screenshare-ds-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.screenshare-ds-section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8b7fa6;
  margin-bottom: 2px;
}

.screenshare-ds-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

.screenshare-ds-label {
  flex: 0 0 84px;
  font-size: 12px;
  color: #8b7fa6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.screenshare-ds-control {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.screenshare-ds-input,
.screenshare-ds-select {
  flex: 1;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  font-family: inherit;
  color: #2a1f3d;
  background: #ffffff;
  border: 1px solid #ece6ff;
  border-radius: 4px;
  outline: none;
  text-align: right;
}

.screenshare-ds-select {
  text-align: left;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  padding-right: 6px;
}

.screenshare-ds-input:focus,
.screenshare-ds-select:focus {
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
}

.screenshare-ds-input::placeholder {
  color: #b6acca;
}

.screenshare-ds-color {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.screenshare-ds-color .screenshare-ds-input {
  flex: 1;
}

.screenshare-ds-swatch {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #ece6ff;
  border-radius: 4px;
  background: #ffffff;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.screenshare-ds-swatch::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.screenshare-ds-swatch::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}
.screenshare-ds-swatch::-moz-color-swatch {
  border: none;
  border-radius: 2px;
}
`
