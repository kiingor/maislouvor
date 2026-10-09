import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
const root = process.cwd();
const fixture = name => path.join(root, 'scripts/store-screens', name);
export default defineConfig({
  root, optimizeDeps: { entries: ['scripts/store-screens/home.html'] },
  plugins: [{ name: 'isolated-client', enforce: 'pre', resolveId(source, importer) {
    if (source === './client' && importer?.includes('/src/integrations/supabase/')) return fixture('home-client.ts');
  } }, react()],
  resolve: { alias: [
    { find: '@/integrations/supabase/client', replacement: fixture('home-client.ts') },
    { find: '@/contexts/TeamContext', replacement: fixture('home-team.ts') },
    { find: '@/lib/billing/revenuecat', replacement: fixture('home-billing.ts') },
    { find: '@/lib/push', replacement: fixture('home-push.ts') },
    { find: '@', replacement: path.join(root, 'src') },
  ] },
  server: { host: '127.0.0.1', port: 5196, strictPort: true },
});
