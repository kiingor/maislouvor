#!/usr/bin/env node
// Beta interno: base compatível com o backend existente, sem os
// documentos e RPCs da conformidade ainda não publicada. Não altera o guard
// da release pública. A exportação impõe TestFlight Internal Only.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = '016eed98cedc5cfbd6bb5f5ecdbed6fe9b0eed28';
const build = process.env.IOS_BUILD_NUMBER ?? '6';
if (!/^[2-9]\d*$|^1\d+$/.test(build)) throw new Error('IOS_BUILD_NUMBER precisa ser inteiro >= 2; build 1 está preservado.');
const work = join(root, `tmp/ios-internal-testflight-${build}`);
const source = join(work, 'source');
const archive = join(work, 'MaisLouvor-internal.xcarchive');
const options = join(root, 'ios/ExportOptions-internal.plist');
const overlays = [
  'src/pages/Login.tsx', 'src/components/auth/LoginShowcase.tsx', 'src/styles/login.css',
  'src/lib/nativeGoogleOAuth.ts', 'src/lib/nativeGoogleOAuth.test.ts',
  'capacitor.config.ts', 'src/integrations/supabase/client.ts',
  'src/components/BiometricGate.tsx', 'src/components/FaceIdSettings.tsx', 'src/lib/biometricStorage.ts',
  'src/components/NativeAuthHandler.test.tsx', 'src/lib/biometricStorage.test.ts', 'src/components/BiometricGate.test.tsx',
  'src/components/GoogleButton.tsx', 'src/components/SocialLoginButtons.tsx',
  'src/components/SocialLoginButtons.test.tsx', 'src/components/NativeAuthHandler.tsx',
  'src/lib/appleSignIn.ts', 'src/lib/nativeAuth.ts', 'src/lib/nativeAuth.test.ts', 'src/lib/authRedirect.ts',
  'src/lib/storeBuild.ts', 'src/lib/songAudioAttachments.ts',
  'src/pages/SongEditor.tsx', 'src/components/SongAudioAttachments.tsx',
  'src/integrations/supabase/types.ts', 'src/pages/CultoDetail.tsx',
  'src/lib/push.test.ts', 'src/lib/songAudioAttachments.test.ts',
  'src/pages/SongEditor.registration.test.tsx', 'src/components/SongAudioAttachments.test.tsx',
];
const run = (cmd, args, cwd = source, env = process.env) => execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });
function replace(file, from, to) {
  const path = join(source, file), text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`Trecho esperado ausente: ${file}`);
  writeFileSync(path, text.replace(from, to));
}
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)]);
}
function checkBundle() {
  for (const file of files(join(source, 'ios/App/App/public')).filter(f => /\.(js|html)$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    for (const forbidden of ['PREENCHER:', 'import-youtube', 'accept_terms', 'legal_current_versions']) {
      if (text.includes(forbidden)) throw new Error(`Bundle interno contém ${forbidden}: ${relative(source, file)}`);
    }
  }
}
function validate() {
  run('npm', ['run', 'typecheck']);
  run('npx', ['vitest', 'run', ...overlays.filter(p => p.includes('.test.'))]);
  run('npx', ['vite', 'build'], source, { ...process.env, VITE_STORE_BUILD: '1' });
  run('npx', ['cap', 'sync', 'ios']);
  checkBundle();
  const hashes = Object.fromEntries(overlays.map(f => [f, createHash('sha256').update(readFileSync(join(source, f))).digest('hex')]));
  writeFileSync(join(work, 'manifest.json'), JSON.stringify({ base, createdAt: new Date().toISOString(), version: '1.0.0', build, internalOnly: true, overlaySha256: hashes }, null, 2) + '\n');
  console.log('Snapshot interno preparado e validado. Release pública permanece bloqueada pelos dados legais.');
}
const action = process.argv[2] ?? 'prepare';
if (action === 'prepare') {
  if (existsSync(source)) throw new Error('Snapshot já existe. Preserve-o ou mova-o antes de preparar novamente.');
  mkdirSync(source, { recursive: true });
  run('git', ['archive', '--format=tar', `--output=${join(work, 'base.tar')}`, base], root);
  run('tar', ['-xf', join(work, 'base.tar'), '-C', source], root);
  rmSync(join(work, 'base.tar'));
  for (const file of overlays) {
    mkdirSync(dirname(join(source, file)), { recursive: true });
    cpSync(join(root, file), join(source, file));
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  pkg.scripts = { typecheck: 'tsc --noEmit -p tsconfig.app.json', test: 'vitest run', build: 'vite build' };
  writeFileSync(join(source, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  cpSync(join(root, 'package-lock.json'), join(source, 'package-lock.json'));
  symlinkSync(join(root, 'node_modules'), join(source, 'node_modules'));
  const env = loadEnv('production', root, 'VITE_');
  const keys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY'];
  if (!env.VITE_SUPABASE_URL?.startsWith('https://') || !(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY)) throw new Error('Configuração pública de API incompleta');
  writeFileSync(join(source, '.env'), keys.filter(k => env[k]).map(k => `${k}=${JSON.stringify(env[k])}`).join('\n') + '\n', { mode: 0o600 });
  cpSync(join(root, 'ios'), join(source, 'ios'), {
    recursive: true,
    filter: p => !['build', 'output', 'public', 'DerivedData', 'xcuserdata'].includes(p.split('/').at(-1)),
  });
  replace('src/lib/push.ts', 'if (!Capacitor.isNativePlatform()) return;', 'if (Capacitor.getPlatform() !== "android") return;');
  replace('src/pages/Chat.tsx', '.is("channel_id", null as any)', '.is("channel_id", null)');
  replace('src/pages/Chat.tsx', '.eq("channel_id" as any, active.id)', '.eq("channel_id", active.id)');
  // O reset continua na página pública; o OAuth retorna ao app.
  replace('src/pages/Login.tsx', '`${window.location.origin}/reset-password`', '"https://maislouvor.com/reset-password"');
  // O beta mantém a ausência do rodapé jurídico enquanto os documentos públicos
  // estão pendentes; não inclui rascunhos nem links para páginas inexistentes.
  replace('src/pages/Login.tsx', 'import { LegalLinksFooter } from "@/components/legal/LegalConsent";\n', '');
  replace('src/pages/Login.tsx', '          <LegalLinksFooter className="login-legal" />\n', '');
  for (const file of ['src/pages/Login.tsx', 'src/pages/SignUp.tsx']) {
    const path = join(source, file);
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('GoogleButton', 'SocialLoginButtons'));
  }
  const appPath = join(source, 'src/App.tsx');
  let app = readFileSync(appPath, 'utf8');
  const handlerStart = app.indexOf('/**\n * No app nativo (Capacitor)');
  const handlerEnd = app.indexOf('const App = () =>', handlerStart);
  if (handlerStart < 0 || handlerEnd < 0) throw new Error('NativeAuthHandler da base não encontrado');
  app = app.slice(0, handlerStart) + app.slice(handlerEnd);
  app = 'import { BiometricGate } from "./components/BiometricGate";\n' + app;
  app = app.replace('<QueryClientProvider client={queryClient}>', '<QueryClientProvider client={queryClient}><BiometricGate>');
  app = app.replace('</QueryClientProvider>', '</BiometricGate></QueryClientProvider>');
  replace('src/pages/TeamSettings.tsx', 'import { UserNotificationPrefs }', 'import { FaceIdSettings } from "@/components/FaceIdSettings";\nimport { UserNotificationPrefs }');
  replace('src/pages/TeamSettings.tsx', '<MyAssistantSettings />', '<MyAssistantSettings /><FaceIdSettings />');
  writeFileSync(appPath, 'import { NativeAuthHandler } from "./components/NativeAuthHandler";\n' + app);
  const project = join(source, 'ios/App/App.xcodeproj/project.pbxproj');
  writeFileSync(project, readFileSync(project, 'utf8').replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`));
  validate();
} else if (action === 'validate') {
  validate();
} else if (action === 'archive') {
  if (!existsSync(join(work, 'manifest.json'))) throw new Error('Prepare e valide o snapshot primeiro');
  checkBundle();
  run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS', '-derivedDataPath', join(work, 'DerivedData'), '-archivePath', archive, '-allowProvisioningUpdates', 'archive']);
} else if (action === 'upload') {
  const internal = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :testFlightInternalTestingOnly', options], { encoding: 'utf8' }).trim();
  if (internal !== 'true') throw new Error('Exportação precisa estar restrita a TestFlight interno');
  run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', join(work, 'output'), '-exportOptionsPlist', options, '-allowProvisioningUpdates']);
} else throw new Error('Use prepare, validate, archive ou upload');
