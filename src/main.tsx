import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { EcoView } from './components/views/EcoView.tsx';
import { ActivateOwnerView } from './components/views/ActivateOwnerView.tsx';
import { AuthProvider } from './lib/auth.tsx';
import { ownerTokenFromFragment } from './lib/ownerActivation.ts';
import './index.css';

const isOwnerActivation = /^\/activate-owner\/?$/.test(window.location.pathname);
const activationToken = isOwnerActivation ? ownerTokenFromFragment(window.location.hash) : null;
if (isOwnerActivation && window.location.hash) {
  window.history.replaceState(window.history.state, '', window.location.pathname);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isOwnerActivation ? <ActivateOwnerView token={activationToken} /> : /^\/eco\/?$/.test(window.location.pathname) ? <EcoView /> : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
);
