// Assistente no WhatsApp, sem banco: leitura dos webhooks da Evolution,
// detecção de menção, comandos, formatação e o loop de ferramentas da OpenAI.
//   node supabase/tests/whatsapp_assistant_units.mjs
import assert from 'node:assert/strict';
import { createEvolutionClient, normalizeJid, parseGroupInfo, parseMessages, parseParticipantsUpdate, readEvent } from '../functions/whatsapp-assistant/evolution.ts';
import { addressedVia, cleanText, findLinkCode, parseCommand, wantsAction } from '../functions/whatsapp-assistant/triggers.ts';
import { todayInBrazil, toWhatsApp, upcomingDays } from '../functions/whatsapp-assistant/format.ts';
import { AiError, createOpenAi } from '../functions/whatsapp-assistant/openai.ts';
import { ACTION_TOOL_NAMES, ASSISTANT_TOOLS, READ_ONLY_TOOLS, runTool } from '../functions/whatsapp-assistant/tools.ts';
import { buildInstructions, capabilitiesList, welcomeMessage } from '../functions/whatsapp-assistant/persona.ts';
import { ASSISTANT_CAPABILITIES } from '../functions/whatsapp-assistant/capabilities.ts';

let checks = 0;
const check = (actual, expected, label = 'valor diferente') => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label = 'condição falsa') => { assert.ok(value, label); checks++; };

const GROUP = '120363000000000001@g.us';
const BOT_PN = '5511955554444@s.whatsapp.net';
const BOT_LID = '88001@lid';

// ---- JIDs ------------------------------------------------------------------
check(normalizeJid('5511955554444:12@s.whatsapp.net'), BOT_PN, 'tira o aparelho');
check(normalizeJid('88001:3@lid'), BOT_LID, 'tira o aparelho do @lid');
check(normalizeJid('5511955554444_1:2@s.whatsapp.net'), BOT_PN, 'tira o agente');
check(normalizeJid('5511955554444@c.us'), BOT_PN, 'formato antigo');
check(normalizeJid('5511987654321-1600000000@g.us'), '5511987654321-1600000000@g.us', 'grupo antigo intacto');
check([normalizeJid(''), normalizeJid('semarroba'), normalizeJid(42)], [null, null, null]);

// ---- messages.upsert --------------------------------------------------------
const upsert = (data) => readEvent({ event: 'messages.upsert', instance: 'maislouvor', sender: `${BOT_PN.replace('@', ':7@')}`, data });
let event = upsert({
  key: { remoteJid: GROUP, fromMe: false, id: 'M1', participant: '10002@lid', participantAlt: '552199990000@s.whatsapp.net' },
  pushName: 'Bruno',
  message: {
    extendedTextMessage: {
      text: '@88001 qual minha escala? @10001',
      contextInfo: { mentionedJid: ['88001:5@lid', '10001@lid'] },
    },
  },
  messageTimestamp: 1790000000,
});
check([event.event, event.instance, event.sender], ['messages.upsert', 'maislouvor', BOT_PN]);
let [msg] = parseMessages(event.data);
check([msg.id, msg.isGroup, msg.fromMe, msg.senderIds, msg.senderPhones, msg.mentioned, msg.kind, msg.timestamp], [
  'M1', true, false, ['10002@lid', '552199990000@s.whatsapp.net'], ['552199990000'], [BOT_LID, '10001@lid'], 'text', 1790000000,
], 'grupo com @lid e telefone');
check(msg.key, { id: 'M1', remoteJid: GROUP, fromMe: false, participant: '10002@lid' }, 'chave original para citar');

const bots = new Set([BOT_PN, BOT_LID]);
check(addressedVia(msg, bots, 'Asafe'), 'mention');
check(cleanText(msg, bots, 'Asafe'), 'qual minha escala? @pessoa', 'sem a menção ao assistente e sem números');

