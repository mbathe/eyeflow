import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n'; // must be imported before any component
import { usePreferencesStore, applyPreferencesToDOM } from './store/preferences.store';

// Apply persisted preferences to DOM before first render
const savedPrefs = usePreferencesStore.getState();
applyPreferencesToDOM(savedPrefs);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
