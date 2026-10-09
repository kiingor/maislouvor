# Home, assinatura e TestFlight 8 — 8 de outubro de 2026

## Mudança solicitada

Após testar uma conta criada com Apple no TestFlight 7, o responsável informou falha no carregamento dos planos, pediu uma chamada discreta na Home para equipes gratuitas e a retirada do botão Voltar da aba Assinatura.

- `5beff48`: chamada “Mais vagas para sua equipe / Amplie quando precisar / Ver planos” abaixo de Atividade da equipe. Só aparece ao responsável de uma equipe gratuita elegível; não carrega o SDK de compras na Home. O link seleciona a equipe e abre diretamente a aba Assinatura.
- O botão Voltar foi retirado dessa aba, preservando a navegação principal.
- `4279992`: cenário visual local com dados fictícios, em 440 × 956 e 320 × 956, sem overflow horizontal e com navegação entre abas conferida.
- `110867a`: fonte isolada da publicação, reunindo a UI de `5beff48` e os dois ajustes do trabalho paralelo para preservar `/baixar` nos service workers. Não inclui alterações locais de credenciais.

## Validação e publicação web

- Suíte do frontend: 60 arquivos, 505 testes passaram após a mudança de UI.
- Build normal, build para lojas e gate jurídico concluídos.
- Web publicada em 08/10/2026 às 21:36 BRT, release `20261009-home-planos-v2`, fonte `110867a`.
- Verificação de 223 arquivos, 140 assets HTTPS e sete rotas. Marketing, Caddy, APKs e página `/baixar` preservados.
- A primeira tentativa foi interrompida automaticamente antes de qualquer publicação porque o trabalho paralelo havia atualizado marketing e service workers. A segunda incorporou explicitamente os dois ajustes de fonte e usou novo inventário de proteção.
- Navegação real com service worker antigo confirmou atualização para o novo bundle, preservação de `/baixar` e login compacto sem scroll em 440 × 956.

As capturas da Home e da Assinatura em [home-assinatura-20261009](screenshots/home-assinatura-20261009/README.md) são cenários de teste com dados e preços fictícios; não comprovam ofertas ou compras reais da Apple.

## iOS

- Versão 1.0.0, build 8, bundle `com.maislouvor.app`.
- Archive em `/Volumes/MaisLouvorBuild/Archives/MaisLouvor-1.0.0-8.xcarchive`.
- 223 arquivos web conferidos por hash entre o bundle de lojas e o aplicativo assinado. Assinatura verificada; logs da bridge desativados; sem URL remota; plugin Purchases presente.
- Fonte e evidências em `/Volumes/MaisLouvorBuild/Release-1.0.0-8`.
- Upload interno concluído em 08/10/2026 às 21:39 BRT, `EXPORT SUCCEEDED`; a Apple informou que o pacote entrou em processamento. Disponibilidade confirmada em 08/10/2026 às 21:50 BRT: status **Em testes**, grupo **Teste iPhone**, um tester existente. As instruções de teste foram salvas e o grupo foi associado, sem novos convites. Compilação Apple `8b29957a-80d9-468f-88ce-59ca5caf7589`. Evidência local privada: `tmp/testflight-build8-em-testes.png`.

## Planos: diagnóstico e limite da confirmação

O acordo de apps pagos estava sem aceite. Após o responsável aceitar, a Apple passou a mostrar “Informações do usuário pendentes”, com conta bancária e declarações fiscais dos EUA pendentes. O responsável enviou os formulários fiscais, e os três passaram a Ativo na interface. O responsável concluiu o cadastro bancário, e a conta passou a **Processando**. A Apple informa prazo de até 24 horas para atualizar os dados bancários; o acordo de apps pagos ainda aparece com informações pendentes. Nenhuma declaração fiscal ou aceite foi enviado pelo agente. A conferência do TestFlight foi retomada depois do preenchimento e concluiu a liberação do build 8.

O catálogo RevenueCat foi inspecionado: bundle correto, oferta padrão atual e 66 pacotes Apple. O contexto da equipe e as chamadas de sincronização consultadas não mostraram falha de backend. Isso não substitui a confirmação de `getOfferings()` no aparelho após a ativação comercial. Detalhes em [diagnóstico](diagnostico-revenuecat-testflight-20261009.md).

Uma segunda restrição foi identificada: o backend de produção ignorava compras sandbox do TestFlight. A correção `cca827d` foi revisada e publicada como `20261009-apple-sandbox`. Há uma única autorização de teste, para o cliente da equipe indicada pelo responsável, limitada à App Store e válida até 22/10/2026 às 21:43:55 BRT. Nenhum plano é concedido apenas pela inscrição nessa autorização; a compra precisa ser confirmada pelo RevenueCat. A auditoria após a publicação confirmou contrato ainda gratuito, ausência de grants e ambiente global PRODUCTION preservado.

Validação da política: 33 checks PostgreSQL, 39 testes Deno, 163 verificações integradas, typecheck e preflight transacional com ROLLBACK. A publicação criou backup e conferiu as fontes, permissões e saúde dos endpoints. Detalhes e recuperação em [teste sandbox controlado](revenuecat-sandbox-controlado-20261009.md).

Não houve compra real nem envio público à App Store nesta etapa.