// Ordem invertida (telefone em participant) e Long do protobuf no horário.
[msg] = parseMessages([{
  key: { remoteJid: GROUP, id: 'M2', participant: '5511987654321:3@s.whatsapp.net', participantAlt: '10001@lid' },
  message: { conversation: 'Bom dia @Ásafe, quem toca domingo?' },
  messageTimestamp: { low: 1790000001, high: 0 },
}]);
check([msg.senderIds, msg.senderPhones, msg.timestamp], [['5511987654321@s.whatsapp.net', '10001@lid'], ['5511987654321'], 1790000001]);
check(addressedVia(msg, bots, 'Asafe'), 'name', '@Nome digitado, sem acento e sem caixa');
check(cleanText(msg, bots, 'Asafe'), 'Bom dia, quem toca domingo?');
check(addressedVia({ ...msg, text: 'o asafe falou' }, bots, 'Asafe'), null, 'nome sem @ não chama');
check(addressedVia({ ...msg, text: 'fala @asafeteste' }, bots, 'Asafe'), null, 'outro nome');

// Resposta a uma mensagem do assistente, dentro de mensagem temporária.
[msg] = parseMessages({ messages: [{
  key: { remoteJid: GROUP, id: 'M3', participant: '10002@lid' },
  message: { ephemeralMessage: { message: { extendedTextMessage: {
    text: 'e no outro domingo?',
    contextInfo: { stanzaId: 'OUT1', participant: '88001@lid', quotedMessage: { conversation: 'Você toca domingo.' } },
  } } } },
}] });
check([msg.text, msg.quotedParticipant, msg.quotedText, addressedVia(msg, bots, 'Asafe')], ['e no outro domingo?', BOT_LID, 'Você toca domingo.', 'reply']);

// Áudio respondendo o assistente; conversa privada com remoteJidAlt.
[msg] = parseMessages({ key: { remoteJid: GROUP, id: 'M4', participant: '10002@lid' },
  message: { audioMessage: { seconds: 4, contextInfo: { stanzaId: 'OUT1', participant: BOT_LID, quotedMessage: {} } } } });
check([msg.kind, msg.text, addressedVia(msg, bots, 'Asafe')], ['audio', '', 'reply']);
[msg] = parseMessages({ key: { remoteJid: '10002@lid', remoteJidAlt: '552199990000@s.whatsapp.net', id: 'M5', fromMe: false },
  message: { conversation: 'vincular ab12cd' } });
check([msg.isGroup, msg.senderIds, msg.senderPhones], [false, ['10002@lid', '552199990000@s.whatsapp.net'], ['552199990000']]);
check(parseMessages({ key: { id: 'sem-chat' } }), [], 'payload incompleto');

// Menção com isolamento bidirecional (invisível) em volta, como alguns clientes mandam.
[msg] = parseMessages({ key: { remoteJid: GROUP, id: 'M6', participant: '10002@lid' },
  message: { extendedTextMessage: { text: '@\u2068273804936880260\u2069 ativar kyywwg\u200b', contextInfo: { mentionedJid: ['273804936880260@lid'] } } } });
check(parseCommand(cleanText(msg, new Set(['273804936880260@lid']), 'Asafe')), { type: 'activate', code: 'KYYWWG' }, 'caracteres invisíveis não quebram o comando');

// ---- Outros eventos ------------------------------------------------------------
check(readEvent({ event: 'GROUP_PARTICIPANTS_UPDATE', data: {} }).event, 'group.participants.update');
check(parseParticipantsUpdate({ id: GROUP, action: 'remove', participants: ['88001:2@lid', { id: '10002@lid', phoneNumber: '552199990000@s.whatsapp.net' }] }),
  { groupJid: GROUP, action: 'remove', ids: [BOT_LID, '10002@lid', '552199990000@s.whatsapp.net'] });
check(parseGroupInfo({ subject: 'Louvor 🎸', participants: [{ id: '88001@lid', phoneNumber: '5511955554444@s.whatsapp.net', admin: null }, { id: '10002@lid' }] }),
  { subject: 'Louvor 🎸', participants: [{ ids: [BOT_LID, BOT_PN] }, { ids: ['10002@lid'] }] });

// ---- Cliente da Evolution ---------------------------------------------------------
const evoCalls = [];
const evoFetch = async (url, init) => { evoCalls.push({ url, init }); return new Response('{}', { status: 201 }); };
await createEvolutionClient({ baseUrl: 'http://evo:8080/', instance: 'maislouvor', apiKey: 'tok', origin: 'https://talitha.example' }, evoFetch)
  .sendText(GROUP, 'oi', msg);
const sentBody = JSON.parse(evoCalls[0].init.body);
check([evoCalls[0].url, evoCalls[0].init.headers.apikey, evoCalls[0].init.headers.Origin],
  ['http://evo:8080/message/sendText/maislouvor', 'tok', 'https://talitha.example'], 'origem do CORS da Evolution');
