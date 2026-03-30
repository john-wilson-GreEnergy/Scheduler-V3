import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

console.log('⚡️ ⚡️ ⚡️ MAIN_V11_LOADED ⚡️ ⚡️ ⚡️');

// Register service worker for PWA
console.log('⚡️ Registering PWA Service Worker...');
registerSW({ immediate: true });

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('⚡️ FATAL: Root element not found!');
} else {
  try {
    createRoot(rootElement).render(
      <StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </StrictMode>,
    );
    console.log('⚡️ React Root Rendered Successfully');
  } catch (error) {
    console.error('⚡️ FATAL: Error during React render:', error);
    rootElement.innerHTML = `<div style="color: white; padding: 20px; font-family: sans-serif;">
      <h2>Application Error</h2>
      <p>The application failed to start. Please check the console for details.</p>
      <pre style="background: #222; padding: 10px; border-radius: 5px;">${error instanceof Error ? error.message : String(error)}</pre>
    </div>`;
  }
}
