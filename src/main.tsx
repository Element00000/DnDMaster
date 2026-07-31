import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Den Browser bitten, den Speicher (LocalStorage + IndexedDB) NICHT automatisch
// zu loeschen. Reduziert das haeufigste stille Datenverlust-Risiko bei rein
// lokaler Speicherung. Best-effort; erfordert keine Zustimmung.
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((already) => {
    if (!already) navigator.storage.persist().catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