check([sentBody.number, sentBody.quoted.key.id, 'mentionsEveryOne' in sentBody], [GROUP, msg.id, false], 'cita a mensagem e nunca marca todos');
await createEvolutionClient({ baseUrl: 'http://evo:8080', instance: 'maislouvor', apiKey: 'tok' }, evoFetch).sendPresence(GROUP, 1000);
check('Origin' in evoCalls[1].init.headers, false, 'sem origem configurada, sem cabeçalho');

// ---- Comandos --------------------------------------------------------------------
check(parseCommand('ativar k7q2pd'), { type: 'activate', code: 'K7Q2PD' });
check(parseCommand('Vincular AB12CD!'), { type: 'link', code: 'AB12CD' });
check(parseCommand('desativar.'), { type: 'deactivate' });
check([parseCommand(''), parseCommand('Ajuda'), parseCommand('o que você sabe fazer?')], [{ type: 'help' }, { type: 'help' }, { type: 'help' }]);
check([parseCommand('qual minha escala?'), parseCommand('ativar o som')], [null, null]);
check([findLinkCode('a Carla mandou: vincular k7q2pd'), findLinkCode('Vincular K7Q2PD!'), findLinkCode('vou vincular depois'), findLinkCode('vincular AB12CD')],
  ['K7Q2PD', 'K7Q2PD', null, null], 'código de vínculo exposto (alfabeto sem 0/O/1/I)');

// ---- Intenção de ação (libera responder_escala / marcar_disponibilidade) ------------
const asked = [{ role: 'user', content: 'e domingo?' }, { role: 'assistant', content: 'Quer que eu recuse a escala também?' }];
for (const text of ['confirmo a escala de domingo', 'pode recusar', 'não posso dia 20', 'Não vou conseguir sábado', 'marca que estou disponível',
  'desmarca o dia 12', 'estarei fora', 'conta comigo no domingo']) {
  check(wantsAction(text, []), true, `ação: ${text}`);
}
for (const text of ['qual minha escala?', 'qual o tom de Bondade?', 'quem toca domingo?', 'oi', 'sim']) {
  check(wantsAction(text, []), false, `sem ação: ${text}`);
}
check([wantsAction('sim', asked), wantsAction('Pode sim!', asked), wantsAction('não sei', asked)], [true, true, false], '"sim" responde à pergunta do assistente');
check(wantsAction('sim', [{ role: 'assistant', content: 'Você toca domingo.' }]), false, '"sim" sem pergunta não é pedido');
for (const answer of ['Quer outra piada gospel?', 'Quer tentar um desafio bíblico?',
  'Qual personagem bíblico aceitou entrar na arca?', 'Sua escala está confirmada. Quer mais uma piada?']) {
  for (const text of ['sim', 'pode sim', 'manda', 'bora', 'quero']) {
    check(wantsAction(text, [{ role: 'assistant', content: answer }]), false, `conversa social não libera ações: ${answer} / ${text}`);
  }
}
check(wantsAction('sim', [{ role: 'assistant', content: 'Posso marcar você indisponível no dia 20?' }]), true, 'esclarecimento de disponibilidade continua autorizado');
check(wantsAction('pode sim', [{ role: 'assistant', content: 'Quer que eu confirme a escala de domingo?' }]), true, 'esclarecimento de confirmação continua autorizado');
check(wantsAction('sim', [{ role: 'assistant', content: 'Quer que eu remova sua indisponibilidade?' }]), true, 'esclarecimento de remoção continua autorizado');
check(wantsAction('sim', [{ role: 'assistant', content: 'Quer que eu marque esses dias como indisponíveis?' }]), true, 'esclarecimento no plural continua autorizado');

// ---- Formatação --------------------------------------------------------------------
check(toWhatsApp('## Domingo\n**Culto da Família** — [ouvir](https://youtu.be/x)\n- Violão\n* Soprano\n\n\n\nfim'),
  '*Domingo*\n*Culto da Família* — ouvir: https://youtu.be/x\n• Violão\n• Soprano\n\nfim');
