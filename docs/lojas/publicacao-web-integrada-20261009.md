# Publicação web integrada — 09/10/2026

Filipe confirmou que o login aprovado já aparece no TestFlight, mas a web ainda
mostra o formulário antigo, e autorizou publicar a versão integrada. A fonte é
`MaisLouvor-lojas`, branch `codex/integracao-lojas-revenuecat`. A cópia `main`
possui trabalho paralelo e não é usada como base desta publicação.

## Estado da preparação

Preparado `scripts/lojas/publish-integrated-web.py`, independente dos scripts
pontuais antigos de RevenueCat. A preparação não publica. A publicação só pode
seguir após a coordenação do backend de consentimento e o commit final do app.
Este registro sozinho não comprova publicação: o resultado real é salvo em
`result.json` local e no diretório privado da release na VPS.

Base observada no servidor durante a preparação:

- `index.html`: `7427ea557d277eab893a7fccaf6ff8eb21bd8a89ae260e55b6af9337f223293e`.
- `sw.js`: `48806cfddd2a8c55f6cd17f98025ab3d1a66321f33dc4269f9a2d658cb33757f`.
- `landing-sw.js`: `b444eb8742f125aa79f4cbc52126f6d5dc5fbbeb85f7971ddb6a2f48b41a4b88`.

O script consulta novamente a base em cada preparação. Não reutiliza esses
hashes como permissão permanente para substituir uma versão posterior.

## Sequência operacional

No checkout integrado, com as mudanças do aplicativo revisadas e commitadas:

```sh
python3 scripts/lojas/publish-integrated-web.py inspect
python3 -m unittest discover -s scripts/lojas -p test_publish_integrated_web.py -v
python3 scripts/lojas/publish-integrated-web.py prepare \
  --release 20261009-web-integrada \
  --expect-commit SHA_COMPLETO_DO_COMMIT_REVISADO
```

`prepare` executa `npm run build` com a trava legal normal, define build web
(sem `VITE_STORE_BUILD=1`), exige o commit esperado e a ausência de alterações
pendentes no código/configuração do aplicativo. O `.env` preexistente não é
alterado, impresso ou incluído no pacote. O destino separado
`tmp/web-releases/<release>/dist` evita substituir o `dist` do trabalho iOS.

Antes da próxima operação: backend de consentimento/convites compatível
publicado e conferido pelo coordenador; checagens do aplicativo aprovadas; login
e páginas legais conferidos no pacote preparado. Só então:

```sh
python3 scripts/lojas/publish-integrated-web.py apply \
  --release 20261009-web-integrada
```

Se a produção ou o commit mudar entre a preparação e a aplicação, o processo
para. Faça nova inspeção e preparação com outro identificador; não remova as
travas e não reutilize uma tentativa antiga. O script não executa migrações,
não altera SMTP, billing, Caddy ou infraestrutura.

## Preservação e reversão

- Snapshot dos hashes de todos os arquivos do app, da árvore separada de
  marketing e do Caddy; a raiz pública, `/conheca/` e `/robots.txt` também são
  conferidos por HTTPS.
- Lock compartilhado `/var/lock/maislouvor-deploy.lock`.
- Nenhum APK incluído no pacote; os downloads existentes são preservados.
- Backup privado de todos os arquivos que serão sobrescritos, antes da primeira
  troca. Assets antigos nunca são apagados. O service worker da landing deve
  permanecer idêntico.
- Cópia atômica de dependências primeiro, shell depois e `sw.js` por último.
- Hashes de todos os arquivos conferidos no servidor; rotas principais e assets
  do app conferidos por HTTPS. Falha provoca reversão automática dos arquivos
  substituídos. Assets novos com hash podem permanecer, sem substituir os antigos.
- Pacote e evidências em `/var/lib/maislouvor-deploy/<release>`, com acesso privado.

Reversão posterior, somente se os arquivos dessa release ainda forem os ativos:

```sh
python3 scripts/lojas/publish-integrated-web.py rollback \
  --release 20261009-web-integrada
```

A reversão restaura o frontend anterior e verifica `/login` por HTTPS. Ela não
reverte migrações nem remove registros de consentimento, direitos ou assinaturas.
Antes de reverter, coordenar a compatibilidade com o backend ativo. Qualquer
alteração posterior no site interrompe a reversão para não sobrescrevê-la.

## Validação da preparação

Seis testes isolados, sem rede nem produção: publicação e reversão completas;
preservação de APK/assets; bloqueio de produção alterada; reversão automática
quando a rota HTTPS difere; proteção contra pacote alterado/traversal; bloqueio
de reversão sobre uma publicação posterior. A inspeção remota é somente leitura.

Falta registrar aqui o commit efetivamente publicado, horário, hashes finais e
verificação visual de `/login`. Não houve publicação ao criar este documento.
