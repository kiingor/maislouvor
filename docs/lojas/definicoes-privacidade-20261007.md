# Definições de privacidade após o formulário — 07/10/2026

Estado: dados recebidos e pesquisa concluída; documentos em preparação local. Não houve publicação, envio ao TestFlight, alteração de backups nem envio de e-mails nesta etapa.

**Atualização de 08/10:** grafia do sobrenome e cidade/UF/CEP confirmados pelo titular e aplicados. Origem do conteúdo esclarecida: os usuários escolhem os sites por conta própria e enviam os arquivos, ou usam a importação do YouTube quando disponível. Não foi apresentada autorização/licença para o acervo ou para a importação da plataforma de origem.

## Dados recebidos

O titular informou pessoa física, identificação, endereço parcial, um contato Outlook para suporte e privacidade e Hostinger no Brasil. Esses valores foram incorporados à fonte dos documentos em `src/lib/legal.ts`, sem duplicar documento fiscal e endereço neste registro. O documento informado passou na verificação dos dígitos; isso não verifica titularidade.

Cidade/UF/CEP e a grafia do sobrenome foram confirmados em 08/10 e atualizados na fonte. O responsável indicado atende o canal de privacidade; o texto não o apresenta automaticamente como encarregado formal. Nomear encarregado e avaliar dispensa são decisões distintas de atender solicitações.

## Tratamento ligado à religião

A LGPD inclui convicção religiosa e filiação a organização religiosa entre dados sensíveis. O art. 11, I admite consentimento específico, destacado e para finalidades específicas; o art. 8 exige prova e prevê revogação facilitada. Participação em equipes e escalas de culto pode revelar esse vínculo. A inferência para este produto é tratar essa informação como sensível, mesmo sem perguntar a religião da pessoa. [LGPD, arts. 5, 8, 9 e 11](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).

**Proposta técnica para revisão jurídica:** usar consentimento específico para o vínculo de equipe e participação nas atividades. O aceite geral dos Termos e o consentimento do Asafe não comprovam esse consentimento separado. Não foi preenchida uma base como se o mecanismo já existisse.

Fluxo proposto, ainda não implementado:

1. Aviso separado antes de entrar/criar equipe, com caixa inicialmente desmarcada, finalidade e consequências da recusa. A liderança não aceita por outras pessoas.
2. Rascunho: “Autorizo o +Louvor a tratar meu vínculo com equipes e minha participação em escalas e cultos, que podem revelar convicção religiosa, para organizar as atividades das equipes de que participo. Sei como revogar esta autorização nos ajustes de privacidade.”
3. Registro por pessoa, versão, finalidade e data, com proteção contra alteração direta no banco. Login Google/Apple e contas antigas devem passar pelo mesmo fluxo, sem aceite automático herdado dos termos.
4. Revogação pelo app, com interrupção efetiva do tratamento e tratamento explícito dos vínculos/dados já existentes. Acesso à exclusão, suporte e documentos deve permanecer disponível. Examinar também pessoas cadastradas pelo líder, links públicos, menores, notificações e dados enviados ao Asafe.
5. Separar autorizações opcionais de IA e compartilhamento público. Descrever os papéis do +Louvor e de cada equipe conforme as decisões reais sobre os dados.

Não é uma conclusão de conformidade ou substituto de parecer jurídico. A implementação deve seguir a avaliação das finalidades, necessidade e operações reais.

## Referências de produtos semelhantes

