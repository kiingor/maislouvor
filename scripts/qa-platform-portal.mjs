// UI smoke test with synthetic accounts and an intercepted API. No real backend.
// Start Vite with VITE_SUPABASE_URL=http://127.0.0.1:54329 and a placeholder key.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can use locally installed QA dependencies.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.PORTAL_QA_ORIGIN || 'http://127.0.0.1:4193';
const output = process.env.PORTAL_QA_OUTPUT || '/tmp/maislouvor-admin-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
let checks = 0;
const pageErrors = [];
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const adminId = '10000000-0000-4000-8000-000000000001';
const userId = '10000000-0000-4000-8000-000000000002';
const profileId = '20000000-0000-4000-8000-000000000002';
const teamId = '30000000-0000-4000-8000-000000000001';
const ticketId = '40000000-0000-4000-8000-000000000001';
const now = () => new Date().toISOString();

function fixtures() {
  const settings = { id: true, support_enabled: true, support_email: 'suporte@example.test', announcement: '', updated_at: now(), updated_by: adminId };
  const accounts = Array.from({ length: 26 }, (_, index) => ({
    id: index === 0 ? teamId : `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: index === 0 ? 'Louvor Central' : ['Comunidade Esperança', 'Igreja Vida Nova', 'Ministério Renovar', 'Louvor da Juventude'][index % 4] + ` ${index}`,
    owner_id: profileId, owner_name: 'Responsável da equipe', owner_email: `equipe${index}@example.test`,
    created_at: now(), plan: index % 3 === 0 ? 'pro' : 'free', subscription_status: index % 3 === 0 ? 'active' : 'free',
    member_count: 12 + index, song_count: 25 + index, repertorio_count: 8, culto_count: 16, last_activity_at: now(),
  }));
  const members = Array.from({ length: 6 }, (_, index) => ({
    user_id: index === 0 ? userId : `10000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
    profile_id: profileId, full_name: ['Pessoa de teste', 'Músico de teste', 'Vocalista de teste', 'Líder de teste'][index % 4],
    avatar_url: null, email: `membro${index}@example.test`, created_at: now(), last_sign_in_at: index === 5 ? null : now(), email_confirmed: index !== 5,
    teams: index === 5 ? [] : [{ id: teamId, name: 'Louvor Central', role: index === 0 ? 'admin' : 'viewer', instruments: ['Voz', 'Violão'] }],
  }));
  const tickets = Array.from({ length: 6 }, (_, index) => ({
    id: index === 0 ? ticketId : `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    ticket_number: 1042 + index, title: ['Organizar repertórios por etiquetas', 'Áudio para ao trocar de música', 'Mostrar as cifras no modo escuro', 'Adicionar filtros nas escalas', 'Melhorar busca por artistas', 'Exportar lista de músicas'][index],
    description: 'Gostaria de organizar melhor os repertórios da equipe. Hoje temos muitas listas e seria útil agrupar por tema e por ocasião. A ideia é encontrar as músicas com mais facilidade.',
    category: index === 1 || index === 2 ? 'bug' : 'improvement', status: ['open', 'in_review', 'in_progress', 'planned', 'resolved', 'closed'][index],
    priority: ['normal', 'urgent', 'high', 'normal', 'low', 'normal'][index], requester_profile_id: profileId,
    team_id: teamId, requester_name: 'Pessoa de teste', requester_email: 'membro0@example.test', team_name: 'Louvor Central',
    created_at: now(), updated_at: now(), last_admin_response_at: null, message_count: 0, waiting_for_staff: true, messages: [],
  }));
  const subscription = { team_id: teamId, plan: 'free', status: 'free', provider: 'manual', monthly_amount: null, current_period_end: null, notes: '', updated_at: now() };
  return { settings, accounts, members, tickets, subscription, notifications: [], audit: [], calls: [] };
}

function paged(items, args) {
  const page = args.p_page || 1; const size = args.p_page_size || 20;
  return { items: items.slice((page - 1) * size, page * size), total: items.length, page, page_size: size };
}

async function surface(data, { admin = true, width = 1440, authenticated = true, accessError = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
  const authUser = { id: admin ? adminId : userId, email: admin ? 'owner@example.test' : 'membro0@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: now() };
  const payload = Buffer.from(JSON.stringify({ sub: authUser.id, exp: Math.floor(Date.now() / 1000) + 7200, role: 'authenticated', aud: 'authenticated' })).toString('base64url');
  await context.addInitScript(({ authenticated, authUser, payload }) => {
    if (authenticated) localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 7200, expires_in: 7200, token_type: 'bearer', user: authUser }));
  }, { authenticated, authUser, payload });
  await context.route('http://127.0.0.1:54329/**', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    let result = null; let status = 200;
    const args = request.postDataJSON() || {};
    if (path.startsWith('/auth/v1/')) result = path.endsWith('/logout') ? {} : authUser;
    else if (path.startsWith('/rest/v1/rpc/')) {
      const rpc = path.split('/').at(-1); data.calls.push({ rpc, args, admin });
      switch (rpc) {
        case 'is_platform_admin': result = admin; if (accessError) { result = { code: 'PGRST202', message: 'Missing fixture RPC' }; status = 404; } break;
        case 'admin_get_overview': result = {
          total_accounts: 128, total_users: 496, total_memberships: 714, total_songs: 2846, total_repertorios: 389, total_cultos: 1024,
          new_accounts: 18, new_users: 72, active_accounts: 94, open_tickets: 23, waiting_tickets: 8, active_subscriptions: 0,
          growth: Array.from({ length: args.p_days || 30 }, (_, index) => ({ date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`, accounts: [1, 0, 2, 1, 3, 2, 1][index % 7], users: [3, 1, 6, 4, 8, 5, 3][index % 7] })),
          recent_accounts: data.accounts.slice(0, 5), recent_tickets: data.tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status)).slice(0, 5),
        }; break;
        case 'admin_list_accounts': result = paged(data.accounts.filter((account) => (!args.p_search || `${account.name} ${account.owner_email}`.toLowerCase().includes(args.p_search.toLowerCase())) && (!args.p_plan || account.plan === args.p_plan)), args); break;
        case 'admin_list_members': result = paged(data.members.filter((member) => !args.p_search || `${member.full_name} ${member.email}`.toLowerCase().includes(args.p_search.toLowerCase())), args); break;
        case 'admin_list_subscriptions': result = { ...paged([{ ...data.subscription, team_name: 'Louvor Central', owner_email: 'equipe0@example.test' }].filter((subscription) => (!args.p_status || args.p_status === subscription.status) && (!args.p_search || 'louvor central equipe0@example.test'.includes(args.p_search.toLowerCase()))), args),
          summary: { registered: 1, active: data.subscription.status === 'active' ? 1 : 0, trialing: data.subscription.status === 'trialing' ? 1 : 0, monthly_amount: data.subscription.status === 'active' ? data.subscription.monthly_amount || 0 : 0 },
        }; break;
        case 'admin_get_account': result = { ...data.accounts.find((account) => account.id === args.p_team_id), subscription: data.subscription, members: data.members.slice(0, 5).map((member, index) => ({ ...member, id: member.user_id, role: index === 0 ? 'admin' : 'viewer', instruments: ['Voz'] })), pending_invites: 2,
          recent_repertorios: ['Domingo pela manhã', 'Culto da juventude', 'Celebração de gratidão'].map((name, index) => ({ id: `r${index}`, name, created_at: now() })),
          recent_cultos: ['Culto de domingo', 'Encontro de louvor'].map((name, index) => ({ id: `c${index}`, name, date: '2026-10-04' })), tickets: data.tickets,
        }; break;
        case 'get_support_settings': result = data.settings; break;
        case 'list_support_tickets': result = paged(data.tickets.filter((ticket) => (!args.p_search || `${ticket.title} ${ticket.ticket_number}`.toLowerCase().includes(args.p_search.toLowerCase())) &&
          (!args.p_status || (args.p_status === 'unresolved' ? !['resolved', 'closed'].includes(ticket.status) : ticket.status === args.p_status)) &&
          (!args.p_category || args.p_category === ticket.category) && (!args.p_priority || args.p_priority === ticket.priority)), args); break;
        case 'get_support_ticket': result = data.tickets.find((ticket) => ticket.id === args.p_ticket_id); break;
        case 'reply_support_ticket': {
          const ticket = data.tickets.find((ticket) => ticket.id === args.p_ticket_id); const previousStatus = ticket.status;
          ticket.status = args.p_status || (!admin && ['closed', 'resolved'].includes(ticket.status) ? 'open' : ticket.status); ticket.priority = args.p_priority || ticket.priority; ticket.updated_at = now();
          if (args.p_message) { ticket.messages.push({ id: `message-${ticket.messages.length}`, message: args.p_message, is_staff: admin, author_name: admin ? 'Equipe +Louvor' : 'Pessoa de teste', created_at: now() }); ticket.message_count++; }
          if (admin && (args.p_message || previousStatus !== ticket.status)) data.notifications.unshift({ id: `notification-${data.notifications.length}`, profile_id: profileId, type: 'support_feedback', title: `${args.p_message ? 'Resposta ao' : 'Atualização do'} ticket #${ticket.ticket_number}`, body: args.p_message || `Status: ${ticket.status}`, read: false, link: `/app/sugestoes/${ticket.id}`, created_at: now(), sender_profile_id: null, sender_profile: null });
          result = { ...ticket, notified: admin && !!(args.p_message || previousStatus !== ticket.status) }; break;
        }
        case 'create_support_ticket': {
          const ticket = { ...data.tickets[0], id: '40000000-0000-4000-8000-000000000099', ticket_number: 1099, title: args.p_title, description: args.p_description, category: args.p_category, status: 'open', priority: 'normal', message_count: 0, messages: [], created_at: now(), updated_at: now() };
          data.tickets.unshift(ticket); result = ticket.id; break;
        }
        case 'admin_update_subscription': Object.assign(data.subscription, { plan: args.p_plan, status: args.p_status, monthly_amount: args.p_monthly_amount, current_period_end: args.p_current_period_end, notes: args.p_notes, updated_at: now() }); result = data.subscription; break;
        case 'admin_update_settings': Object.assign(data.settings, { support_enabled: args.p_support_enabled, support_email: args.p_support_email, announcement: args.p_announcement, updated_at: now() }); result = data.settings; break;
        default: throw new Error(`Unhandled RPC fixture: ${rpc}`);
      }
    } else if (path === '/rest/v1/platform_settings') result = data.settings;
    else if (path === '/rest/v1/platform_audit_log') result = data.audit;
    else if (path === '/rest/v1/team_join_requests') result = [];
    else if (path === '/rest/v1/profiles') result = { id: profileId, full_name: authUser.user_metadata.full_name || 'Pessoa de teste', avatar_url: null };
    else if (path === '/rest/v1/team_members') {
      const membership = { team_id: teamId, profile_id: profileId, role: 'viewer', permissions: null, teams: { id: teamId, name: 'Louvor Central', owner_id: profileId } };
      result = (request.headers().accept || '').includes('vnd.pgrst.object') ? membership : [membership];
    }
    else if (path === '/rest/v1/notifications') {
      if (request.method() === 'PATCH') data.notifications.forEach((notification) => { if (!url.searchParams.get('id') || url.searchParams.get('id') === `eq.${notification.id}`) notification.read = true; });
      result = request.method() === 'GET' ? data.notifications : null;
    } else throw new Error(`Unhandled API fixture: ${path}`);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result), headers: { 'access-control-allow-origin': '*' } });
  });
  const page = await context.newPage(); page.on('pageerror', (error) => pageErrors.push(error.message));
  return { page, context };
}

