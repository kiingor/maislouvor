import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
const root=process.cwd();
export default defineConfig({root,optimizeDeps:{entries:['scripts/store-screens/ui.html']},plugins:[react()],resolve:{alias:[
 {find:'@/contexts/TeamContext',replacement:path.join(root,'scripts/store-screens/team.ts')},
 {find:'@',replacement:path.join(root,'src')}
]},server:{host:'127.0.0.1',port:5195,strictPort:true}});