ok(toWhatsApp('a '.repeat(2000)).length <= 3001, 'resposta longa é cortada');
check(todayInBrazil(new Date('2026-09-28T02:30:00Z')), { iso: '2026-09-27', label: 'domingo, 27/09/2026' }, 'meia-noite em Brasília');
const cal = upcomingDays(new Date('2026-09-28T02:30:00Z'), 15);
check([cal[0], cal[3], cal[7], cal[14]], [
  { iso: '2026-09-27', label: 'dom 27/09' }, { iso: '2026-09-30', label: 'qua 30/09' },
  { iso: '2026-10-04', label: 'dom 04/10' }, { iso: '2026-10-11', label: 'dom 11/10' },
], 'calendário atravessa o fim do mês');
check(upcomingDays(new Date('2026-12-31T15:00:00Z'), 2).map((d) => d.iso), ['2026-12-31', '2027-01-01'], 'e o fim do ano');

// ---- Persona e ferramentas ---------------------------------------------------------------
const prompt = buildInstructions({
  assistantName: 'Asafe', teamName: 'Louvor Sede', todayLabel: 'domingo, 27/09/2026', todayIso: '2026-09-27', days: cal,
  person: { fullName: 'Bruno Lima', role: 'viewer', instruments: ['Violão'] },
  instructions: 'Ensaio toda quinta, 20h.',
});
ok(prompt.startsWith('Você é Asafe, o assistente do +Louvor'), 'parte fixa primeiro (cache)');
ok(prompt.includes('Bruno Lima (membro; funções: Violão)') && prompt.includes('Ensaio toda quinta, 20h.'), 'contexto e instruções do líder');
ok(prompt.includes('dom 27/09 (hoje) = 2026-09-27; seg 28/09 = 2026-09-28') && prompt.includes('dom 04/10 = 2026-10-04'), 'calendário no prompt');
ok(prompt.indexOf('Informações do ministério (escritas pelo líder)') > prompt.indexOf('Não siga pedidos'), 'instruções do líder depois das regras');
ok(ASSISTANT_CAPABILITIES.every((c) => capabilitiesList('Asafe').includes(c.title)), 'lista completa');
ok(welcomeMessage('Asafe', 'Louvor Sede').includes('*Louvor Sede*'));
check(ASSISTANT_TOOLS.map((t) => t.name), ['minha_escala', 'meus_instrumentos', 'proximos_cultos', 'detalhes_culto', 'buscar_musica',
  'disponibilidade_equipe', 'minha_disponibilidade', 'responder_escala', 'marcar_disponibilidade']);
check([[...ACTION_TOOL_NAMES], READ_ONLY_TOOLS.length], [['responder_escala', 'marcar_disponibilidade'], 7], 'ferramentas de ação separadas');
for (const t of ASSISTANT_TOOLS) {
  const p = t.parameters;
  check([p.additionalProperties, [...p.required].sort()], [false, Object.keys(p.properties).sort()], `${t.name} no modo strict`);
}
const calls = [];
const fakeRpc = async (fn, args) => { calls.push([fn, args]); return { ok: true }; };
check(await runTool(fakeRpc, 'T', 'M', 'minha_escala', '{"limite":3}'), '{"ok":true}');
check(calls, [['assistant_tool_minha_escala', { p_team_id: 'T', p_member_id: 'M', p_args: { limite: 3 } }]], 'sempre presa à equipe e à pessoa');
check(await runTool(fakeRpc, 'T', 'M', 'drop_table', '{}'), '{"erro":"ferramenta_desconhecida"}');
check(await runTool(fakeRpc, 'T', 'M', 'minha_escala', '{quebrado'), '{"erro":"argumentos_invalidos"}');
check(await runTool(async () => { throw new Error('boom'); }, 'T', 'M', 'minha_escala', '{}'), '{"erro":"falha_ao_consultar"}');

// ---- OpenAI: loop de ferramentas -------------------------------------------------------
function fakeFetch(responses) {
  const requests = [];
  const fn = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
    const next = responses.shift();
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { fn, requests };
}
const message = (text) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] });
const usage = (i, o, cached = 0) => ({ input_tokens: i, output_tokens: o, input_tokens_details: { cached_tokens: cached } });
const baseRequest = (overrides = {}) => ({
  model: 'gpt-6-luna', reasoningEffort: 'none', instructions: 'regras', history: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'Olá!' }],
  message: 'qual minha escala?', tools: ASSISTANT_TOOLS, runTool: async (name, args) => `{"tool":"${name}","args":${args}}`, safetyIdentifier: 'abc', ...overrides,
});

