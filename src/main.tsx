import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './ui/tokens/tokens.css'
import './ui/styles/global.css'
import { initThemeBeforeRender } from './ui/theme/bootstrap'
import { initAutoUpdateCheck } from './orchestration/update/initAutoUpdateCheck'

void initThemeBeforeRender().then(() => {
  void initAutoUpdateCheck();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
