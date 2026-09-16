import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maislouvor.app',
  appName: 'Louvor Mais',
  webDir: 'dist',
  // Android usa https://localhost por padrão (bom: chamadas a https://api.maislouvor.com
  // não viram mixed-content). App roda do bundle local (offline-capable).
  plugins: {
    // Ícone (logomarca branca) + cor (preta) das notificações locais (foreground).
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#000000',
    },
  },
};

export default config;
