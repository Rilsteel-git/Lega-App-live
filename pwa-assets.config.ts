import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/* The Android PWA splash screen draws the maskable icon unmasked on top of the
 * manifest background_color. The preset pads it with white, which shows up as
 * a white square on the light splash, so pad it with the app canvas instead. */
const APP_CANVAS = '#f4f6f4';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { ...minimal2023Preset.maskable.resizeOptions, background: APP_CANVAS }
    }
  },
  images: ['public/lega-app-icon.png']
});
