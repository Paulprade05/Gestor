import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Candado } from './components/Bloqueo';
import { Recuperacion } from './components/Recuperacion';
import { ProveedorEstado } from './estado';
import { iniciarAjustesIOS } from './lib/ios';
import { iniciarSincronizacion } from './lib/sync';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recuperacion>
      <ProveedorEstado>
        <Candado>
          <App />
        </Candado>
      </ProveedorEstado>
    </Recuperacion>
  </StrictMode>,
);

// El service worker solo en producción: en desarrollo interferiría con la recarga en caliente de Vite.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.error('No se pudo registrar el service worker', e));
  });
}

iniciarSincronizacion();
iniciarAjustesIOS();
