# Correção de reprodução e mixer no iOS — 09/10/2026

> Atualização em 11/10: **1.0.0 (13)** foi adicionada ao grupo **Teste iPhone**
> e confirmada **Em testes**, com o tester já existente. Evidência salva em
> `/Volumes/MaisLouvorBuild/Release-1.0.0-13/delivery-20261011/group-state.json`.
> Filipe confirmou em 11/10 que o mixer funciona. A demora ao abrir/trocar
> músicas está em [investigação e correção separadas](carregamento-audio-ios-20261011.md). O backend também recebeu
> a [correção dos vínculos de músicas nos cultos antigos](correcao-cultos-legados-20261011.md).

## Incidente e diagnóstico

Na compilação 1.0.0 (12), Filipe relatou áudio picotando ao reduzir uma faixa
no mixer de Baby Bird (demo), e relógio avançando sem som no ensaio da
Metodista. Confirmou que a web funciona normalmente.

O harness isolado no simulador reproduziu uma sequência contínua de `seeking`
nos elementos HTML de áudio. O ajuste periódico de 0,2 s disparava outra busca
antes de os decodificadores se recuperarem. Os reprodutores independentes do
WebKit também iniciavam em momentos diferentes. Correções por velocidade e
pré-carregamento foram experimentadas e descartadas por não manterem todas as
faixas sincronizadas. Não estão no código entregue.

Os arquivos reais existem e respondem à leitura autorizada. O MP3 Uma Coisa e
suas seis faixas foram lidos, sem atualização de registros ou reprocessamento.
Não foi demonstrada uma causa única para o silêncio no iPhone físico; a mudança
substitui o caminho de reprodução do WebKit que apresentava o problema.

## Implementação

- Somente o ensaio no iOS usa `RehearsalAudioPlugin`, com AVAudioEngine,
  AVAudioPlayerNode e um AVAudioUnitTimePitch comum.
- As faixas são agendadas para o mesmo instante. Volume, mute e solo alteram
  ganhos, sem reposicionar ou reiniciar os players.
- Downloads autenticados por URLs assinadas são temporários no dispositivo;
  os arquivos continuam comprimidos em disco e a decodificação é incremental.
  A liberação da tela cancela downloads e limpa os arquivos deste player.
- Sessão de áudio de mídia (`playback`) ativada ao tocar; pausa em interrupção,
  saída de fone e entrada em segundo plano. Sem retomada automática.
- Controles existentes de tom, velocidade, seek e loops permanecem. O adaptador
  agrupa comandos em uma operação de transporte, ignora respostas antigas e
  descarta carregamentos de músicas já abandonadas.
- Manifesto de privacidade declara `SystemBootTime / 35F9.1`: relógio monotônico
  usado apenas para sincronização e tempo decorrido da reprodução. Não há envio
  de horário de boot. [Razão documentada pela Apple](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).
- Erros de reprodução deixam de manter um estado visual de Play em andamento.
- Nenhuma alteração no banco, storage, fila Demucs ou músicas da igreja.
  O player web/Android permanece HTML/Web Audio; não foi necessário deploy web.

## Verificação

- Suíte completa: 572 testes / 67 arquivos; typecheck e build de loja aprovados.
- Compilação Swift Debug aprovada no simulador iOS 27 (iPhone 17e).
- UI real da demo: original, troca de música, mixer de cinco faixas, volume de
  100% para 60%, mute total (nível de saída zero), solo (um ganho não nulo),
  mudança de tom, pausa/retomada e loop a 1,5× exercitados.
- A medição de áudio no mixer nativo mostrou sinal enquanto os volumes eram
  alterados e não houve comandos de seek durante esses ajustes.
- Leitura real: MP3 de 360,54 s e seis stems da Metodista reproduzidos pelo
  plugin; sinal confirmado antes/depois de reduzir volume, seek para 160 s,
  velocidade 0,75× e transposição −2. O cache de teste foi removido.
- Medição do sinal no simulador não substitui a confirmação auditiva no iPhone
  de Filipe. Nenhuma nova separação de músicas reais foi enfileirada.

Evidências privadas locais: `/Volumes/MaisLouvorBuild/Audio-Incident-20261009`.
O harness e os arquivos de diagnóstico não integram o binário de distribuição.

## Entrega

Compilação **1.0.0 (13)**, fonte `a1a9650fd525c902ddb61012b73275f63a4a8fba`.

- Fonte congelada: `/Volumes/MaisLouvorBuild/Release-1.0.0-13`.
- Archive: `/Volumes/MaisLouvorBuild/Archives/MaisLouvor-1.0.0-13.xcarchive`.
- Archive aprovado, assinatura/ícone/plugin nativo/manifesto conferidos, 225
  arquivos web idênticos à fonte sincronizada. Sem o harness de diagnóstico.
- Configuração pública de API e RevenueCat idêntica à compilação 12.
- Upload aprovado às 22:01:32 de 09/10 (Fortaleza): `Upload succeeded` e
  `EXPORT SUCCEEDED` em `Release-1.0.0-13/upload.log`; pacote em processamento.
- Disponibilidade confirmada em 11/10: build 13 adicionada ao grupo Teste iPhone,
  status **Em testes**, um tester e onze compilações. Sem novos convites.
  O bloqueio da tela do Mac em 09/10 e a sessão expirada em 11/10 foram resolvidos
  pelo titular antes dessa confirmação.

Não há submissão para a loja pública nesta correção. RevenueCat permanece uma
validação separada. Filipe confirmou o mixer no iPhone em 11/10. A validação da melhoria de
carregamento da compilação 14 permanece separada.
