import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

console.log('⚡️ ⚡️ ⚡️ MAIN_V11_LOADED ⚡️ ⚡️ ⚡️');

// Register service worker for PWA
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
