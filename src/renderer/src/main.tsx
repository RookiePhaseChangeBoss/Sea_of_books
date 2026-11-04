import '@fontsource/literata/400.css'
import '@fontsource/literata/600.css'
import '@fontsource/literata/700.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'

window.addEventListener('error', (event) => {
  if (String(event.message).includes('ResizeObserver loop')) event.stopImmediatePropagation()
}, true)

const boot = window.codex.boot
document.documentElement.dataset.theme = boot.dark ? 'dark' : 'light'
document.documentElement.style.colorScheme = boot.dark ? 'dark' : 'light'
document.documentElement.style.background = boot.dark ? '#14110f' : '#f4efe6'

createRoot(document.getElementById('root')!).render(<App />)
