import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { installHmrGuard } from '@getpixel/ui'
import { App } from './App'
import '../globals.css' // design tokens the Pixel server extracts (see GET /tokens)
import './styles.css'

// Defer Vite HMR (react-refresh + full reloads) while a Pixel edit/recording
// session is active, so a dev-server rebuild can't wipe in-progress edits or end
// a recording. Deferred changes apply as one reload when the session ends.
if (import.meta.hot) installHmrGuard(import.meta.hot)

// Note: no <StrictMode>. Its dev double-invoke re-runs a component's hooks
// against the same fiber, which desyncs pixel-react's per-render capture cursor.
// Keep StrictMode off wherever the pixel-react alias is active (see README).
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
