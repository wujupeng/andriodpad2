import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './ui/tokens/tokens.css'
import './ui/styles/global.css'
import { initThemeBeforeRender } from './ui/theme/bootstrap'
import { initAutoUpdateCheck } from './orchestration/update/initAutoUpdateCheck'
import { loadWritebackConfig } from './state/writebackConfig'
import { initBootProfiles } from './orchestration/boot/autoReconnect'

void initThemeBeforeRender().then(() => {
  void loadWritebackConfig();
  void initAutoUpdateCheck();
  void initBootProfiles();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
