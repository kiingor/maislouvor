# Notas para a revisão das lojas

Textos prontos para o App Store Connect ("App Review Information") e para o Play
Console ("Conteúdo do app → Acesso ao app"), em inglês, e um checklist em
português das respostas dos formulários.

A conta é criada por `scripts/review-demo/seed.mjs` (ver o README da pasta). Rode
`--reset --yes` **antes** de cada envio e **nunca durante** uma revisão em
andamento: o reset apaga e recria a conta, e a sessão do revisor cairia.

## Preencher antes de colar

Substitua estes marcadores (só aparecem aqui):

| Marcador | De onde vem |
| --- | --- |
| `{{REVIEW_PASSWORD}}` | campo `password` de `~/.local/share/maislouvor-review/credentials.json` |
| `{{CONTACT_EMAIL}}` | e-mail de contato para a revisão — **a definir** (ex.: o e-mail de suporte de `platform_settings`) |

O login é sempre `revisao@maislouvor.com`. Os rótulos entre aspas são os textos
da interface em português, como o revisor vai vê-los.

---

## App Store Connect — Notes for Review

**Sign-in required:** Yes
**User name:** `revisao@maislouvor.com`
**Password:** `{{REVIEW_PASSWORD}}`

```text
+Louvor helps church worship teams plan services, rehearse songs and talk to each other. The app is in Brazilian Portuguese.

DEMO ACCOUNT
Sign in with the e-mail and password above on the login screen and tap "Entrar" (please do not use "Entrar com Google"). The account is the leader of a fictitious team, "Igreja Demonstração (App Review)", with four fictitious members. All data is made up for this review and is reset before each submission.

WHERE TO FIND THE MAIN FEATURES (bottom tab bar: "Cultos", "Repertório", "Início", "Chat", "Usuário")
1. Repertoire: "Repertório" > "Repertório da Demonstração" (6 songs). Tap a song to see its chord chart, key and lyrics.
2. Rehearsal mode with multitrack mixer: in the repertoire tap "Ensaio", then pick "Baby Bird (demo)". Tap "Mixer" to mute/solo its 5 tracks (vocals, drums, bass, guitar, keys). Tap "Loop" (repeat icon) to see the saved loops with notes. This recording is a CC BY 3.0 excerpt by Admiral Bob (credit in the song's chart). The other 5 songs were written for this demo and use a synthesized guide track.
3. Services and schedule: "Cultos" > "Culto de Domingo" shows the order of service, the lineup ("Escala") with confirmed and pending members, and a per-service key. "Modo ensaio" is also available there.
4. Availability: on "Início" tap the "Disponibilidade" card to open the calendar and mark days as available or unavailable.
5. Chat: "Chat" > "Geral" has messages from the fictitious members; there is also the "Ensaios" channel. To report a message or block a user, open the menu of a message sent by another member (for example "Ana Exemplo").
6. Account deletion: "Usuário" > "Meu usuário" > "Excluir minha conta". The same request can be made on the web at https://maislouvor.com/excluir-conta. Deleting this demo account removes the demo team; we restore it before the next review.
7. Privacy Policy: https://maislouvor.com/privacidade - Terms of Use: https://maislouvor.com/termos - Support: https://maislouvor.com/suporte. New accounts must accept the Terms and Privacy Policy at sign-up.

ASAFE (OPTIONAL WHATSAPP ASSISTANT)
"Asafe" is an optional assistant that a team leader can add to the team's WhatsApp group. Before it is used, the app explains that messages are processed by a third-party AI provider and asks for explicit consent. It is turned off for the demo team (you will see "Assistente suspenso nesta equipe" under "Usuário" > "Equipe"), and no WhatsApp account is needed to review the app.

OTHER NOTES
- No in-app purchases and no ads.
- Push notifications are optional; the app works without them.

Contact: {{CONTACT_EMAIL}}
```

---

## Google Play Console — App access

Em "Conteúdo do app → Acesso ao app": **Todas ou algumas funcionalidades estão
restritas** → adicionar instrução.

- **Name:** `Demo leader account`
- **Username / e-mail:** `revisao@maislouvor.com`
- **Password:** `{{REVIEW_PASSWORD}}`
- **Any other information required to access your app:**

```text
Sign in with e-mail and password and tap "Entrar" (do not use Google sign-in). The account leads a fictitious demo team; all data is made up and reset between reviews. Rehearsal mixer: "Repertório" > "Repertório da Demonstração" > "Ensaio" > "Baby Bird (demo)" > "Mixer". Account deletion: "Usuário" > "Meu usuário" > "Excluir minha conta" or https://maislouvor.com/excluir-conta. The optional WhatsApp assistant (Asafe) is off for this team. Contact: {{CONTACT_EMAIL}}
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
  líder ativa e com consentimento; WhatsApp (Meta) para o Asafe; Google, se a pessoa
  entrar com Google.
- **Criptografia em trânsito:** sim (HTTPS).
- **Exclusão:** sim — no app ("Excluir minha conta") e na web
  (`https://maislouvor.com/excluir-conta`), que é o link pedido pelo Play.
- **Política de privacidade:** `https://maislouvor.com/privacidade`.

### Riscos a decidir antes do envio

- **YouTube (Apple 5.2.3; política do Play sobre conteúdo de terceiros):** a
  importação de áudio por link do YouTube baixa o áudio no servidor. É o ponto mais
  provável de recusa. A conta de revisão não tem nenhum link do YouTube e estas
  notas não citam a importação; a decisão sobre como manter o serviço fica em
  aberto (ver o relatório da entrega). Não esconder a função só durante a revisão
  (Apple 2.3.1).
- **Login com Google no iOS (Apple 4.8):** quem oferece login de terceiros precisa
  oferecer também uma opção equivalente, como "Iniciar sessão com a Apple", no app
  iOS.
- **Planos e cobrança (Apple 3.1.1):** o app não tem compra dentro dele; se o iOS
  passar a mostrar planos pagos, a cobrança precisa seguir as regras da Apple.
