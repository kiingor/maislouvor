# Assinaturas no iPhone — 13/10/2026

## Retomada do erro

O responsável reproduziu `ML-IOS-OFFERINGS-23-BRA` no iPhone físico,
com o TestFlight **1.0.0 (14)** confirmado por `devicectl`. Modo Desenvolvedor
habilitado, conexão USB pareada. Não foi solicitada saída da conta Apple pessoal.

A captura inicial de syslog não trouxe uma resposta conclusiva da Apple. O filtro
não cobria todas as categorias do processo; não usar sua ausência de erros como
evidência. A coleta retrospectiva com `log collect` exigiu root e não foi executada
com elevação. Não se pediu outra repetição idêntica ao usuário.

## Consulta direta no aparelho

Preparada e instalada por USB uma cópia **de desenvolvimento** da versão 14,
mesmo bundle `com.maislouvor.app`, sem desinstalar o aplicativo. Base congelada:
`/Volumes/MaisLouvorBuild/Release-1.0.0-14`. Foi acrescentado apenas o probe nativo
de catálogo já utilizado no simulador, mantendo os três plugins locais, inclusive
o áudio nativo. O probe não compra, restaura ou troca contas.

Validação: compilação Debug aprovada; assinatura conferida; perfil contém o
aparelho; team correto; entitlement de desenvolvimento presente; 225 arquivos web
idênticos à base congelada; mesmas versões Swift resolvidas; sem servidor remoto
ou arquivo `.storekit`. Não houve upload de outro TestFlight nem deploy web.

Resultado às **22:28:46 BRT** (01:28:46 UTC de 14/10), iOS 27.0.1:

| Consulta | Produtos pedidos | Retornados | Resultado |
|---|---:|---:|---|
| StoreKit 2 direto, um produto | 1 | 0 | Concluiu sem erro, lista vazia |
| StoreKit 2 direto, catálogo | 66 | 0 | Concluiu sem erro, lista vazia |
| StoreKit 1 direto | 66 | 0 | 66 IDs classificados inválidos, sem NSError |

O StoreKit 2 informou **USA** nesta instalação de desenvolvimento. O StoreKit 1
não retornou país no relatório. Isso reproduz a ausência de produtos sem depender
do RevenueCat, **neste ambiente USA de desenvolvimento**. Não prova a causa do
erro BRA observado antes no TestFlight. As assinaturas continuam restritas ao
Brasil; nenhuma disponibilidade ou preço foi alterado por hipótese.

## Próxima comparação

Solicitado entrar na conta Sandbox brasileira já criada, em Ajustes → Desenvolvedor
→ Conta Apple Sandbox, preservando a conta pessoal. Após confirmação, relançar a
cópia de diagnóstico, recuperar novo relatório e comparar país/quantidades antes
de decidir sobre alterações no catálogo.

A [documentação Apple](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox)
permite usar a conta Sandbox na instalação assinada para desenvolvimento sem sair
da conta pessoal. Esse procedimento difere do acesso aos controles Sandbox de
uma instalação TestFlight. Um eventual sucesso aqui ainda exige confirmar o
fluxo de compra/restauração e, depois, o comportamento da distribuição TestFlight.

Artefatos locais privados:

- `/Volumes/MaisLouvorBuild/Development-Catalog-14-20261013`: fonte diagnóstica,
  log de compilação e verificações sanitizadas.
- `/Volumes/MaisLouvorBuild/Billing-Incident-20261013/storekit-device-direct.json`:
  resultado direto, sem contas, tokens, recibos ou detalhes pessoais.
- `/Volumes/MaisLouvorBuild/Billing-Incident-20261013`: confirmação de instalação
  e execução; metadados do aparelho não devem ser versionados.

A instalação atual no aparelho é a cópia de desenvolvimento 14. Para voltar à
distribuição normal, instalar novamente a versão 14 pelo TestFlight, sem apagar o
app. Compra, restauração e concessão do plano ainda não foram validadas.

## Backend de teste conferido

