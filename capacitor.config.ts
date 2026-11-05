/// <reference types="@capacitor/status-bar" />
/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rilsteel.maniapp',
  appName: 'Lega',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      // Legacy Android versions use a non-overlaid WebView. Android 15/16
      // enforce edge-to-edge, so the CSS safe-area inset handles those.
      overlaysWebView: false,
      style: 'LIGHT'
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
      hidden: false
    },
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      launchFadeOutDuration: 150,
      showSpinner: false,
      androidSplashResourceName: 'splash_legacy',
      androidScaleType: 'FIT_XY'
      // backgroundColor is deliberately omitted: Android resources provide
      // light/dark splash colors through values/ and values-night/.
    }
  }
};

export default config;
