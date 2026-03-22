import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.greenergyresources.portal',
  appName: 'Greenergy Resources Portal',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
