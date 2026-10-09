# Preenchimento do App Store Connect — 09/10/2026

O titular autorizou alterar a ficha e concluiu a autenticação de dois fatores
diretamente no Safari. App **6819834048**, idioma **Português (Brasil)**.

## Salvo e confirmado

Na versão em preparação, foram salvos e conferidos **após recarregar**:

- Descrição e texto promocional de `app-store/metadata-pt-BR.json`.
- URL de suporte `https://maislouvor.com/suporte`.
- Versão **1.0.0** e copyright **2026 Filipe Santos Lourenço**.
- Palavras-chave e URL de marketing já existentes conferem com o arquivo local.
- Lançamento **manual** mantido.

Em **Privacidade do app**, também salvos e conferidos após recarregar:

- URL `https://maislouvor.com/privacidade`.
- Rascunho com onze tipos coletados: nome, e-mail, telefone, informações
  confidenciais, mensagens, fotos/vídeos, áudio, suporte, outros conteúdos de
  usuário, ID de usuário e histórico de compras.

O questionário continua com **configuração adicional necessária** e não foi
publicado. Finalidades, vínculos e rastreamento ainda não foram confirmados na
ficha. Não confundir seleção dos tipos com declaração final de privacidade.

## Preparado no formulário, ainda não salvo

Foram preenchidos e conferidos os campos de login/senha da conta de demonstração
Apple, notas em inglês (**3.908 caracteres**), nome/sobrenome do responsável e
`suporte@maislouvor.com`. A Apple mantém **Salvar desabilitado** porque falta o
telefone para contato da revisão. O número foi solicitado ao titular; não foi
inferido de outras contas ou serviços.

O formulário permanece aberto no Safari, janela 51, aba 10 nesta sessão. A aba 11
contém Privacidade do app. Revalidar a janela/aba e o estado antes de retomar.
Não recarregar a aba da versão antes de concluir ou preservar o rascunho: esses
campos de revisão ainda não persistiram. Os metadados listados acima foram salvos
separadamente antes de preencher novamente o acesso da demo.

Credenciais apenas no arquivo local privado já documentado; não copiadas neste
registro. A senha da conta Apple do titular e o código de dois fatores não foram
lidos nem gravados.

## Limites do questionário

A conferência da fonte `26013cc` e do archive 9 sustenta as onze categorias para
funcionalidade do app e vínculo com a conta. Histórico de compras/User ID também
têm a finalidade Analytics na integração RevenueCat. Ainda há pontos a resolver:

- **YouTube:** os embeds padrão `youtube.com` podem coletar dados e exibir anúncios.
  Conferir categorias, finalidade, vínculo e rastreamento desse fornecedor antes
  de declarar ausência de tracking. As notas em inglês foram qualificadas para
  distinguir publicidade própria dos anúncios do player; não dizem mais apenas
  “No ads”. A política pública também merece reconciliação com esse fluxo.
- **Push no iOS 9:** `src/lib/push.ts` retorna antes do registro fora do Android;
  o archive não inclui Firebase. Não acrescentar Device ID por FCM com base só
  no texto amplo da política. Outros fornecedores ainda exigem análise própria.
- **IP/diagnóstico:** conferir a retenção real e a vinculação dos registros do
  servidor. Logs locais do ErrorBoundary não comprovam telemetria remota; IP não
  equivale automaticamente a localização.
- Estatísticas funcionais de escalas não comprovam coleta de cliques ou sessões.
  Dados de uso do player YouTube precisam de análise separada.

Fontes conferidas: [definições da Apple](https://developer.apple.com/app-store/app-privacy-details/),
[políticas YouTube](https://developers.google.com/youtube/terms/developer-policies)
e [player incorporado](https://support.google.com/youtube/answer/171780).

## Sem distribuição nova

Não foram adicionadas compilações ou capturas, nem acionados **Adicionar para
revisão**, **Publicar** ou lançamento. O TestFlight continua **1.0.0 (9)**. Erro
das ofertas, compra/restauração, capturas finais e validação pública permanecem
como no [registro anterior](preparacao-revisao-20261009.md).

Nota operacional: nesta sessão, Orca leu a interface e acionou links/botões,
mas `AXSetValue` e eventos sintéticos não alteraram os campos do Safari. A edição
funcionou com navegação por Tab e colagem pelos eventos de teclado do macOS,
sempre conferindo foco e valor. Não foi habilitado JavaScript de Apple Events.
Conteúdo sensível foi digitado por stdin, sem imprimir o valor; a área de
transferência usada nos textos públicos foi restaurada quando ainda continha o
valor desta operação.
