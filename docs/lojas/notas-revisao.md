# Notas para a revisão das lojas

Textos prontos para o App Store Connect ("App Review Information") e para o Play
Console ("Conteúdo do app → Acesso ao app"), em inglês, e um checklist em
português das respostas dos formulários.

As contas são criadas por `scripts/review-demo/seed.mjs` (ver o README da pasta):
**uma por loja**, cada uma com a sua equipe, para a revisão de uma loja não
atrapalhar a da outra. Rode `--reset --yes --store <loja>` **antes** de cada envio
para aquela loja e depois de cada resposta dela, **nunca durante** a revisão dela
(o reset apaga e recria a conta, e a sessão do revisor cairia). O reset de uma loja
não toca na conta da outra.

| Loja | Login | Senha (campo do `credentials.json`) | Equipe |
| --- | --- | --- | --- |
| App Store | `revisao@maislouvor.com` | `accounts.apple.password` | Igreja Demonstração (App Review) |
| Google Play | `revisao.google@maislouvor.com` | `accounts.google.password` | Igreja Demonstração (Play Review) |

## Como preencher

Os marcadores abaixo se preenchem **só nos formulários das lojas**, na hora de
colar. **Não edite este arquivo com a senha** nem o commite preenchido: a senha
ficaria no histórico do git. Ela existe só em
`~/.local/share/maislouvor-review/credentials.json` (arquivo `600`).

| Marcador | De onde vem |
| --- | --- |
| `{{APPLE_REVIEW_PASSWORD}}` | `accounts.apple.password` do arquivo de credenciais |
| `{{GOOGLE_REVIEW_PASSWORD}}` | `accounts.google.password` do arquivo de credenciais |
| `{{CONTACT_EMAIL}}` | e-mail de contato para a revisão — **a definir** (ex.: o e-mail de suporte de `platform_settings`) |

Os rótulos entre aspas são os textos da interface em português, como o revisor vai
vê-los. Foram conferidos de novo depois da integração em `feat/conformidade-lojas`
(exclusão de conta, moderação do chat, termos e consentimento do Asafe).

---

## App Store Connect — Notes for Review

**Sign-in required:** Yes
**User name:** `revisao@maislouvor.com`
**Password:** `{{APPLE_REVIEW_PASSWORD}}`

```text
+Louvor helps church worship teams plan services, rehearse songs and talk to each other. The app is in Brazilian Portuguese.

DEMO ACCOUNT
Sign in with the e-mail and password above on the login screen and tap "Entrar" (please do not use "Entrar com Google"). On the first sign-in, tap "Aceitar e continuar" to accept the Terms of Use and Privacy Policy. The account is the leader and owner of a fictitious team, "Igreja Demonstração (App Review)", with four fictitious members. All data is made up for this review, and the account is used only for App Store review.

WHERE TO FIND THE MAIN FEATURES (bottom tab bar: "Cultos", "Repertório", "Início", "Chat", "Usuário")
1. Repertoire: "Repertório" > "Repertório da Demonstração" (6 songs). Tap a song to see its chord chart, key and lyrics.
2. Rehearsal mode with multitrack mixer: in the repertoire tap "Ensaio", then pick "Baby Bird (demo)". Tap "Mixer" to mute/solo its 5 tracks (vocals, drums, bass, guitar, keys). Tap "Loop" (repeat icon) to see the saved loops with notes. This recording is a CC BY 3.0 excerpt by Admiral Bob (credit in the song's chart). The other 5 songs were written for this demo and use a synthesized guide track.
3. Services and schedule: "Cultos" > "Culto de Domingo" shows the order of service, the lineup ("Escala") with confirmed and pending members, and a per-service key. "Modo ensaio" is also available there.
4. Availability: on "Início" tap the "Disponibilidade" card to open the calendar and mark days as available or unavailable.
5. Chat, report and block: "Chat" > "Geral" has messages from the fictitious members (there is also the "Ensaios" channel). Touch and hold a message from "Ana Exemplo" to open its menu, then choose "Denunciar" (report: pick a reason and tap "Enviar") or "Bloquear Ana" (block). Reports are reviewed by the team leaders and by the +Louvor team within 24 hours; as the leader of this team you can see them in "Usuário" > "Membros" > "Denúncias do chat". Blocked users are listed, and can be unblocked, in "Usuário" > "Meu usuário" > "Usuários bloqueados".
6. Account deletion: "Usuário" > "Meu usuário" > "Excluir minha conta" (near the end of the page, above "Sair"). Because this account owns a team with other members, the app first asks who will take over the team: under "Novo dono(a)" choose "Ana Exemplo · Editor" and tap "Transferir". Then type EXCLUIR in the confirmation field and tap "Excluir conta". The account and its personal data are deleted; the team stays with its new owner. Deletion is also explained on the web at https://maislouvor.com/excluir-conta. We restore this demo account after the review.
7. Privacy Policy: https://maislouvor.com/privacidade - Terms of Use: https://maislouvor.com/termos - Support: https://maislouvor.com/suporte. New accounts must accept the Terms and Privacy Policy at sign-up.

ASAFE (OPTIONAL WHATSAPP ASSISTANT)
"Asafe" is an optional assistant that a team leader can add to the team's WhatsApp group. It is suspended for this demo team: under "Usuário" > "Equipe" you will see "Assistente suspenso nesta equipe", and it does not answer in WhatsApp. No WhatsApp account is needed to review the app. On that screen, "Gerar código de ativação" shows how the assistant works: messages are processed by a third-party AI provider (OpenAI, USA), and the leader must give explicit consent ("Concordo e ativar") before any use. Because the assistant is suspended for this team, a generated code does not activate any WhatsApp group.

OTHER NOTES
- No in-app purchases and no ads.
- Push notifications are optional; the app works without them.

Contact: {{CONTACT_EMAIL}}
```