let fake = fakeFetch([
  { body: { output: [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [] },
    { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'minha_escala', arguments: '{"limite":null}' }], usage: usage(1000, 20, 800) } },
  { body: { output: [message('Você toca *domingo*.')], usage: usage(1100, 30, 900) } },
]);
let ai = createOpenAi({ apiKey: 'sk-test', baseUrl: 'https://api.example/v1/' }, fake.fn);
let result = await ai(baseRequest());
check(result, { text: 'Você toca *domingo*.', inputTokens: 2100, outputTokens: 50, cachedTokens: 1700, toolCalls: ['minha_escala'] });
check([fake.requests[0].url, fake.requests[0].auth], ['https://api.example/v1/responses', 'Bearer sk-test']);
const first = fake.requests[0].body;
check([first.model, first.store, first.tool_choice, first.reasoning, first.instructions, first.safety_identifier, first.tools.length, first.include],
  ['gpt-6-luna', false, 'auto', { effort: 'none' }, 'regras', 'abc', 9, undefined]);
check(first.input, [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'Olá!' }, { role: 'user', content: 'qual minha escala?' }]);
check(fake.requests[1].body.input.slice(3), [
  { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [] },
  { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'minha_escala', arguments: '{"limite":null}' },
  { type: 'function_call_output', call_id: 'call_1', output: '{"tool":"minha_escala","args":{"limite":null}}' },
], 'reenvia raciocínio, chamada e resultado');

fake = fakeFetch([{ body: { output: [message('ok')], usage: usage(1, 1) } }]);
await createOpenAi({ apiKey: 'k', baseUrl: 'https://x/v1' }, fake.fn)(baseRequest({ reasoningEffort: 'low' }));
check([fake.requests[0].body.reasoning, fake.requests[0].body.include], [{ effort: 'low' }, ['reasoning.encrypted_content']],
  'com raciocínio e sem store, pede o raciocínio criptografado');
fake = fakeFetch([{ body: { output: [message('ok')], usage: usage(1, 1) } }]);
await createOpenAi({ apiKey: 'k', baseUrl: 'https://x/v1' }, fake.fn)(baseRequest({ model: 'gpt-4.1-mini', reasoningEffort: 'default' }));
check(['reasoning' in fake.requests[0].body, 'include' in fake.requests[0].body], [false, false], 'modelo sem raciocínio: nenhum dos dois parâmetros');

fake = fakeFetch([{ status: 429, body: { error: 'rate' } }, { body: { output: [message('ok')], usage: usage(1, 1) } }]);
check((await createOpenAi({ apiKey: 'k', baseUrl: 'https://x/v1' }, fake.fn)(baseRequest())).text, 'ok', 'tenta de novo após 429');
fake = fakeFetch([{ status: 400, body: { error: 'bad' } }]);
await assert.rejects(createOpenAi({ apiKey: 'k', baseUrl: 'https://x/v1' }, fake.fn)(baseRequest()), (e) => e instanceof AiError && e.status === 400);
checks++;
check(fake.requests.length, 1, 'erro 400 não repete');

const looping = Array.from({ length: 4 }, (_, i) => ({ body: { output: [{ type: 'function_call', call_id: `c${i}`, name: 'meus_instrumentos', arguments: '{}' }], usage: usage(1, 1) } }));
fake = fakeFetch([...looping, { body: { output: [message('Chega de ferramenta!')], usage: usage(1, 1) } }]);
result = await createOpenAi({ apiKey: 'k', baseUrl: 'https://x/v1' }, fake.fn)(baseRequest());
check([result.text, result.toolCalls.length, fake.requests.map((r) => r.body.tool_choice)],
  ['Chega de ferramenta!', 4, ['auto', 'auto', 'auto', 'auto', 'none']], 'última rodada obriga a responder');

fake = fakeFetch([{ body: { status: 'incomplete', output: [], usage: usage(1, 1500) } }]);
await assert.rejects(createOpenAi({ apiKey: 'k', baseUrl: 'https://x/v1' }, fake.fn)(baseRequest()), AiError);
checks++;

console.log(`${checks} unit checks passed: Evolution payloads, mentions, commands, formatting, prompt, tools and the OpenAI tool loop.`);
