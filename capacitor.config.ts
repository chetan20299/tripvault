import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tripvault.app',
  appName: 'TripVault',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: { iosDatabaseLocation: 'Library/CapacitorDatabase', androidIsEncryption: false },
  },
};
export default config;
