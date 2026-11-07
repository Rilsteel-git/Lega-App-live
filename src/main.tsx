import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { AuthProvider } from './context/AuthContext';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { installStaleBuildReload } from './lib/staleBuildReload';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

// The app uses a light canvas at the top of every current page, so use dark
// status-bar icons. Android 15+ ignores overlaysWebView; SystemBars inset
// handling plus the CSS safe-area padding below keeps content out of that area.
if (Capacitor.isNativePlatform()) {
  const configureNativeStatusBar = async () => {
    try {
      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setOverlaysWebView({ overlay: false });
      }
      await StatusBar.setStyle({ style: Style.Light });
    } catch (error) {
      console.warn('Could not configure the native status bar.', error);
    }
  };

  void configureNativeStatusBar();
}

installStaleBuildReload();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>
);
