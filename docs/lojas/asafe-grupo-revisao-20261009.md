# Asafe — grupo controlado para a revisão Apple

Em 09/10/2026 o responsável forneceu um convite do WhatsApp e pediu adicionar
o Asafe. A consulta ao convite e aos metadados da instância confirmou o grupo
**Teste a safe**, dois participantes, bot já presente e sessão conectada.
Não foi necessário entrar novamente. Mensagens anteriores não foram lidas.

O grupo estava ativo na equipe **Teste**, cujo consentimento administrativo
estava bloqueado. Antes de mudar, foi perguntado se deveria consultar a equipe
fictícia **Igreja Demonstração (App Review)**. O responsável selecionou essa
opção explicitamente. Nenhuma mudança foi feita no grupo do ministério real.

## Configuração realizada

- Backup privado da configuração anterior no NVMe, modo 0600.
- Confirmados zero avisos pendentes/processando e zero missões ativas/pausadas
  para esse grupo.
- Login real da conta Apple de demonstração, comprovada por `review_demo=true`.
- Ativação administrativa do Asafe registrada apenas sob a conta fictícia,
  pela RPC normal e na versão vigente do aviso. Trata-se da preparação da
  demonstração solicitada pelo responsável, não do consentimento de um revisor
  ou integrante real.
- Código gerado pelo fluxo normal, antigo vínculo desativado e novo ativado
  em transação com lock e conferência da origem esperada.
- Releitura autenticada confirmou o grupo na demo, ativo, com autorização
  administrativa válida e todos os cinco tipos de aviso automático desligados.
- Nenhum telefone, identidade WhatsApp ou consentimento individual foi
  atribuído à conta de demonstração. Nenhuma mensagem foi enviada.
- Nenhuma assinatura ou plano foi modificado. O vínculo técnico não valida
  cobrança nem concessão de recursos pagos.

O script privado executado ficou em `/tmp/maislouvor-link-review-asafe.py`;
backup e resultado em `/Volumes/MaisLouvorBuild/Asafe-Review-20261009`.
Credenciais foram usadas apenas em memória e não incluídas no registro.
O convite foi colocado somente nas notas privadas de App Review e não no Git
ou na ficha pública. O salvamento de 3960 caracteres foi conferido por leitura.

## Passos para quem testar

1. Entrar no +Louvor com a conta de demonstração fornecida privadamente.
2. Em Perfil → Assistente no WhatsApp, ler e permitir o uso pessoal dos dados
   pelo Asafe/OpenAI, se concordar.
3. Gerar o código de vínculo e enviá-lo no privado ao Asafe. Nunca mandar esse
   código no grupo: o aplicativo o invalida quando é exposto ali.
4. Entrar no grupo pelo convite privado e mencionar Asafe, por exemplo:
   “qual é o próximo culto?” e “qual é o repertório?”.
5. Conferir que a resposta contém somente dados da equipe fictícia.

A ativação não equivale ao QA de conversa completa. Nenhuma pergunta real
desse grupo foi encaminhada por esta execução à OpenAI. Quem apenas pedir
“ajuda” pode receber orientações sem concluir o vínculo pessoal; isso também
não comprova consulta aos dados da demonstração.

## Esclarecimento sobre a preparação de direitos musicais

Foi corrigida a formulação anterior que tratava anexar autorizações como um
requisito universal para qualquer submissão. As regras Apple 5.2.2 e 5.2.3
exigem permissão para os usos descritos e apresentação quando solicitada;
não estabelecem uma carta por música para todo app de conteúdo dos usuários.
Isso não comprova direitos sobre os uploads nem autoriza marcar declarações
sem base real. A origem dos arquivos, o processamento, o compartilhamento
público e a extração do YouTube precisam ser apresentados fielmente.

O [termo público do Cifra Club](https://www.cifraclub.com.br/aviso-legal.html)
descreve contribuições de usuários e retirada de conteúdo por reclamação.
Ele não comprova quais contratos privados a empresa tem. Não foi copiada
sua interpretação sobre responsabilidade legal para os termos do +Louvor.

Referências consultadas em 09/10/2026:
[Apple — conteúdo de usuários e propriedade intelectual](https://developer.apple.com/app-store/review/guidelines/).
O erro de compras Apple permanece um impedimento técnico independente.