Consulta SQL somente leitura confirmou uma autorização Sandbox ativa, com prazo
até **22/10/2026 às 21:43:55 BRT** e dono correspondente ao dono atual da equipe.
O contrato autorizado continua `free/manual`, sem produto, ambiente de compra,
entitlements ou acesso ilimitado. Nenhuma assinatura foi concedida ou alterada.

A página de Negócios do App Store Connect redirecionou para autenticação; os
estados de contratos/banco/fiscal documentados em 09/10 não foram reconfirmados
nesta execução. A consulta direta e a instalação via Xcode puderam prosseguir.

## Recuperação do acesso Sandbox — continuação em 13/10

O responsável não lembrava a senha. A conversa original foi localizada: o agente
preparou o formulário e o próprio responsável definiu a senha no Safari. Não foi
encontrada uma senha Sandbox fornecida nas mensagens consultadas. O detalhe da
conta permite alterar região e frequência de renovação, mas não a senha; isso
confere com a documentação Apple sobre criação de contas Sandbox.

Foi deixado um novo formulário, ainda **não enviado**, com alias do Gmail do
responsável e região Brasil. Falta ele preencher Senha/Confirmar senha e criar.
A conta anterior foi preservada. Confirmar qual conta foi criada antes do próximo
login no aparelho; não registrar senha neste documento nem reutilizar credenciais
do e-mail de suporte ou da conta de revisão do +Louvor.

A sessão web voltou a ficar acessível. Acordo de apps pagos, banco e três
formulários fiscais foram reconfirmados como ativos. A página também exibe aviso
de atualização do contrato do Programa Apple Developer e "Ativo (novo contrato
disponível)" no acordo de apps gratuitos. Nenhum contrato foi aceito; esse aviso
é uma pendência a revisar com o titular, não uma causa comprovada do erro 23.

## Catálogo disponível após login Sandbox — 22:39 BRT

O responsável informou que conectou outra conta Sandbox de sua escolha (não o
alias proposto). O app de desenvolvimento foi relançado pelo cabo e gerou um novo
relatório às **22:39:01 BRT**, agora com país **BRA**:

| Consulta | Produtos pedidos | Retornados | Resultado |
|---|---:|---:|---|
| StoreKit 2 direto, um produto | 1 | 1 | Produto encontrado, sem erro |
| StoreKit 2 direto, catálogo | 66 | 66 | Catálogo completo, sem erro |
| StoreKit 1 direto | 66 | 66 | Zero IDs inválidos, sem erro |

Evidência: `/Volumes/MaisLouvorBuild/Billing-Incident-20261013/storekit-after-sandbox.json`.
O responsável também confirmou que **os planos apareceram na tela do +Louvor**.
Não houve mudança de produtos, preços, países de venda, SDK ou versão entre as
duas consultas. Isso comprova funcionamento do catálogo e da exibição de ofertas
na instalação de desenvolvimento com Sandbox Brasil. Não extrapolar para uma
correção já validada no TestFlight com a conta Apple pessoal.

Às 22:39:59 BRT, o contrato da única equipe autorizada para teste ainda estava
`free/manual`, sem produto ou entitlement, com autorização ativa e dono correto.
Solicitada compra de teste **nessa equipe**, conferindo a identificação Sandbox
na confirmação da Apple. Aguardando resultado para validar reconhecimento pelo
RevenueCat, sincronização no backend e restauração; nenhuma compra foi confirmada
pelo agente nem plano concedido manualmente.


## Compra Sandbox confirmada — 22:43 BRT

O responsável concluiu a compra no aparelho. Consulta somente leitura ao backend
às 22:43:33 BRT confirmou Completo mensal com 10 vagas, `revenuecat/app_store`,
ambiente `SANDBOX`, um entitlement e acesso ativo. A autorização de teste e o dono
da equipe continuavam correspondentes. Não houve concessão manual de assinatura.
Isso comprova compra e sincronização do acesso neste aparelho de desenvolvimento;
não comprova entrega de webhook nem restauração. Não generalizar para a instalação
TestFlight com a conta pessoal que apresentava o erro de ofertas.