---

## Google Play Console — App access

Em "Conteúdo do app → Acesso ao app": **Todas ou algumas funcionalidades estão
restritas** → adicionar instrução. O texto abaixo fica abaixo de 500 caracteres
para caber no campo de instruções: são 461 com o marcador, então cabe um e-mail de
contato de até ~55 caracteres.

- **Name:** `Demo leader account (Google Play)`
- **Username / e-mail:** `revisao.google@maislouvor.com`
- **Password:** `{{GOOGLE_REVIEW_PASSWORD}}`
- **Any other information required to access your app:**

```text
Tap "Entrar" with e-mail/password (not Google), then "Aceitar e continuar". Fictitious team, data reset between reviews. Report/block: Chat > Geral > long-press Ana's message > "Denunciar" or "Bloquear Ana". Delete account: Usuário > Meu usuário > "Excluir minha conta"; this account owns the team, so pick "Ana Exemplo" as new owner, tap "Transferir", type EXCLUIR. The optional WhatsApp assistant (Asafe) is suspended for this team. Contact: {{CONTACT_EMAIL}}
```

---

## Checklist dos formulários (pt-BR)

### Classificação etária

- **Apple (questionário de idade):** conteúdo gerado por usuários / mensagens entre
  usuários: **sim** (chat da equipe, com denunciar e bloquear). Acesso irrestrito à
  web: não. Compras/jogos de azar/violência/conteúdo adulto: não. Conferir a faixa
  sugerida no fim do questionário.
- **Google Play (IARC):** usuários interagem/se comunicam: **sim**; compartilha
  localização: não; compras digitais: não; conteúdo gerado por usuários: **sim**.
- **Anúncios:** o app **não** contém anúncios (Play: "Não"; Apple: sem SDK de
  publicidade).

### Segurança dos dados (Play) e Privacidade do app (Apple) — pontos de partida

Conferir com a política em `/privacidade` antes de enviar.

- **Coletados:** nome, e-mail, telefone (opcional, no perfil), foto de perfil
  (opcional), mensagens e mídias do chat (texto, áudio, imagens), conteúdo do app
  (músicas, cifras, áudios enviados, escalas, disponibilidade), identificadores de
  conta e token de push do aparelho.
- **Finalidade:** funcionalidade do app e gestão da conta. Sem publicidade, sem
  rastreamento entre apps/sites (Apple: "Data Not Used to Track You").
- **Compartilhamento com terceiros:** provedores de IA contratados (recursos de IA
  do app, como transposição e sugestões); OpenAI (EUA) para o Asafe, só quando o
  líder ativa (com o aceite dele) e, para os dados de cada pessoa, só com a
  permissão dela (opt-in; quem já usava fica reconhecido até decidir); WhatsApp (Meta) para o Asafe; Google, se a pessoa
  entrar com Google.
- **Criptografia em trânsito:** sim (HTTPS).
- **Exclusão:** sim — no app ("Excluir minha conta") e na web
  (`https://maislouvor.com/excluir-conta`), que é o link pedido pelo Play.
- **Política de privacidade:** `https://maislouvor.com/privacidade`.

### Riscos a decidir antes do envio

- **Importação do YouTube (Apple 5.2.3; política do Play sobre propriedade
  intelectual) — decisão pendente.** O líder da conta de revisão é admin, então o
  revisor vê no editor de música o campo "Cole o link do YouTube…", o botão
  "Importar áudio da gravação" e a dica "Use o YouTube para importar"; os áudios
  adicionais por link do YouTube passam pelo mesmo caminho. O áudio é baixado no
  servidor. Deixar o YouTube fora dos dados e destas notas **não** reduz o risco:
  é o motivo mais provável de recusa. Caminho que mantém o serviço:
  1. **Site (maislouvor.com):** a importação continua como está.
  2. **Apps iOS/Android:** tirar a importação de forma permanente por plataforma
     (`Capacitor.isNativePlatform()`), nunca por chave remota ou só durante a
     revisão — esconder uma função do revisor viola a Apple 2.3.1. No app, o campo
     vira só "Link da gravação" (guardado para consulta, com o player oficial do
     YouTube em "Conferir versão"), e o áudio entra pelo envio do arquivo da
     própria pessoa ou por fontes licenciadas (como a importação do Moises).
  3. O que foi importado no site chega ao app pela mesma conta (áudio, faixas,
     tom, loops). Isso continua numa zona cinzenta para as lojas: reforçar nos
     Termos que a pessoa só envia ou importa áudio que tem direito de usar.

  Alternativa sem importação nenhuma: só arquivos próprios e fontes licenciadas.
  Pedir autorização ao YouTube não é realista: os termos dele proíbem baixar o
  conteúdo fora dos recursos oficiais.
- **Login com Google no iOS (Apple 4.8):** quem oferece login de terceiros precisa
  oferecer também uma opção equivalente, como "Iniciar sessão com a Apple", no app
  iOS.
- **Asafe suspenso na equipe de revisão:** o revisor vê o aviso vermelho
  "Assistente suspenso nesta equipe · Fale com o suporte do +Louvor". O número do
  bot e "Gerar código de ativação" continuam na tela de propósito: gerar o código
  mostra o aviso de IA e o consentimento ("Concordo e ativar"), que a Apple quer
  ver (5.1.2(i)). Desde a integração, o código de uma equipe suspensa **não ativa
  grupo nenhum** (`assistant_activate_group` responde `team_suspended` e o bot diz
  que está suspenso), e a tela avisa isso embaixo do botão.
- **Planos e cobrança (Apple 3.1.1):** o app não tem compra dentro dele; se o iOS
  passar a mostrar planos pagos, a cobrança precisa seguir as regras da Apple.