- [Planning Center — Congregant Privacy](https://www.planningcenter.com/congregant-privacy): distingue os dados de congregantes controlados pelas igrejas e o papel de processamento do fornecedor, explica finalidades e direitos. O modelo contratual e a legislação citada diferem do +Louvor.
- [ChurchKit — Privacy Policy](https://churchkit.io/privacy): reconhece que avaliações podem revelar crenças religiosas e restringe os dados à igreja que publicou a avaliação.

São exemplos de transparência e separação de responsabilidades, sem comprovar uma base legal brasileira para o +Louvor.

## Canal de privacidade e encarregado

A [Resolução ANPD nº 2/2022](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022) prevê dispensa de encarregado para agentes enquadrados no tratamento diferenciado, mantendo canal de comunicação. Existem exclusões, inclusive tratamento de alto risco, cujo critério combina fatores gerais e específicos. O enquadramento não foi concluído apenas por o titular ser pessoa física.

A [Resolução ANPD nº 18/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/encarregado-completo_ocultado.pdf) prevê indicação formal e análise de conflito de interesse. Por isso, a página identifica atendimento de privacidade, sem declarar nomeação ou dispensa como fatos já estabelecidos.

## Backups

**Prazo proposto escolhido: até 30 dias**, com cópia diária e recuperação testada. É uma decisão operacional para equilibrar recuperação e retenção, não um prazo obrigatório da LGPD. A política pública só deve afirmar esse limite depois de a configuração corresponder a ele.

Inspeção somente de leitura na VPS:

- Existem cópias de implantação em `/var/backups/maislouvor` e `/var/lib/maislouvor-deploy`. Não equivalem à comprovação de backup periódico do banco e dos arquivos dos usuários.
- O timer de aplicação encontrado é de outro produto; seu script não referencia MaisLouvor/Supabase, mas cobre a Evolution compartilhada. Nenhuma configuração desse produto foi alterada.
- Não foi identificado, nas unidades e cron consultados, um agendamento dedicado de banco/Storage do +Louvor. A existência e retenção efetivas das cópias do provedor precisam de confirmação no painel Hostinger.
- A [documentação de VPS da Hostinger](https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/) descreve duas cópias semanais e, quando habilitadas, duas diárias. Essa documentação não comprova a configuração desta conta.

Antes de declarar 30 dias: inventariar dados nas cópias, confirmar cobertura do banco/Storage e Evolution, configurar retenção compatível em todas as camadas, guardar cópia protegida fora da VPS, testar restauração e reaplicação de exclusões. Nenhuma cópia antiga foi apagada nem configurado descarte automático nesta etapa. O campo permanece marcado como pendente.

## E-mail e conteúdo musical

Suporte e privacidade usam o contato fornecido. O SMTP de produção ainda contém configuração de exemplo; não houve teste de entrega ou alteração, conforme o adiamento do titular. Endereço público e envio automático são configurações distintas.

O titular esclareceu em 08/10 que os usuários escolhem a origem dos arquivos e os enviam, ou importam do YouTube. Os Termos agora descrevem esse fluxo, preservam a titularidade de terceiros e limitam a licença ao que o usuário está autorizado a conceder. Compra de um arquivo, acesso público e uso sem lucro não comprovam autorização para todos os usos pretendidos.

O código existente de `src/lib/storeBuild.ts` desativa a importação de áudio do YouTube nos bundles das lojas. Upload de arquivos, player incorporado e separação local de faixas continuam disponíveis. A web mantém a importação; esse fato não demonstra que a operação está autorizada pela plataforma de origem. Nenhum desses recursos foi alterado nesta atualização dos documentos.

A [Apple, regra 5.2.3](https://developer.apple.com/app-store/review/guidelines/#intellectual-property), exige autorização explícita da fonte para baixar/converter mídia de terceiros. O [Google Play](https://support.google.com/googleplay/android-developer/answer/9888072?hl=pt-BR) também proíbe incentivo à violação de direitos autorais. Uma declaração do usuário, isoladamente, não comprova as autorizações necessárias nem garante aprovação. Permanecem os recursos de registro de origem, denúncia e retirada já implementados; Asafe e Demucs preservados.

## Pendências desta etapa

- Revisar e implementar o tratamento específico de dados sensíveis.
- Confirmar e configurar a retenção efetiva de backups antes de publicar o prazo.
- SMTP segue adiado; origem musical esclarecida, licenças/autorização da importação não demonstradas.
- Sem publicação até que documentos e comportamento implementado estejam coerentes.
