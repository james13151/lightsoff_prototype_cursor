import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Unregister any stale service workers that may cache mismatched JS bundles
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((sw) => sw.unregister());
  });
  // Clear all caches to prevent stale React copies
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)