async function noOverflow(page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (!fits) {
    console.log('Overflow', await page.evaluate(() => ({ url: location.pathname, viewport: innerWidth, scroll: document.documentElement.scrollWidth,
      elements: Array.from(document.querySelectorAll('body *')).map((element) => ({ tag: element.tagName, className: element.className?.toString(), right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) })).filter((element) => element.right > innerWidth + 1).slice(0, 12) })));
    await page.screenshot({ path: `${output}/overflow.png`, fullPage: true });
  }
  check(fits, true);
}
const mainData = fixtures();
try {
  const { page, context } = await surface(mainData);
  await page.goto(`${origin}/admin`); await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor();
  await page.getByText('Pulso da plataforma', { exact: true }).waitFor(); await noOverflow(page);
  await page.screenshot({ path: `${output}/overview-1440.png`, fullPage: true });
  await page.getByRole('button', { name: '7 dias', exact: true }).click(); await page.getByText('Novos cadastros e equipes por dia · últimos 7 dias').waitFor(); checks++;
  await page.goto(`${origin}/admin/contas`); await page.getByRole('link', { name: 'Louvor Central', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Próxima página' }).click(); await page.getByText('21–26 de 26', { exact: true }).waitFor(); checks++;
  await page.getByLabel('Buscar contas').fill('Louvor Central'); await page.getByText('1–1 de 1', { exact: true }).waitFor(); checks++;
  await page.getByRole('link', { name: 'Louvor Central', exact: true }).click(); await page.getByRole('heading', { name: 'Informações da conta' }).waitFor(); await noOverflow(page);
  await page.screenshot({ path: `${output}/account-1440.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Membros', exact: true }).click(); await page.getByRole('heading', { name: 'Membros da equipe' }).waitFor(); checks++;
  await page.getByRole('tab', { name: 'Assinatura', exact: true }).click();
  await page.getByLabel('Plano', { exact: true }).click(); await page.getByRole('option', { name: 'Pro', exact: true }).click();
  await page.getByLabel('Status', { exact: true }).click(); await page.getByRole('option', { name: 'Ativa', exact: true }).click();
  await page.getByLabel('Valor mensal (R$)').fill('49.90'); await page.getByLabel('Fim do período').fill('2030-10-30'); await page.getByLabel('Observações internas').fill('Registro manual para QA.');
  await page.getByRole('button', { name: 'Salvar assinatura' }).click(); await page.getByText('Assinatura registrada', { exact: true }).waitFor();
  check([mainData.subscription.plan, mainData.subscription.status, mainData.subscription.monthly_amount], ['pro', 'active', 49.9]);
  await page.goto(`${origin}/admin/membros`); await page.getByRole('heading', { name: 'Membros', exact: true }).waitFor(); await page.getByRole('button', { name: 'Detalhes', exact: true }).first().click(); await page.getByRole('dialog').waitFor(); await page.getByText('Equipes e permissões', { exact: true }).waitFor(); checks++;
  await page.getByRole('button', { name: /^(Close|Fechar)$/ }).click();
  await page.goto(`${origin}/admin/assinaturas`); await page.getByText('Louvor Central', { exact: true }).waitFor(); await noOverflow(page);
  await page.goto(`${origin}/admin/tickets`); await page.getByRole('link', { name: 'Organizar repertórios por etiquetas', exact: true }).click();
  await page.getByLabel('Responder ao usuário').fill('Analisamos a sugestão e vamos adicionar etiquetas aos repertórios. Obrigado pelos detalhes.');
  await page.getByRole('button', { name: 'Enviar resposta', exact: true }).click(); await page.getByText('Resposta enviada', { exact: true }).waitFor();
  check(mainData.notifications.length, 1);
  await page.getByLabel('Status', { exact: true }).click(); await page.getByRole('option', { name: 'Em andamento', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); await page.getByText('Ticket atualizado', { exact: true }).waitFor();
  check(mainData.notifications.length, 2); await noOverflow(page);
  await page.screenshot({ path: `${output}/ticket-1440.png`, fullPage: true });
  await page.goto(`${origin}/admin/configuracoes`); await page.getByRole('switch', { name: 'Receber novos tickets' }).click();
  await page.getByLabel('Mensagem na área de sugestões').fill('Analisamos os tickets em até dois dias úteis.');
  await page.getByRole('button', { name: 'Salvar configurações' }).click(); await page.getByText('Configurações salvas', { exact: true }).waitFor(); check(mainData.settings.support_enabled, false);
  const regular = await surface(mainData, { admin: false });
  await regular.page.goto(`${origin}/app/sugestoes`); await regular.page.getByRole('heading', { name: 'Sugestões e suporte' }).waitFor();
  await regular.page.getByText('O envio de novos tickets está temporariamente pausado.', { exact: false }).waitFor();
  check(await regular.page.getByRole('button', { name: 'Novo ticket', exact: true }).isDisabled(), true);
  await regular.page.getByRole('button', { name: 'Notificações', exact: false }).click();
  await regular.page.getByRole('button').filter({ hasText: 'Resposta ao ticket #1042' }).click();
  await regular.page.getByLabel('Adicionar uma mensagem').waitFor(); check(new URL(regular.page.url()).pathname, `/app/sugestoes/${ticketId}`);
  await regular.page.getByText('Analisamos a sugestão e vamos adicionar etiquetas aos repertórios. Obrigado pelos detalhes.', { exact: true }).waitFor();
  await regular.page.getByLabel('Adicionar uma mensagem').fill('Obrigado! Posso testar a melhoria com minha equipe.'); await regular.page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click(); await regular.page.getByText('Mensagem enviada', { exact: true }).waitFor();
  check(mainData.tickets[0].messages.at(-1).is_staff, false);
  const adminDataCalls = mainData.calls.filter((call) => !call.admin && call.rpc.startsWith('admin_')).length;
  await regular.page.goto(`${origin}/admin`); await regular.page.getByRole('heading', { name: 'Acesso restrito' }).waitFor();
  check(mainData.calls.filter((call) => !call.admin && call.rpc.startsWith('admin_')).length, adminDataCalls);
  await page.getByRole('switch', { name: 'Receber novos tickets' }).click(); await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true');
  await regular.page.setViewportSize({ width: 390, height: 844 }); await regular.page.goto(`${origin}/app/sugestoes`); await regular.page.getByRole('button', { name: 'Novo ticket', exact: true }).waitFor();
  await regular.page.getByRole('button', { name: 'Novo ticket', exact: true }).click(); await regular.page.getByRole('dialog').waitFor();
  await regular.page.getByLabel('Assunto', { exact: true }).fill('Etiquetas para os cultos da equipe'); await regular.page.getByLabel('Conte sua ideia').fill('Gostaria de classificar os cultos por ocasião para encontrar as escalas com mais facilidade.');
  await regular.page.screenshot({ path: `${output}/new-ticket-390.png`, fullPage: true }); await noOverflow(regular.page);
  await regular.page.getByRole('button', { name: 'Criar ticket', exact: true }).click(); await regular.page.getByRole('heading', { name: 'Etiquetas para os cultos da equipe' }).waitFor();
  check(new URL(regular.page.url()).pathname, '/app/sugestoes/40000000-0000-4000-8000-000000000099'); await noOverflow(regular.page);
  await regular.page.screenshot({ path: `${output}/user-ticket-390.png`, fullPage: true });
  await regular.context.close(); await context.close();
  for (const width of [390, 320]) {
    const mobile = await surface(fixtures(), { width });
    for (const [route, heading, file] of [['/admin', 'Visão geral', 'overview'], ['/admin/contas', 'Contas', 'accounts'], [`/admin/contas/${teamId}`, 'Louvor Central', 'account'], ['/admin/membros', 'Membros', 'members'], ['/admin/assinaturas', 'Assinaturas', 'subscriptions'], ['/admin/tickets', 'Sugestões e bugs', 'tickets'], [`/admin/tickets/${ticketId}`, 'Organizar repertórios por etiquetas', 'ticket'], ['/admin/configuracoes', 'Configurações', 'settings']]) {
      await mobile.page.goto(origin + route); await mobile.page.getByRole('heading', { name: heading, exact: true }).waitFor();
      await mobile.page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('Carregando')); await noOverflow(mobile.page);
      await mobile.page.screenshot({ path: `${output}/${file}-${width}.png`, fullPage: true });
    }
    await mobile.page.getByRole('button', { name: 'Abrir menu de administração' }).click(); await mobile.page.getByRole('dialog').waitFor(); await mobile.page.getByRole('link', { name: 'Contas', exact: true }).click(); await mobile.page.getByRole('heading', { name: 'Contas', exact: true }).waitFor();
    check(await mobile.page.getByRole('dialog').count(), 0);
    await mobile.context.close();
  }
  const anonymous = await surface(fixtures(), { authenticated: false }); await anonymous.page.goto(`${origin}/admin/contas`); await anonymous.page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
  check(new URL(anonymous.page.url()).searchParams.get('redirect'), '/admin/contas'); await anonymous.context.close();
  const unavailable = await surface(fixtures(), { accessError: true }); await unavailable.page.goto(`${origin}/admin`); await unavailable.page.getByRole('heading', { name: 'Não foi possível carregar' }).waitFor(); check(await unavailable.page.getByText('Pulso da plataforma').count(), 0); await unavailable.context.close();
  check(pageErrors, []);
  console.log(`${checks} browser checks passed: full admin navigation, filters, pagination, account details, billing, ticket replies, user notifications, creation, access guards and 320/390/1440px layouts. Screenshots: ${output}`);
} finally { await browser.close(); }
