# Redesign iOS 27 publicado no site — 26/09/2026

Autorização do usuário: "quando finalizar pode subir pra produção". Destino: `https://maislouvor.com`, API `https://api.maislouvor.com`. Somente frontend: sem banco, worker, Caddy ou APK.

## Fonte
- Branch `redesign/ios27`, worktree `Projetos/Cofre/MaisLouvor-redesign-ios27`, commit **`e145cb8e0f346fddd1a82e459e178d814c04a1f7`**.
- Base: `c48c0b8` (`release/additional-audio-20260926`, o que estava em produção). Próximos deploys devem partir de `e145cb8` ou integrá-lo.
- Sem push para o GitHub.

## Validação antes de publicar
- 124/124 testes (14 arquivos). Typecheck: 9 erros pré-existentes (produção tinha 14), nenhum novo. Build Vite/PWA ok.
- Modo ensaio comparado lado a lado com a produção (A/B) em 402×874, 874×402, 1024×768 e 1366×900: mesmo comportamento em tocar/pausar, seek, próxima/anterior, seletor, Cifra/Voz, tom, mixer, loops e velocidade, metrônomo, áudios adicionais e saída.
- Transições: 128 navegações sem desmontar o shell nem quadro em branco; saída do ensaio com conteúdo em ~77 ms.

## Publicação
- Release em `/var/www/maislouvor-releases/20260926-redesign-ios27` (171 arquivos, `SHA256SUMS` conferido no servidor).
- `publish.sh` (mesmo do release anterior, só com IDs e hashes atualizados): lock, conferência do site anterior, backup completo, cópia preservando assets antigos, troca atômica com o service worker por último, rollback automático em falha (não acionado).
- Backup do site anterior: `/var/backups/maislouvor/20260926-redesign-ios27/site` (junto com `release.json`, fonte sem credenciais e o script).
- Depois da troca: 171/171 arquivos conferidos por HTTPS; `/login`, `/app/home`, `/app/cultos`, `/baixar` servem o novo index; APK 1.0.2 preservado.

## Rastreabilidade
- Index anterior `74930f2838676d40f5578c6f71c341e50cc617bbf394b6d4c8689ccf2fe190a0` → novo `3c65f7ac26e61c445e618072fe757fd36f52646fc9a248bbde6d55afdc4bd031`.
- Service worker anterior `98651587cb8a5c618a63fe88584aeaea4a819d75143c56b4046a2f147d9b6abc` → novo `a98923f6ac117da7b5f9d65acdec27b69cbd2a6521da5cfa28773d2b38591ea7`.
- APK 1.0.2 (inalterado) `b951bc08876b280eae372eb3fa749ebdd7c74850e3020b2e5fe3aba812743ba5`.

## Reversão
Restaurar `index.html`, `sw.js`, `registerSW.js` e `manifest.webmanifest` de `/var/backups/maislouvor/20260926-redesign-ios27/site/` (troca atômica, service worker por último). Os assets novos e antigos convivem na raiz, então não é preciso apagar nada.

## Pendências
- APK Android 1.0.3 com o redesign (o APK usa bundle local; sem ele, quem usa o app Android segue no visual antigo).
- Teste em aparelho físico (iPhone/Android) ainda não feito por mim.
