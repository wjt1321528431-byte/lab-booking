import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preWarm } from './utils/cloudbase'

// 应用启动时预热 CloudBase 连接（匿名登录），避免首次操作等待
preWarm()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