## Ajustes de interface após a compra

- Assinatura ativa começa no resumo do plano atual; Atualizar, Restaurar e
  Gerenciar aparecem juntos. Alterar plano abre o editor; Cancelar alteração
  fecha sem executar compra ou mudança. Aumento de vagas e gerenciamento mantêm
  os fluxos existentes. Convites que precisam de vagas ainda abrem o editor.
- Asafe ganha aba própria em Usuário, separada de Perfil e Equipe. A permissão
  pessoal continua acessível a integrantes; só líderes veem a gestão da equipe.
- Guia, ativação, uso, privacidade da equipe, instruções, avisos e missões ficam
  em seções expansíveis. Grupos e permissão pessoal continuam em destaque.
  Ativação aparece aberta quando ainda não há grupo conectado.
- Caminhos citados em consentimentos, termos, privacidade e suporte apontam para
  Usuário › Asafe. O conteúdo e as regras de consentimento foram preservados.
- Compra+sincronização confirmadas; restauração ainda depende de teste real.

Verificação de interface: WebKit nas larguras 320, 390, 440 e 1280, claro/escuro
(16 combinações entre Assinatura e Asafe), dados sintéticos, sem transações.
Ações da assinatura em uma linha, cinco abas legíveis, sem overflow horizontal,
abertura/fechamento das seções e separação da aba Equipe confirmados.
Preparação de versão iOS 1.0.0 (15); publicação registrada separadamente após êxito.


## Restauração e publicação inicial — 13/10, 22:54–22:58 BRT

- Web publicada: `20261013-web-settings-ux`, commit `32a08f0`, às 22:54 BRT.
  226 arquivos e 143 assets HTTPS conferidos, sete rotas válidas; marketing,
  APKs e assets anteriores preservados.
- Desenvolvimento 1.0.0 (15) instalado e aberto no iPhone via USB. Assinatura
  verificada e 225 assets idênticos à fonte congelada, sem o probe StoreKit.
- O responsável confirmou **Restaurou e mostrou meu plano**. Consulta somente
  leitura às 22:56:23 BRT manteve Completo mensal/10 vagas, app_store/SANDBOX,
  um entitlement e acesso ativo. Compra, sincronização e restauração validadas
  nesta instalação de desenvolvimento com Sandbox Brasil.
- Archive 15 validado e upload Apple concluído às 22:58 BRT. A disponibilidade
  ao grupo TestFlight não foi conferida antes dos ajustes seguintes.

## Refinamentos solicitados durante o teste

O responsável apontou ambiguidade entre ativar um grupo e identificar o líder.
O banco já distingue assistant_groups de assistant_wa_identities; a confirmação
visual de consentimento pessoal dizia que o assistente reconhecia a pessoa mesmo
sem vínculo individual. O aceite agora confirma só a permissão. A tela usa
**Seu WhatsApp pessoal / Conectar meu WhatsApp** e **Ativar um grupo da equipe /
Gerar código do grupo**, com instrução explícita de que o líder também precisa
ser identificado. O estado Conectado ao seu perfil depende do vínculo pessoal.
Após gerar o primeiro código, a tela consulta o vínculo enquanto o código vale;
a confirmação limpa o código usado. Há também atualização manual do vínculo.

Aba Membros: resumo da capacidade real via RPC existente, integrantes usados,
limite do plano, vagas restantes, contagem incluindo o líder e acesso à aba
Assinatura. Equipes ilimitadas continuam sem teto. Falha de consulta não mostra
um limite presumido. Troca de equipe ou mudança na lista refaz a consulta.

Instruções textuais do bot apontam para Usuário › Asafe / Conectar meu WhatsApp.
Nenhuma regra de consentimento, vínculo, música ou assinatura foi alterada no banco.
Verificações: 104 testes de interface/cobrança; 140 verificações unitárias do Asafe;
TypeScript e WebKit 320/390/440/1280 claro/escuro para Asafe e Membros.
Preparação da compilação 16, que inclui estes refinamentos posteriores à 15.
