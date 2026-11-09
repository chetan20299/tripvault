import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { applyTheme } from './lib/theme';
import './index.css';

applyTheme();
if (!Capacitor.isNativePlatform()) registerSW({ immediate: true }); // native apps ship assets locally

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
