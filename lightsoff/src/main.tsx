import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { StoreProvider } from './store'
import { ConnectScreen } from './components/ConnectScreen'
import { clearAuth, isApiMode, loadAuth, saveAuth, type AuthSession } from './api/config'
import { initTheme } from './lib/theme'

initTheme()

function Root() {
  const [auth, setAuth] = useState<AuthSession | null>(() => (isApiMode ? loadAuth() : null))
  const mode = isApiMode && auth ? 'live' : 'demo'

  if (isApiMode && !auth) {
    return (
      <ConnectScreen
        onConnect={(session) => {
          saveAuth(session)
          setAuth(session)
        }}
      />
    )
  }

  return (
    <StoreProvider auth={auth} mode={mode}>
      <App
        auth={auth}
        mode={mode}
        onDisconnect={() => {
          clearAuth()
          setAuth(null)
        }}
      />
    </StoreProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
