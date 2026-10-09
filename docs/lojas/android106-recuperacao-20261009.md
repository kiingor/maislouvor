# Android 1.0.6 e acesso pela web — 09/10/2026

Pedido: distribuir um APK novo para que integrantes afetados pela exigência de
consentimento possam concluir a escolha dentro do app, sem login em um link
externo. Esclarecer também a atualização para usuários web.

## Publicado

- Fonte: `8a4ce061e2660bcd1fd70dcd7feb6eafb83b32ff`, branch
  `codex/integracao-lojas-revenuecat`; sem merge em main ou envio às lojas.
- Android **1.0.6**, versionCode **7**, pacote `com.maislouvor.app`.
- Download: <https://maislouvor.com/LouvorMais-1.0.6.apk>.
- Página com instruções: <https://app.maislouvor.com/baixar>.
- APK publicado às `2026-10-09T18:40:50Z`; página web publicada às
  `2026-10-09T18:42:07Z` pela release `20261009-web-apk106`.
- SHA-256: `4efdc2f845ae4e1b9884e0b8d14124c42b4167b619f7a50823e8910c6e3c13ec`.
- Tamanho: 27.997.697 bytes. `LouvorMais.apk` também aponta para esse conteúdo;
  arquivos versionados anteriores foram preservados.
- Artefato local e evidências: `/Volumes/MaisLouvorBuild/Android-1.0.6/`.
- Backup do APK genérico anterior e resultado de publicação:
  `/var/lib/maislouvor-deploy/20261009-apk106/` na VPS.

A página `maislouvor.com/baixar` é uma landing de marketing separada, sem link de
APK. Foi preservada. Usar o link direto ou a página do subdomínio `app` acima.

## Conteúdo e compatibilidade

Inclui o código integrado atual: consentimento individual dentro do app e leitura
do próprio perfil independente do vínculo visível da equipe. Não há concessão de
consentimento automática. O app pode apresentar também a atualização dos Termos
de Uso e Privacidade antes da escolha específica de participação.

Mesma assinatura de release dos APKs 1.0.1–1.0.5: certificado SHA-256
`aff079a4edb5cdafdd5c85eb69071c0aaca6cce098f3baf357cf7931f020ab49`.
O APK 1.0 original possui outra assinatura e não recebe atualização por cima;
não orientar desinstalação indiscriminada. Android mínimo 7 (API24), target36,
quatro ABIs, release sem depuração, assinatura v2/v3 e alinhamento 16KiB verificados.

## Verificações

- 12 testes focados (download, consentimento e perfil), sobre a base que já havia
  passado 541 testes. Build Vite e Gradle release concluídos.
- Todos os 224 arquivos web dentro do APK são iguais ao `dist` e ao pacote web
  publicado. Sem arquivos `.env`, keystore, p12 ou google-services.json no APK.
- Emulador Android15: instalação do APK público 1.0.5, login em fixture de revisão,
  atualização por cima com `adb install -r` para 1.0.6. Data de instalação original
  mantida, conta e equipe da fixture continuaram visíveis sem novo login.
- Conta descartável criada apenas para QA, sem envio de e-mail ou equipe: após
  login no APK novo e conclusão do aviso de termos, a tela específica apareceu
  com checkbox desmarcado, botão de autorizar desabilitado e opção de recusar.
  Nenhum consentimento de participação foi gravado. Conta removida ao terminar.
- Três downloads HTTPS (direto/genérico no domínio principal e direto no subdomínio
  app) tiveram MIME Android e hash conferidos.
- Publicador web conferiu 224 arquivos, 141 assets HTTPS e sete rotas, preservando
  marketing, APKs e assets antigos. Página de download verificada em Chromium móvel.

## Navegador/PWA

Teste isolado com service worker/index antigos: primeira reabertura detectou e
instalou a atualização; segunda reabertura normal carregou o shell novo. Sessão
preservada byte a byte, sem novo login e sem reload forçado durante a ativação.
As leituras de consentimento/termos desse teste foram simuladas apenas no navegador,
sem alterar escolhas reais. Nenhuma mudança do SW foi necessária.

Orientação: abrir com internet e atualizar/reabrir a página; se ainda mostrar a
versão antiga, aguardar a atualização em segundo plano e reabrir uma vez mais.
Não sair da conta nem limpar os dados do navegador. A tela de participação aparece
automaticamente no app atual. O link de recuperação continua disponível como
alternativa, preservando o login na mesma origem.

## Limites

Não houve teste em Android físico nem confirmação de que cada integrante afetado
atualizou/autorizou. Nenhum cadastro real ou política do banco foi alterado por esta
release. Assinaturas/compras, envio às lojas e pendências da App Store permanecem
fora do escopo deste hotfix.
