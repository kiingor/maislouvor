#!/usr/bin/env python3
"""Gera o relatório estático de auditoria de segurança do MaisLouvor.

Uso (em ambiente Python isolado):
    python generate_report.py

Dependências:
    reportlab, matplotlib, pypdf
"""

from __future__ import annotations

import io
import os
from pathlib import Path
from textwrap import dedent
from xml.sax.saxutils import escape

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    LongTable,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "relatorio-auditoria-seguranca.pdf"
REPORT_DATE = "29/08/2026"
PROJECT = "MaisLouvor (+Louvor)"
COMMIT = "e4f8cc4be4980bc21444d16325960905c68b827c"


PALETTE = {
    "Crítica": "#B91C1C",
    "Alta": "#EA580C",
    "Média": "#D97706",
    "Baixa": "#2563EB",
    "Informativa": "#64748B",
    "Ponto forte": "#059669",
    "Ink": "#172033",
    "Muted": "#526078",
    "Line": "#D9E1EA",
    "Paper": "#FFFFFF",
    "Soft": "#F4F7FA",
    "Navy": "#10243E",
}


findings = [
    {
        "id": "F-01",
        "severity": "Crítica",
        "category": "Permissão definida no navegador",
        "title": "Tomada de conta por associação forçada a time e redefinição global de senha",
        "summary": (
            "Um usuário autenticado pode criar um time, associar diretamente uma conta existente "
            "pelo e-mail sem aceite e então redefinir a senha global dessa conta como administrador "
            "do time recém-criado."
        ),
        "why": (
            "A policy permite que qualquer autenticado crie um time e o trigger o torna admin. "
            "create-invite encontra o usuário global pelo e-mail, altera seu perfil e insere a "
            "membership imediatamente. admin-update-user considera suficiente compartilhar qualquer "
            "time no qual o chamador seja admin e usa auth.admin.updateUserById. Como a identidade "
            "Supabase é global, o atacante assume também os outros times da vítima."
        ),
        "conditions": (
            "Requer uma conta autenticada, um time controlado pelo atacante e o e-mail de uma conta "
            "existente que seja retornada por listUsers(). Não exige que a vítima aceite convite nem "
            "que pertença previamente ao time do atacante."
        ),
        "impact": (
            "Comprometimento integral da conta, acesso aos demais times da vítima, alteração de dados "
            "e possibilidade de persistência. create-invite também pode alterar o nome global do perfil."
        ),
        "fix": (
            "Transformar create-invite em convite pendente e exigir aceite pela conta destinatária; "
            "remover a redefinição administrativa de senha de identidades globais e usar o fluxo de "
            "recuperação enviado ao e-mail verificado. Não alterar perfil de usuário existente durante "
            "convite. Invalidar sessões e auditar usos anteriores dessas funções."
        ),
        "acceptance": [
            "Um admin não consegue inserir diretamente uma conta existente no próprio time.",
            "A membership só nasce após aceite autenticado e e-mail compatível com o convite.",
            "Nenhum admin de time consegue trocar a senha ou o perfil global de outro usuário.",
            "O teste de regressão criar time -> forçar membership -> trocar senha termina em 403.",
            "Sessões da conta não são afetadas por operações administrativas de outro time.",
        ],
        "evidence": [
            {
                "file": "supabase/migrations/20260223230533_2b017539-a6b8-4380-832f-ed808dca9370.sql",
                "lines": "111-127, 143-145",
                "note": "Qualquer autenticado cria time; trigger o adiciona como admin.",
                "code": dedent(
                    """\
                    118  INSERT INTO public.team_members (team_id, profile_id, role)
                    119  VALUES (NEW.id, NEW.owner_id, 'admin');
                    ...
                    143  CREATE POLICY "Authenticated users can create teams"
                    145    WITH CHECK (owner_id = (... auth.uid() ...));"""
                ),
            },
            {
                "file": "supabase/functions/create-invite/index.ts",
                "lines": "80-99, 132-155",
                "note": "Conta existente é localizada, alterada e adicionada sem aceite.",
                "code": dedent(
                    """\
                     81  const { data: existingUsers } = await admin.auth.admin.listUsers();
                     82  const existingUser = existingUsers?.users?.find(...);
                     88  if (existingUser) {
                     89    userId = existingUser.id;
                    ...
                    133  if (full_name) {
                    134    await admin.from("profiles").update({ full_name }).eq("id", profile.id);
                    135  }
                    ...
                    153  const { error: memberError } = await admin
                    154    .from("team_members")
                    155    .insert({ team_id, profile_id: profile.id, role });"""
                ),
            },
            {
                "file": "supabase/migrations/20260224031925_6ef15eef-1a23-4908-9b41-515b22769b6c.sql; src/pages/TeamSettings.tsx",
                "lines": "34-43; 50",
                "note": "Após a associação, o atacante pode ler o user_id global da vítima como colega de time.",
                "code": dedent(
                    """\
                    migration:34  CREATE POLICY "Team members can view teammate profiles"
                    migration:36  USING (EXISTS (... tm1.team_id = tm2.team_id ...));

                    TeamSettings.tsx:50  .select("id, role, profile_id, instruments,
                                                profiles(id, full_name, user_id, avatar_url)")"""
                ),
            },
            {
                "file": "supabase/functions/admin-update-user/index.ts",
                "lines": "78-113, 122-127",
                "note": "Um time compartilhado habilita alteração da identidade global.",
                "code": dedent(
                    """\
                     78  // Check caller is admin in at least one shared team
                     94  const { data: targetMembership } = await admin
                     95    .from("team_members")
                     98    .in("team_id", callerTeamIds)
                    ...
                    109  if (password) {
                    111    const { error: updateError } = await admin.auth.admin.updateUserById(
                    112      user_id, { password }
                    113    );
                    }"""
                ),
            },
        ],
    },
    {
        "id": "F-02",
        "severity": "Alta",
        "category": "Banco sem tranca",
        "title": "Policies de Storage não isolam capas e escritas de avatar por usuário/time",
        "summary": (
            "O bucket privado covers concede SELECT/INSERT/UPDATE/DELETE sobre qualquer objeto a todo "
            "usuário autenticado. Em avatars, qualquer autenticado pode sobrescrever ou excluir o "
            "arquivo de qualquer usuário."
        ),
        "why": (
            "Os caminhos já carregam teamId ou userId, mas as policies ignoram essas pastas e testam "
            "somente auth.role(). Um atacante autenticado pode listar o bucket covers, gerar acesso aos "
            "objetos de outros times e sobrescrevê-los/excluí-los. Em avatars, a leitura pública é "
            "intencional, mas a escrita não está ligada ao auth.uid()."
        ),
        "conditions": (
            "Requer sessão autenticada. Para alteração direcionada basta conhecer ou listar o caminho; "
            "a policy de SELECT de covers permite descoberta. Avatares são públicos e seus caminhos usam "
            "o user_id."
        ),
        "impact": (
            "Vazamento de capas privadas entre times, adulteração e exclusão de mídia, defacement de "
            "avatares e quebra do isolamento multi-tenant."
        ),
        "fix": (
            "Aplicar a mesma estratégia do bucket audio: extrair a primeira pasta e validar membership/"
            "can_edit_team. Em avatars, permitir escrita apenas na pasta auth.uid(); para edição por admin, "
            "usar função server-side que valide o time. Incluir WITH CHECK explícito em UPDATE."
        ),
        "acceptance": [
            "Membro do time A não lista, assina, altera nem exclui capas do time B.",
            "Viewer não envia/atualiza capa; admin/editor do time correto consegue.",
            "Usuário só grava e remove objetos na própria pasta de avatar.",
            "UPDATE não permite mover objeto para namespace de outro time/usuário.",
            "Testes automatizados cobrem SELECT, INSERT, UPDATE e DELETE nos três buckets.",
        ],
        "evidence": [
            {
                "file": "supabase/migrations/20260223233111_7652ce77-5105-4938-ac16-00c2fa07302b.sql",
                "lines": "19-40",
                "note": "Todas as operações de covers dependem apenas de authenticated.",
                "code": dedent(
                    """\
                    20  INSERT INTO storage.buckets (...) VALUES ('covers', 'covers', false);
                    ...
                    28  CREATE POLICY "Authenticated users can view covers"
                    30  USING (bucket_id = 'covers' AND auth.role() = 'authenticated');
                    ...
                    33  CREATE POLICY "Authenticated users can update covers"
                    35  USING (bucket_id = 'covers' AND auth.role() = 'authenticated');
                    38  CREATE POLICY "Authenticated users can delete covers"
                    40  USING (bucket_id = 'covers' AND auth.role() = 'authenticated');"""
                ),
            },
            {
                "file": "supabase/migrations/20260224031925_6ef15eef-1a23-4908-9b41-515b22769b6c.sql",
                "lines": "45-62",
                "note": "Escritas de avatars não validam a pasta do usuário.",
                "code": dedent(
                    """\
                    52  CREATE POLICY "Authenticated users can upload avatars"
                    54  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
                    56  CREATE POLICY "Users can update their own avatar"
                    58  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
                    60  CREATE POLICY "Users can delete their own avatar"
                    62  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');"""
                ),
            },
            {
                "file": "src/components/CoverUpload.tsx; src/pages/TeamSettings.tsx",
                "lines": "34-37; 111-118",
                "note": "O frontend confirma namespaces teamId/songId e userId que as policies não usam.",
                "code": dedent(
                    """\
                    CoverUpload.tsx:34  const path = `${teamId}/${songId}.${ext}`;
                    CoverUpload.tsx:37  ...from("covers").upload(path, file, { upsert: true });

                    TeamSettings.tsx:113  const path = `${profileUserId}/avatar.${ext}`;
                    TeamSettings.tsx:114  ...from("avatars").upload(path, file, { upsert: true });"""
                ),
            },
        ],
    },
    {
        "id": "F-03",
        "severity": "Alta",
        "category": "Permissão definida no navegador",
        "title": "Cinco funções pagas de IA estão públicas e sem rate limit",
        "summary": (
            "import-cifra, import-moises, transpose, sync-lyrics e suggest-culto-songs desativam a "
            "verificação JWT e não fazem autenticação manual antes de consumir LOVABLE_API_KEY."
        ),
        "why": (
            "Os botões ficam dentro do app autenticado e, em vários fluxos, somente para editores, mas "
            "os endpoints podem ser chamados diretamente. Um terceiro usa a chave server-side como "
            "proxy de IA, enviando payloads repetidos/grandes até esgotar créditos ou indisponibilizar a "
            "funcionalidade."
        ),
        "conditions": (
            "As funções precisam estar implantadas com LOVABLE_API_KEY configurada. sync-lyrics não tem "
            "chamada no frontend atual, mas seu handler e configuração pública estão versionados."
        ),
        "impact": "Esgotamento de créditos, aumento de custo, negação de serviço e abuso do provedor de IA.",
        "fix": (
            "Ativar verify_jwt, validar a sessão no handler, exigir team_id/object_id e can_edit_team no "
            "servidor, impor limite de tamanho, quota/rate limit por usuário e time, e registrar consumo."
        ),
        "acceptance": [
            "Chamadas sem JWT válido retornam 401 em todas as cinco funções.",
            "Viewer recebe 403 nos recursos exclusivos de edição.",
            "team_id e objeto são validados server-side, sem confiar no payload de músicas.",
            "Há limite de tamanho e rate limit testável por usuário/time/IP.",
            "Testes cobrem chamadas diretas fora da UI.",
        ],
        "evidence": [
            {
                "file": "supabase/config.toml",
                "lines": "6-16, 27-28",
                "note": "JWT desativado para as cinco funções de IA.",
                "code": dedent(
                    """\
                     6  [functions.import-cifra]
                     7  verify_jwt = false
                     9  [functions.transpose]
                    10  verify_jwt = false
                    12  [functions.sync-lyrics]
                    13  verify_jwt = false
                    15  [functions.import-moises]
                    16  verify_jwt = false
                    27  [functions.suggest-culto-songs]
                    28  verify_jwt = false"""
                ),
            },
            {
                "file": "supabase/functions/import-cifra/index.ts; transpose/index.ts",
                "lines": "9-13, 55-61; 9-13, 28-35",
                "note": "O corpo é aceito antes de usar a chave; não há getClaims/getUser.",
                "code": dedent(
                    """\
                    import-cifra:13  const { url } = await req.json();
                    import-cifra:55  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
                    import-cifra:58  const aiRes = await fetch("https://ai.gateway...", {

                    transpose:13  const { cifra_text, from_key, to_key } = await req.json();
                    transpose:31  const response = await fetch("https://ai.gateway...", {"""
                ),
            },
            {
                "file": "supabase/functions/import-moises/index.ts; sync-lyrics/index.ts; suggest-culto-songs/index.ts",
                "lines": "220-224, 283-292; 137-150, 187-190; 8-21, 53-56",
                "note": "Os outros três handlers seguem o mesmo fluxo sem autenticação.",
                "code": dedent(
                    """\
                    import-moises:224  const body = await req.json();
                    import-moises:289  const aiRes = await fetch("https://ai.gateway...", {
                    sync-lyrics:141    const { segments, duration_seconds } = await req.json();
                    sync-lyrics:187    const response = await fetch("https://ai.gateway...", {
                    suggest:12         const { liturgy, songCount, songs } = await req.json();
                    suggest:53         const response = await fetch("https://ai.gateway...", {"""
                ),
            },
        ],
    },
    {
        "id": "F-04",
        "severity": "Alta",
        "category": "Inputs sem tratamento (XSS)",
        "title": "XSS armazenado por media_url aberto como javascript: em window.open",
        "summary": (
            "Um editor pode salvar media_url com esquema javascript:. Na apresentação, um membro que "
            "clicar em tocar mídia executa o código com acesso a window.opener."
        ),
        "why": (
            "media_url é salvo sem allowlist de protocolo. Se não for reconhecido como YouTube e a música "
            "não tiver áudio, Presentation chama window.open(mediaUrl, '_blank') sem noopener. O padrão foi "
            "reproduzido em Google Chrome headless: o javascript: alterou o DOM do opener, comprovando "
            "execução e acesso ao contexto da aplicação. A sessão Supabase persiste em localStorage."
        ),
        "conditions": (
            "Requer editor/admin malicioso, música sem audio_path, URL não reconhecida como YouTube e clique "
            "da vítima no botão de mídia."
        ),
        "impact": (
            "Execução arbitrária no navegador, roubo do JWT persistido, ações como a vítima e possível acesso "
            "a outros times da conta comprometida."
        ),
        "fix": (
            "Aceitar apenas URLs https válidas e, idealmente, provedores explicitamente permitidos; rejeitar "
            "javascript:, data:, file: e esquemas desconhecidos no cliente e no servidor. Abrir links com "
            "noopener,noreferrer e adicionar CSP como defesa em profundidade."
        ),
        "acceptance": [
            "media_url com javascript:, data: ou esquema desconhecido é rejeitado antes de persistir.",
            "Somente https e hosts permitidos podem ser abertos.",
            "Links externos usam noopener,noreferrer e não expõem window.opener.",
            "Teste E2E comprova que payload javascript: não executa e não lê localStorage.",
            "YouTube e provedores aprovados continuam funcionando.",
        ],
        "evidence": [
            {
                "file": "src/pages/SongEditor.tsx",
                "lines": "153-171, 370-372",
                "note": "Entrada de URL é persistida sem validação de esquema/host.",
                "code": dedent(
                    """\
                    163  media_url: mediaUrl.trim() || null,
                    ...
                    370  <label>Link de mídia</label>
                    372  <GlassInput value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} ... />"""
                ),
            },
            {
                "file": "src/pages/Presentation.tsx",
                "lines": "535-537, 1476-1487",
                "note": "URL não-YouTube chega diretamente a window.open.",
                "code": dedent(
                    """\
                     535  const mediaUrl = currentSong?.media_url || "";
                     536  const youtubeId = mediaUrl ? getYouTubeId(mediaUrl) : null;
                     537  const hasMedia = !!mediaUrl;
                    ...
                    1483  if (youtubeId) {
                    1484    setShowMediaPlayer((v) => !v);
                    1485  } else {
                    1486    window.open(mediaUrl, "_blank");
                    1487  }"""
                ),
            },
            {
                "file": "src/integrations/supabase/client.ts",
                "lines": "11-16",
                "note": "O impacto inclui a sessão persistida no localStorage.",
                "code": dedent(
                    """\
                    11  export const supabase = createClient(..., {
                    12    auth: {
                    13      storage: localStorage,
                    14      persistSession: true,
                    15      autoRefreshToken: true,"""
                ),
            },
        ],
    },
    {
        "id": "F-05",
        "severity": "Alta",
        "category": "IDOR",
        "title": "RLS valida apenas um lado de relações e permite vínculos entre tenants",
        "summary": (
            "Policies de repertorio_songs, culto_songs, culto_lineup e song_loop_points autorizam o "
            "objeto pai/dono, mas não verificam se o ID relacionado pertence ao mesmo time."
        ),
        "why": (
            "Um editor pode associar a seu repertório/culto um song_id de outro tenant; pode também "
            "associar membro estrangeiro à escala. O caso de repertório vira vazamento: public-playlist usa "
            "service_role, lê o song relacionado sem RLS e assina capa/áudio. Loops próprios também aceitam "
            "qualquer song_id."
        ),
        "conditions": (
            "Para o vazamento principal, o atacante precisa ser editor de um time, conhecer um UUID de música "
            "de outro tenant e publicar o próprio repertório. UUIDs reduzem descoberta casual, mas não são "
            "controle de autorização. Os demais vetores causam integridade cruzada com IDs conhecidos."
        ),
        "impact": (
            "Leitura pública de título, artista, cifra/letra e URLs assinadas de mídia privada; poluição de "
            "relações entre tenants e notificações/escala para membros de outro time."
        ),
        "fix": (
            "Em cada policy, validar os dois lados da FK e igualdade de team_id, com USING e WITH CHECK. "
            "Adicionar constraints/trigger de consistência quando possível. public-playlist deve revalidar "
            "team_id da música e selecionar apenas relações consistentes antes de assinar arquivos."
        ),
        "acceptance": [
            "song_id de time B é rejeitado em repertório/culto de time A.",
            "team_member_id de time B é rejeitado em culto de time A.",
            "Loop só pode apontar para música de time do usuário.",
            "public-playlist nunca retorna música cujo team_id difira do repertório.",
            "Testes usam UUIDs conhecidos entre dois tenants e esperam zero linhas/403.",
        ],
        "evidence": [
            {
                "file": "supabase/migrations/20260223230533_2b017539-a6b8-4380-832f-ed808dca9370.sql",
                "lines": "239-253",
                "note": "repertorio_songs deriva permissão só de repertorio_id; song_id não é comparado.",
                "code": dedent(
                    """\
                    243  CREATE POLICY "Editors can add repertorio songs"
                    245  WITH CHECK (public.can_edit_team(auth.uid(),
                         (SELECT team_id FROM public.repertorios WHERE id = repertorio_id)));
                    247  CREATE POLICY "Editors can update repertorio songs"
                    249  USING (public.can_edit_team(auth.uid(),
                         (SELECT team_id FROM public.repertorios WHERE id = repertorio_id)));"""
                ),
            },
            {
                "file": "supabase/functions/public-playlist/index.ts",
                "lines": "25-28, 48-74",
                "note": "service_role atravessa a relação inconsistente e assina a mídia.",
                "code": dedent(
                    """\
                    25  const supabase = createClient(
                    27    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
                    28  );
                    ...
                    49  const { data: repSongs } = await supabase
                    50    .from("repertorio_songs")
                    51    .select("..., songs(id, title, ..., cover_path, audio_path, ...)")
                    ...
                    64  await supabase.storage.from("covers").createSignedUrl(...)
                    72  await supabase.storage.from("audio").createSignedUrl(...)"""
                ),
            },
            {
                "file": "supabase/migrations/20260224031353_4e860432-1560-4d5d-8263-7291e2470a59.sql",
                "lines": "41-51",
                "note": "culto_songs valida o culto, mas não o time da música.",
                "code": dedent(
                    """\
                    44  CREATE POLICY "Editors can add culto songs" ...
                    45  WITH CHECK (can_edit_team(auth.uid(),
                        (SELECT team_id FROM cultos WHERE id = culto_songs.culto_id)));"""
                ),
            },
            {
                "file": "supabase/migrations/20260224031925_6ef15eef-1a23-4908-9b41-515b22769b6c.sql",
                "lines": "17-31",
                "note": "culto_lineup valida culto_id, mas não o time de team_member_id.",
                "code": dedent(
                    """\
                    21  CREATE POLICY "Editors can insert culto lineup"
                    23  WITH CHECK (can_edit_team(auth.uid(),
                        (SELECT cultos.team_id FROM cultos WHERE cultos.id = culto_lineup.culto_id)));"""
                ),
            },
            {
                "file": "supabase/migrations/20260301201228_4702a9c9-71c3-48c7-87ed-6be03e776da9.sql",
                "lines": "33-42",
                "note": "Loops validam profile_id próprio, mas não membership no song_id.",
                "code": dedent(
                    """\
                    33  CREATE POLICY "Users can create own loops"
                    36  WITH CHECK (profile_id = get_my_profile_id());
                    39  CREATE POLICY "Users can update own loops"
                    42  USING (profile_id = get_my_profile_id());"""
                ),
            },
        ],
    },
    {
        "id": "F-06",
        "severity": "Alta",
        "category": "Permissão definida no navegador",
        "title": "Viewer pode iniciar separação de stems e alterar dados via service_role",
        "summary": (
            "O frontend oferece separação somente a admin/editor, mas separate-stems aceita qualquer "
            "membro do time e não limita repetição."
        ),
        "why": (
            "Viewers leem song_id e audio_path pelas policies de SELECT e podem chamar a função diretamente. "
            "O handler confere apenas a existência de membership, dispara o worker intensivo e usa service_role "
            "para marcar a música. O callback substitui tracks automáticas."
        ),
        "conditions": "Requer conta viewer no time e worker/secrets configurados. Não depende da UI.",
        "impact": (
            "Consumo repetido de CPU/tempo, negação de serviço, alteração de stems_status e substituição das "
            "faixas automáticas de uma música sem privilégio de edição."
        ),
        "fix": (
            "Exigir role admin/editor no handler, comparar audio_path exatamente com song.audio_path, aplicar "
            "idempotência por música/job e rate limit por usuário/time."
        ),
        "acceptance": [
            "Viewer recebe 403 ao chamar separate-stems diretamente.",
            "Admin/editor do time correto consegue iniciar um job.",
            "audio_path diferente do persistido é rejeitado.",
            "Uma música em processing não aceita jobs paralelos não autorizados.",
            "Quota/rate limit impede enfileiramento abusivo.",
        ],
        "evidence": [
            {
                "file": "src/pages/SongEditor.tsx",
                "lines": "97-103, 183, 457-466",
                "note": "A UI usa canEdit/readOnly para esconder o botão.",
                "code": dedent(
                    """\
                    101  const { data, error } = await supabase.functions.invoke("separate-stems", {
                    102    body: { song_id: id, audio_path: audioPath },
                    103  });
                    ...
                    183  const readOnly = !canEdit;
                    458  {audioPath && !readOnly && (
                    460    <Button ... onClick={handleSeparateStems}>"""
                ),
            },
            {
                "file": "supabase/functions/separate-stems/index.ts",
                "lines": "45-66, 79-104",
                "note": "O backend testa membership, não role/can_edit_team.",
                "code": dedent(
                    """\
                    45  // Load the song and confirm the caller belongs to its team
                    60  const { data: membership } = await admin
                    61    .from("team_members")
                    63    .eq("team_id", song.team_id)
                    64    .eq("profile_id", callerProfile.id)
                    66  if (!membership) return json({ error: "Forbidden" }, 403);
                    ...
                    80  const workerRes = await fetch(`${workerUrl}/jobs`, ...);
                    101 await admin.from("songs").update({ stems_status: "processing", ... })"""
                ),
            },
            {
                "file": "supabase/functions/stems-callback/index.ts",
                "lines": "71-72, 93-106, 127-133",
                "note": "O fluxo privilegiado remove/insere tracks e finaliza a música.",
                "code": dedent(
                    """\
                    72  await admin.from("song_tracks").delete().eq("song_id", songId)...;
                    93  const { error: upErr } = await admin.storage.from("audio").upload(...);
                    101 const { error: insErr } = await admin.from("song_tracks").insert(...);
                    127 await admin.from("songs").update({ stems_status: "done", ... })"""
                ),
            },
        ],
    },
    {
        "id": "F-07",
        "severity": "Média",
        "category": "Chaves expostas / configuração de segredo",
        "title": "Callback autentica com Bearer undefined quando o segredo não existe",
        "summary": (
            "stems-callback usa non-null assertion em STEMS_CALLBACK_TOKEN, que não valida em runtime. "
            "Se a variável estiver ausente, o segredo esperado vira a string pública Bearer undefined."
        ),
        "why": (
            "A função é implantada com verify_jwt=false. Um atacante envia Authorization: Bearer undefined, "
            "passa safeEqual e fornece meta.song_id arbitrário. O ramo status != done atualiza a tabela songs "
            "com service_role sem depender do worker."
        ),
        "conditions": (
            "Explorável somente em deploy no qual STEMS_CALLBACK_TOKEN esteja ausente (ou vazio com header "
            "equivalente aceito). separate-stems falha quando o segredo falta, mas o callback continua fail-open."
        ),
        "impact": "Alteração cross-tenant de status/erro de músicas por ID conhecido, ignorando RLS.",
        "fix": (
            "Validar presença, comprimento e entropia do segredo antes de comparar; se inválido, retornar 503 "
            "sem criar o client service_role. Preferir assinatura HMAC do corpo com timestamp e vincular "
            "job_id, song_id e team_id ao registro criado pelo servidor."
        ),
        "acceptance": [
            "Sem STEMS_CALLBACK_TOKEN, qualquer requisição retorna 503 e nenhum dado muda.",
            "Bearer undefined, vazio ou incorreto retorna 401 quando o serviço está configurado.",
            "Callback só aceita job_id vinculado à música e ao time persistidos.",
            "Payload adulterado/repetido é rejeitado.",
            "Deploy valida o segredo antes de publicar a função.",
        ],
        "evidence": [
            {
                "file": "supabase/config.toml",
                "lines": "33-34",
                "note": "O gateway não valida JWT para o callback.",
                "code": dedent(
                    """\
                    33  [functions.stems-callback]
                    34  verify_jwt = false"""
                ),
            },
            {
                "file": "supabase/functions/stems-callback/index.ts",
                "lines": "35-56",
                "note": "A asserção ! desaparece em runtime e o valor previsível autentica.",
                "code": dedent(
                    """\
                    36  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                    39  const callbackToken = Deno.env.get("STEMS_CALLBACK_TOKEN")!;
                    42  const auth = req.headers.get("Authorization") ?? "";
                    43  if (!safeEqual(auth, `Bearer ${callbackToken}`)) return json(..., 401);
                    ...
                    45  const { job_id, status, stems, meta } = await req.json();
                    54  .from("songs").update({ stems_status: "error", ... }).eq("id", songId);"""
                ),
            },
        ],
    },
    {
        "id": "F-08",
        "severity": "Média",
        "category": "Banco sem tranca",
        "title": "RLS de notificações aceita destinatário/remetente arbitrários e team_id nulo",
        "summary": (
            "A UI reserva avisos a admin/editor, mas a policy de INSERT aprova qualquer linha com team_id NULL "
            "e não liga profile_id/sender_profile_id ao time nem ao chamador."
        ),
        "why": (
            "Um usuário autenticado pode chamar PostgREST diretamente, criar notificações para profile_id "
            "conhecido, fingir ser outro remetente e ignorar can_edit_team escolhendo team_id nulo."
        ),
        "conditions": "Requer sessão autenticada e UUID do perfil alvo para ataque direcionado.",
        "impact": "Spam persistente, personificação e engenharia social entre tenants; crescimento indevido da tabela.",
        "fix": (
            "Restringir a policy a authenticated, exigir team_id não nulo, can_edit_team, destinatário membro do "
            "mesmo time e sender_profile_id igual a get_my_profile_id(). Preferir RPC/Edge Function que derive "
            "remetente e destinatários no servidor."
        ),
        "acceptance": [
            "INSERT com team_id NULL é rejeitado.",
            "Viewer não envia avisos mesmo chamando PostgREST diretamente.",
            "Destinatário precisa pertencer ao team_id informado.",
            "sender_profile_id é derivado da sessão e não pode ser forjado.",
            "Testes cobrem dois tenants e profile_id conhecido.",
        ],
        "evidence": [
            {
                "file": "src/components/AppLayout.tsx; src/components/SendNotificationModal.tsx",
                "lines": "90-98; 40-49",
                "note": "O gate canEdit está no navegador; o insert inclui IDs controláveis.",
                "code": dedent(
                    """\
                    AppLayout.tsx:90  {canEdit && (
                    AppLayout.tsx:92    onClick={() => setNotifModalOpen(true)}

                    SendNotificationModal.tsx:40  const notifications = members.map((m) => ({
                    41    profile_id: m.profile_id,
                    42    team_id: currentTeam.id,
                    46    sender_profile_id: profileId,
                    49  ...from("notifications").insert(notifications as any);"""
                ),
            },
            {
                "file": "supabase/migrations/20260224230010_c9c85c73-eb68-48dc-892c-59f097844d12.sql",
                "lines": "54-60",
                "note": "team_id IS NULL ignora a verificação; recipient/sender não aparecem.",
                "code": dedent(
                    """\
                    55  CREATE POLICY "Team editors can create notifications"
                    56  ON public.notifications
                    57  FOR INSERT
                    58  WITH CHECK (
                    59    team_id IS NULL OR can_edit_team(auth.uid(), team_id)
                    60  );"""
                ),
            },
        ],
    },
    {
        "id": "F-09",
        "severity": "Média",
        "category": "Permissão definida no navegador",
        "title": "Policy de status permite ao membro alterar todos os campos da escala",
        "summary": (
            "O frontend atualiza somente status, porém a policy concede UPDATE da linha inteira quando "
            "team_member_id pertence ao chamador."
        ),
        "why": (
            "RLS limita quais linhas podem ser atualizadas, não quais colunas. Um viewer escalado pode enviar "
            "diretamente instrument, culto_id e outros campos. A condição só preserva a propriedade do "
            "team_member_id; não valida o culto nem restringe a mudança ao status."
        ),
        "conditions": "Requer membro com ao menos uma linha de culto_lineup e os IDs desejados.",
        "impact": "Adulteração de escala e instrumentos; possível movimentação da própria escala para culto de outro tenant.",
        "fix": (
            "Revogar UPDATE direto para membros e expor RPC set_lineup_status(lineup_id, status), validando "
            "auth.uid(), enum permitido e mantendo todos os demais campos imutáveis. Alternativamente, usar "
            "privilégio de coluna e trigger defensivo, além de WITH CHECK de consistência de time."
        ),
        "acceptance": [
            "Viewer consegue alterar pending para accepted/declined na própria linha.",
            "Viewer não altera instrument, culto_id, team_member_id ou created_at.",
            "Viewer não move escala para outro tenant.",
            "Admin/editor mantém o fluxo legítimo de gestão da escala.",
            "Teste direto via PostgREST valida cada coluna proibida.",
        ],
        "evidence": [
            {
                "file": "src/pages/Home.tsx",
                "lines": "97-101",
                "note": "A intenção da UI é alterar apenas status.",
                "code": dedent(
                    """\
                     97  const updateLineupStatus = async (lineupId, status) => {
                     98    const { error } = await supabase
                     99      .from("culto_lineup")
                    100      .update({ status } as any)
                    101      .eq("id", lineupId);"""
                ),
            },
            {
                "file": "supabase/migrations/20260224230010_c9c85c73-eb68-48dc-892c-59f097844d12.sql",
                "lines": "8-18",
                "note": "A policy nomeada 'status' não restringe coluna nem culto/time.",
                "code": dedent(
                    """\
                     9  CREATE POLICY "Members can update own lineup status"
                    10  ON public.culto_lineup
                    11  FOR UPDATE
                    12  USING (
                    13    team_member_id IN (
                    14      SELECT tm.id FROM team_members tm
                    16      WHERE p.user_id = auth.uid()
                    17    )
                    18  );"""
                ),
            },
        ],
    },
]


strengths = [
    (
        "RLS é o mecanismo central e está ativado nas 15 tabelas de domínio.",
        "As migrations habilitam RLS em profiles, teams, team_members, team_invites, repertorios, songs, "
        "repertorio_songs, cultos, culto_songs, culto_lineup, member_availability, notifications, messages, "
        "song_tracks e song_loop_points.",
    ),
    (
        "Entidades principais aplicam o papel correto no servidor.",
        "songs/repertorios/cultos usam is_team_member para leitura e can_edit_team para escrita; times, membros "
        "e convites usam has_team_role(..., 'admin').",
    ),
    (
        "O bucket audio está isolado pelo primeiro segmento do caminho.",
        "As quatro policies em 20260224005059...sql:10-24 usam storage.foldername(name)[1] e "
        "is_team_member/can_edit_team.",
    ),
    (
        "Operações por dono têm boas verificações em várias tabelas.",
        "Disponibilidade valida team_member_id próprio; notificações de leitura/alteração/remoção validam profile_id; "
        "mensagens validam team_id e sender_profile_id; song_tracks deriva o time da música.",
    ),
    (
        "Handlers sensíveis possuem verificações úteis onde indicadas.",
        "accept-invite valida JWT, token, estado e e-mail; public-playlist exige token UUID e is_public; "
        "separate-stems valida JWT e membership (embora o papel esteja fraco).",
    ),
    (
        "Worker interno falha fechado sem WORKER_TOKEN.",
        "demucs-worker/app.py:31 usa os.environ['WORKER_TOKEN']; /jobs e downloads chamam _check com "
        "hmac.compare_digest. Somente /health é público por desenho.",
    ),
    (
        "Nenhum segredo privado hardcoded foi encontrado.",
        "Árvore e dois commits foram examinados. .env contém apenas project ref/URL e JWT role=anon publicável; "
        "o bundle contém somente essa chave/URL esperadas. service_role, LOVABLE_API_KEY, WORKER_TOKEN e chaves "
        "privadas não aparecem no bundle nem no histórico.",
    ),
    (
        "Conteúdo textual é escapado pelo React.",
        "Letras, cifras, chat, notas e notificações são interpolados como texto. Não há parser Markdown/HTML; o único "
        "dangerouslySetInnerHTML está em um componente de CSS de gráfico sem chamadores e sem dados de usuário.",
    ),
]


handler_coverage = [
    ("Edge", "accept-invite", "JWT manual; token + e-mail + accepted=false", "Correto no escopo"),
    ("Edge", "admin-update-user", "JWT + admin em time compartilhado", "F-01: escopo global inseguro"),
    ("Edge", "create-invite", "JWT + admin do team_id", "F-01: membership sem aceite"),
    ("Edge", "import-cifra", "Sem autenticação; IA paga", "F-03"),
    ("Edge", "import-moises", "Sem autenticação; IA paga", "F-03"),
    ("Edge", "public-playlist", "Público por token + is_public", "Correto isoladamente; cadeia F-05"),
    ("Edge", "separate-stems", "JWT + membership", "F-06: papel insuficiente"),
    ("Edge", "stems-callback", "Bearer compartilhado", "F-07: fail-open se ausente"),
    ("Edge", "suggest-culto-songs", "Sem autenticação; IA paga", "F-03"),
    ("Edge", "sync-lyrics", "Sem autenticação; IA paga", "F-03"),
    ("Edge", "transpose", "Sem autenticação; IA paga", "F-03"),
    ("FastAPI", "GET /health", "Público intencional; sem dados sensíveis", "Correto no escopo"),
    ("FastAPI", "POST /jobs", "Bearer WORKER_TOKEN + validação de URL", "Correto no modelo service-to-service"),
    ("FastAPI", "GET /jobs/{jid}", "Bearer WORKER_TOKEN; jid UUID aleatório", "Correto no modelo service-to-service"),
    ("FastAPI", "GET /jobs/{jid}/stems/{stem}", "Bearer WORKER_TOKEN + stem existente", "Correto no modelo service-to-service"),
]


rls_coverage = [
    ("profiles", "auth.uid() e co-membership", "Leitura/alteração própria corretas; co-membro para perfil."),
    ("teams / team_members / team_invites", "membership + papel admin", "CRUD de tenant protegido; cadeia global em F-01."),
    ("repertorios / songs / cultos", "team_id + is_team_member/can_edit_team", "Políticas centrais corretas."),
    ("repertorio_songs / culto_songs", "time derivado só do pai", "F-05: lado song_id não validado."),
    ("culto_lineup", "time derivado do culto; status por membro", "F-05 e F-09."),
    ("member_availability", "team_member próprio / time", "SELECT e escritas por dono corretas."),
    ("notifications", "profile dono; INSERT por editor", "Leitura própria correta; INSERT vulnerável F-08."),
    ("messages", "team_id + sender_profile_id", "SELECT/INSERT/DELETE corretamente limitados."),
    ("song_tracks", "time derivado de song_id", "Leitura por membro; escrita por editor correta."),
    ("song_loop_points", "profile dono / loop público no time", "F-05: criação própria não valida time da música."),
    ("storage.audio", "primeira pasta = team_id", "Correto para SELECT/INSERT/UPDATE/DELETE."),
    ("storage.covers", "somente authenticated", "F-02: sem isolamento."),
    ("storage.avatars", "leitura pública; escrita authenticated", "F-02: escrita sem dono."),
]


recommendations = [
    ("P1", "Bloquear a cadeia de tomada de conta (F-01)", "Remover reset global por admin e exigir aceite real do convite. Invalidar sessões e revisar logs."),
    ("P1", "Fechar Storage e relações cross-tenant (F-02/F-05)", "Publicar migration com policies de ambos os lados, WITH CHECK e testes com dois tenants."),
    ("P1", "Eliminar o XSS de media_url (F-04)", "Allowlist HTTPS/hosts no servidor e cliente; noopener/noreferrer e CSP defensiva."),
    ("P1", "Autenticar e limitar funções de IA (F-03)", "JWT, papel por time, quotas, limites de payload e rate limit antes de nova implantação."),
    ("P2", "Alinhar stems ao papel editor (F-06)", "can_edit_team server-side, caminho exato, idempotência e quota de jobs."),
    ("P2", "Fazer callback falhar fechado (F-07)", "Validação obrigatória do segredo, HMAC/timestamp e vínculo do job à música."),
    ("P2", "Endurecer notificações e escala (F-08/F-09)", "RPCs estreitas, remetente derivado da sessão e alteração apenas de status."),
    ("P3", "Criar suíte de autorização", "Testes automatizados por tabela/bucket/handler com admin, editor, viewer, anon e dois tenants."),
    ("P3", "Corrigir drift de schema e build", "Reconstituir migrations vazias/colunas ausentes e sincronizar package-lock.json para npm ci reproduzível."),
]


limitations = [
    "Auditoria estática do commit informado; não foram executados testes destrutivos contra o projeto Supabase ao vivo.",
    "O estado implantado de policies, grants, Auth e secrets não foi consultado; as migrations versionadas foram tratadas como fonte de verdade.",
    "Cinco migrations estão vazias/quase vazias e types.ts contém colunas sem migration correspondente (por exemplo, notes_author_id, sender_profile_id, lyrics_text e scroll_speed), indicando drift de schema.",
    "supabase/config.toml cita transcribe-sync, mas não há handler correspondente no repositório; portanto ele não pôde ser auditado.",
    "npm ci falhou por divergência entre package.json e package-lock.json. O bundle foi produzido com instalação local sem atualizar o lockfile.",
]


def issue_markdown(finding: dict, number: int) -> str:
    evidence_blocks = []
    for ev in finding["evidence"]:
        evidence_blocks.append(
            f"- `{ev['file']}:{ev['lines']}` — {ev['note']}\n\n"
            f"```text\n{ev['code'].strip()}\n```"
        )
    checklist = "\n".join(f"- [ ] {item}" for item in finding["acceptance"])
    return dedent(
        f"""\
        --- ISSUE {number} ---

        # [Segurança] {finding['title']}

        **Labels sugeridas:** `security`, `severidade:{finding['severity'].lower()}`

        ## Descrição do problema

        {finding['summary']}

        {finding['why']}

        **Condições de explorabilidade:** {finding['conditions']}

        ## Evidência

        {chr(10).join(evidence_blocks)}

        ## Impacto

        {finding['impact']}

        ## Sugestão de correção

        {finding['fix']}

        ## Critérios de aceite

        {checklist}

        --- FIM ISSUE {number} ---
        """
    ).strip()


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverKicker",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=HexColor(PALETTE["Ponto forte"]),
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=27,
        leading=32,
        textColor=HexColor(PALETTE["Navy"]),
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSub",
        parent=styles["Normal"],
        fontSize=12,
        leading=17,
        textColor=HexColor(PALETTE["Muted"]),
    )
)
styles.add(
    ParagraphStyle(
        name="H1x",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=HexColor(PALETTE["Navy"]),
        spaceBefore=4,
        spaceAfter=9,
    )
)
styles.add(
    ParagraphStyle(
        name="H2x",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=16,
        textColor=HexColor(PALETTE["Navy"]),
        spaceBefore=8,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="H3x",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=14,
        textColor=HexColor(PALETTE["Ink"]),
        spaceBefore=5,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="Bodyx",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.6,
        leading=12.2,
        textColor=HexColor(PALETTE["Ink"]),
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="Smallx",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.4,
        leading=10,
        textColor=HexColor(PALETTE["Muted"]),
    )
)
styles.add(
    ParagraphStyle(
        name="Tablex",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.1,
        leading=9.4,
        textColor=HexColor(PALETTE["Ink"]),
    )
)
styles.add(
    ParagraphStyle(
        name="TableHeadx",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=9.2,
        textColor=colors.white,
    )
)
styles.add(
    ParagraphStyle(
        name="CodeBlockx",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=6.6,
        leading=8.3,
        leftIndent=5,
        rightIndent=5,
        borderColor=HexColor(PALETTE["Line"]),
        borderWidth=0.5,
        borderPadding=6,
        backColor=HexColor("#F7F9FC"),
        textColor=HexColor("#1E293B"),
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="IssueCodex",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=6.8,
        leading=8.7,
        leftIndent=4,
        rightIndent=4,
        borderColor=HexColor(PALETTE["Line"]),
        borderWidth=0.6,
        borderPadding=7,
        backColor=HexColor("#F8FAFC"),
        textColor=HexColor("#182234"),
        spaceAfter=9,
    )
)


def para(text: str, style: str = "Bodyx", rich: bool = False) -> Paragraph:
    return Paragraph(text if rich else escape(text).replace("\n", "<br/>"), styles[style])


def heading(text: str, level: int = 1) -> Paragraph:
    return para(text, {1: "H1x", 2: "H2x", 3: "H3x"}[level])


def code_block(text: str) -> Preformatted:
    return Preformatted(text.strip(), styles["CodeBlockx"], maxLineLength=102)


def section_rule() -> HRFlowable:
    return HRFlowable(width="100%", thickness=0.7, color=HexColor(PALETTE["Line"]), spaceBefore=2, spaceAfter=8)


chart_buffers: list[io.BytesIO] = []


def severity_chart() -> Image:
    labels = ["Crítica", "Alta", "Média", "Baixa"]
    values = [1, 5, 3, 0]
    nonzero = [(l, v) for l, v in zip(labels, values) if v]
    fig, ax = plt.subplots(figsize=(4.7, 3.0), dpi=160)
    fig.patch.set_alpha(0)
    ax.pie(
        [v for _, v in nonzero],
        colors=[PALETTE[l] for l, _ in nonzero],
        startangle=90,
        counterclock=False,
        wedgeprops={"width": 0.34, "edgecolor": "white", "linewidth": 2},
        autopct=lambda p: f"{round(p / 100 * sum(v for _, v in nonzero))}",
        pctdistance=0.82,
        textprops={"color": "white", "fontsize": 9, "fontweight": "bold"},
    )
    ax.text(0, 0.06, "9", ha="center", va="center", fontsize=24, fontweight="bold", color=PALETTE["Navy"])
    ax.text(0, -0.18, "achados", ha="center", va="center", fontsize=8, color=PALETTE["Muted"])
    ax.legend(
        [f"{l}: {v}" for l, v in nonzero],
        loc="lower center",
        bbox_to_anchor=(0.5, -0.16),
        ncol=3,
        frameon=False,
        fontsize=7,
    )
    ax.set_title("Distribuição por severidade", fontsize=10, fontweight="bold", color=PALETTE["Navy"], pad=8)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", transparent=True)
    plt.close(fig)
    buf.seek(0)
    chart_buffers.append(buf)
    return Image(buf, width=78 * mm, height=51 * mm)


def category_chart() -> Image:
    labels = ["Banco/RLS", "Permissões", "IDOR", "Segredos", "XSS"]
    values = [2, 4, 1, 1, 1]
    colors_list = ["#315E8A", "#4E739A", "#6D88A5", "#879CAD", "#9AAAB5"]
    fig, ax = plt.subplots(figsize=(5.3, 3.0), dpi=160)
    fig.patch.set_alpha(0)
    bars = ax.barh(labels[::-1], values[::-1], color=colors_list[::-1], height=0.62)
    ax.set_xlim(0, 4.6)
    ax.xaxis.grid(True, color="#E5EAF0", linewidth=0.8)
    ax.set_axisbelow(True)
    ax.spines[["top", "right", "left", "bottom"]].set_visible(False)
    ax.tick_params(axis="both", labelsize=7, length=0, colors=PALETTE["Muted"])
    for bar, value in zip(bars, values[::-1]):
        ax.text(value + 0.08, bar.get_y() + bar.get_height() / 2, str(value), va="center", fontsize=8, fontweight="bold", color=PALETTE["Navy"])
    ax.set_title("Achados por categoria", fontsize=10, fontweight="bold", color=PALETTE["Navy"], pad=8)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", transparent=True)
    plt.close(fig)
    buf.seek(0)
    chart_buffers.append(buf)
    return Image(buf, width=82 * mm, height=51 * mm)


def base_table(data, widths, header=True, row_backgrounds=None, font_size=7.1):
    table = LongTable(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.35, HexColor(PALETTE["Line"])),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor(PALETTE["Navy"])),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ]
        )
    start = 1 if header else 0
    for idx in range(start, len(data)):
        if idx % 2 == 0:
            commands.append(("BACKGROUND", (0, idx), (-1, idx), HexColor("#F8FAFC")))
    if row_backgrounds:
        for row, col, color_value in row_backgrounds:
            commands.append(("BACKGROUND", (col, row), (col, row), HexColor(color_value)))
            commands.append(("TEXTCOLOR", (col, row), (col, row), colors.white))
            commands.append(("ALIGN", (col, row), (col, row), "CENTER"))
            commands.append(("VALIGN", (col, row), (col, row), "MIDDLE"))
    table.setStyle(TableStyle(commands))
    return table


def cover_story(story):
    story.append(Spacer(1, 16 * mm))
    mark = Table(
        [[para("+L", "CoverKicker"), para("SECURITY REVIEW / 2026", "CoverKicker")]],
        colWidths=[15 * mm, 80 * mm],
    )
    mark.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), HexColor(PALETTE["Navy"])),
                ("TEXTCOLOR", (0, 0), (0, 0), colors.white),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(mark)
    story.append(Spacer(1, 17 * mm))
    story.append(para("Relatório de Auditoria de Segurança", "CoverTitle"))
    story.append(para(f"— {PROJECT}", "CoverTitle"))
    story.append(Spacer(1, 5 * mm))
    story.append(para(f"Data: {REPORT_DATE}<br/>Commit auditado: {COMMIT[:12]}", "CoverSub", rich=True))
    story.append(Spacer(1, 13 * mm))
    scope = Table(
        [
            [para("ESCOPO AUDITADO", "TableHeadx")],
            [
                para(
                    "Frontend React/Vite, cliente Supabase/PostgREST, 21 migrations SQL, 11 Edge Functions Deno, "
                    "worker FastAPI/Docker, três buckets Storage, configuração de deploy, documentação, árvore e "
                    "histórico Git e bundle de produção.",
                    "Bodyx",
                )
            ],
        ],
        colWidths=[166 * mm],
    )
    scope.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HexColor(PALETTE["Navy"])),
                ("BACKGROUND", (0, 1), (-1, 1), HexColor(PALETTE["Soft"])),
                ("BOX", (0, 0), (-1, -1), 0.6, HexColor(PALETTE["Line"])),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(scope)
    story.append(Spacer(1, 9 * mm))
    story.append(heading("Nota metodológica", 2))
    story.append(
        para(
            "A auditoria mapeou as cinco categorias à stack detectada: isolamento por RLS e namespaces de "
            "Storage; gates React cruzados com policies/Edge Functions; IDOR em cada handler e relação por ID; "
            "segredos no tree, histórico e bundle; e XSS em sinks HTML/URL e respostas. Somente condições "
            "demonstráveis no código foram classificadas como achado."
        )
    )
    story.append(Spacer(1, 12 * mm))
    story.append(para("CLASSIFICAÇÃO: USO INTERNO • recomenda-se tratar P1 antes de nova publicação", "Smallx"))
    story.append(PageBreak())


def executive_story(story):
    story.append(heading("Resumo executivo"))
    story.append(section_rule())
    story.append(
        para(
            "Foram confirmados 9 achados: 1 crítico, 5 altos e 3 médios. O risco dominante é uma cadeia de "
            "tomada de conta que transforma administração de um time em controle da identidade Supabase global. "
            "Também há quebra de isolamento em Storage e relações, endpoints de IA públicos, execução de "
            "javascript: armazenado e divergências entre gates do navegador e validações server-side."
        )
    )
    cards = []
    for label, value in [("CRÍTICA", "1"), ("ALTA", "5"), ("MÉDIA", "3"), ("BAIXA", "0")]:
        sev = label.title()
        cards.append(
            Table(
                [[para(value, "CoverTitle"), para(label, "Smallx")]],
                colWidths=[18 * mm, 20 * mm],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F8FAFC")),
                        ("BOX", (0, 0), (-1, -1), 1, HexColor(PALETTE[sev])),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 5),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                ),
            )
        )
    card_row = Table([cards], colWidths=[42 * mm] * 4)
    card_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 1), ("RIGHTPADDING", (0, 0), (-1, -1), 1)]))
    story.append(Spacer(1, 3 * mm))
    story.append(card_row)
    story.append(Spacer(1, 5 * mm))
    charts = Table([[severity_chart(), category_chart()]], colWidths=[82 * mm, 86 * mm])
    charts.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(charts)
    story.append(heading("Riscos centrais", 2))
    weak_rows = [
        [para("Prioridade", "TableHeadx"), para("Risco", "TableHeadx"), para("Efeito", "TableHeadx")],
        [para("P1", "Tablex"), para("Identidade global administrável por admin de time", "Tablex"), para("Tomada integral de conta", "Tablex")],
        [para("P1", "Tablex"), para("RLS incompleta em Storage e relações", "Tablex"), para("Vazamento/adulteração cross-tenant", "Tablex")],
        [para("P1", "Tablex"), para("URL armazenada executável", "Tablex"), para("Roubo de sessão após clique", "Tablex")],
        [para("P1", "Tablex"), para("IA pública sem quota", "Tablex"), para("Custo e indisponibilidade", "Tablex")],
    ]
    story.append(base_table(weak_rows, [23 * mm, 82 * mm, 61 * mm]))
    story.append(PageBreak())


def stack_story(story):
    story.append(heading("Stack detectada e mapeamento metodológico"))
    story.append(section_rule())
    stack_rows = [
        [para("Camada", "TableHeadx"), para("Tecnologia detectada", "TableHeadx"), para("Evidência", "TableHeadx")],
        [para("Linguagens", "Tablex"), para("TypeScript/TSX, SQL/PLpgSQL, Python 3.11", "Tablex"), para("package.json; migrations; demucs-worker/Dockerfile", "Tablex")],
        [para("Frontend", "Tablex"), para("React 18, Vite 5, React Router 6, TanStack Query, Tailwind/shadcn, PWA", "Tablex"), para("package.json:44-67; vite.config.ts", "Tablex")],
        [para("Backend", "Tablex"), para("Supabase Edge Functions em Deno + FastAPI worker", "Tablex"), para("supabase/functions/*; demucs-worker/app.py", "Tablex")],
        [para("Banco/query builder", "Tablex"), para("PostgreSQL/Supabase; supabase-js/PostgREST; sem ORM tradicional", "Tablex"), para("@supabase/supabase-js; chamadas .from/.select/.update", "Tablex")],
        [para("Auth", "Tablex"), para("Supabase Auth/JWT; auth.uid() em RLS; getClaims em Edge; Bearer estático no worker", "Tablex"), para("client.ts; migrations; handlers; app.py", "Tablex")],
        [para("Isolamento", "Tablex"), para("RLS por team_id, membership/profile_id e namespace de Storage", "Tablex"), para("is_team_member, can_edit_team, has_team_role", "Tablex")],
        [para("Deploy", "Tablex"), para("Supabase config + Dockerfile do worker + publicação Lovable", "Tablex"), para("supabase/config.toml; demucs-worker/Dockerfile; README", "Tablex")],
        [para("Ausentes", "Tablex"), para("Sem CI versionada, Helm, Terraform, docker-compose ou charts", "Tablex"), para("Inventário completo do tree", "Tablex")],
    ]
    story.append(base_table(stack_rows, [28 * mm, 85 * mm, 53 * mm]))
    story.append(Spacer(1, 4 * mm))
    mapping_rows = [
        [para("Categoria solicitada", "TableHeadx"), para("Equivalente nesta stack", "TableHeadx")],
        [para("1. Banco sem tranca", "Tablex"), para("RLS PostgreSQL em tabelas + policies de storage.objects + filtros team_id/profile_id", "Tablex")],
        [para("2. Permissão no navegador", "Tablex"), para("isAdmin/canEdit/readOnly no React versus RLS, getClaims e roles nas Edge Functions", "Tablex")],
        [para("3. IDOR", "Tablex"), para("IDs em rotas React/PostgREST, bodies de Edge Functions, relações FK e job IDs FastAPI", "Tablex")],
        [para("4. Chaves expostas", "Tablex"), para(".env, Deno.env, Docker env, docs/config, dois commits e artefatos dist", "Tablex")],
        [para("5. XSS", "Tablex"), para("Sinks React/DOM, URLs href/src/window.open, chart CSS, texto/HTML de funções", "Tablex")],
    ]
    story.append(heading("Como cada categoria foi aplicada", 2))
    story.append(base_table(mapping_rows, [52 * mm, 114 * mm]))
    story.append(heading("Limitações e estado de verificação", 2))
    for item in limitations:
        story.append(para(f"• {item}"))
    story.append(PageBreak())


def strengths_story(story):
    story.append(heading("Pontos fortes"))
    story.append(section_rule())
    story.append(para("Os controles abaixo foram verificados no código e contam como evidência positiva de cobertura."))
    rows = [[para("Controle", "TableHeadx"), para("Evidência", "TableHeadx")]]
    for title, evidence in strengths:
        rows.append([para(title, "Tablex"), para(evidence, "Tablex")])
    backgrounds = [(i, 0, PALETTE["Ponto forte"]) for i in range(1, len(rows))]
    story.append(base_table(rows, [58 * mm, 108 * mm], row_backgrounds=backgrounds))
    story.append(Spacer(1, 5 * mm))
    story.append(heading("Pontos fracos", 2))
    for f in findings:
        story.append(para(f"• {f['id']} [{f['severity']}] {f['title']}"))
    story.append(PageBreak())


def coverage_story(story):
    story.append(heading("Cobertura sistemática de handlers e RLS"))
    story.append(section_rule())
    story.append(heading("Todos os handlers backend", 2))
    rows = [[para("Tipo", "TableHeadx"), para("Handler", "TableHeadx"), para("Controle observado", "TableHeadx"), para("Resultado", "TableHeadx")]]
    for kind, handler, control, result in handler_coverage:
        rows.append([para(kind, "Tablex"), para(handler, "Tablex"), para(control, "Tablex"), para(result, "Tablex")])
    story.append(base_table(rows, [19 * mm, 43 * mm, 64 * mm, 40 * mm]))
    story.append(PageBreak())
    story.append(heading("Tabelas e buckets — continuação da cobertura", 2))
    rows = [[para("Objeto", "TableHeadx"), para("Mecanismo", "TableHeadx"), para("Resultado", "TableHeadx")]]
    for obj, mechanism, result in rls_coverage:
        rows.append([para(obj, "Tablex"), para(mechanism, "Tablex"), para(result, "Tablex")])
    story.append(base_table(rows, [48 * mm, 61 * mm, 57 * mm]))
    story.append(PageBreak())


def finding_matrix_story(story):
    story.append(heading("Tabela consolidada de achados"))
    story.append(section_rule())
    rows = [[para("Severidade", "TableHeadx"), para("Categoria", "TableHeadx"), para("Arquivo:linha", "TableHeadx"), para("Descrição", "TableHeadx")]]
    backgrounds = []
    row_index = 1
    for f in findings:
        for ev in f["evidence"]:
            rows.append(
                [
                    para(f["severity"], "Tablex"),
                    para(f["category"], "Tablex"),
                    para(f"{ev['file']}:{ev['lines']}", "Tablex"),
                    para(f"{f['id']} — {ev['note']}", "Tablex"),
                ]
            )
            backgrounds.append((row_index, 0, PALETTE[f["severity"]]))
            row_index += 1
    story.append(base_table(rows, [22 * mm, 37 * mm, 62 * mm, 45 * mm], row_backgrounds=backgrounds))
    story.append(PageBreak())


def detailed_findings_story(story):
    story.append(heading("Achados detalhados"))
    story.append(section_rule())
    for index, f in enumerate(findings):
        badge = Table(
            [[para(f["severity"].upper(), "TableHeadx"), para(f["category"], "Tablex")]],
            colWidths=[27 * mm, 73 * mm],
        )
        badge.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), HexColor(PALETTE[f["severity"]])),
                    ("TEXTCOLOR", (0, 0), (0, 0), colors.white),
                    ("BACKGROUND", (1, 0), (1, 0), HexColor("#EEF2F6")),
                    ("BOX", (0, 0), (-1, -1), 0.4, HexColor(PALETTE["Line"])),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(KeepTogether([badge, Spacer(1, 2 * mm), heading(f"{f['id']} — {f['title']}", 2)]))
        story.append(para(f["summary"]))
        story.append(heading("Por que é explorável", 3))
        story.append(para(f["why"]))
        story.append(para(f"Condições: {f['conditions']}"))
        story.append(heading("Impacto", 3))
        story.append(para(f["impact"]))
        story.append(heading("Evidências", 3))
        for ev in f["evidence"]:
            story.append(para(f"{ev['file']}:{ev['lines']} — {ev['note']}", "Smallx"))
            story.append(code_block(ev["code"]))
        story.append(heading("Correção recomendada", 3))
        story.append(para(f["fix"]))
        if index != len(findings) - 1:
            story.append(Spacer(1, 2 * mm))
            story.append(HRFlowable(width="100%", thickness=1.2, color=HexColor(PALETTE[f["severity"]]), spaceBefore=5, spaceAfter=9))
    story.append(PageBreak())


def recommendations_story(story):
    story.append(heading("Recomendações priorizadas"))
    story.append(section_rule())
    rows = [[para("Prioridade", "TableHeadx"), para("Ação", "TableHeadx"), para("Resultado esperado", "TableHeadx")]]
    for priority, action, result in recommendations:
        rows.append([para(priority, "Tablex"), para(action, "Tablex"), para(result, "Tablex")])
    priority_colors = {"P1": PALETTE["Crítica"], "P2": PALETTE["Média"], "P3": PALETTE["Baixa"]}
    backgrounds = [(i, 0, priority_colors[recommendations[i - 1][0]]) for i in range(1, len(rows))]
    story.append(base_table(rows, [22 * mm, 62 * mm, 82 * mm], row_backgrounds=backgrounds))
    story.append(Spacer(1, 5 * mm))
    story.append(heading("Verificações técnicas executadas", 2))
    checks = [
        "Build Vite de produção: concluído com sucesso (3464 módulos).",
        "Bundle: contém a URL e a chave Supabase role=anon esperadas; zero ocorrência de service_role, LOVABLE_API_KEY, WORKER_TOKEN, STEMS_CALLBACK_TOKEN ou padrões de chave privada.",
        "Histórico Git: dois commits alcançáveis examinados; nenhum segredo privado confirmado.",
        "Teste unitário existente: 1 arquivo / 1 teste aprovado.",
        "Lint: falhou com 170 erros e 25 avisos preexistentes, predominantemente no-explicit-any e dependências de hooks.",
        "Reprodução XSS: Chrome headless confirmou execução de javascript: aberto por window.open e acesso ao opener.",
    ]
    for check in checks:
        story.append(para(f"• {check}"))
    story.append(PageBreak())


def issues_story(story):
    story.append(heading("ISSUES PARA O GITHUB"))
    story.append(section_rule())
    story.append(
        para(
            "Os blocos abaixo estão completos e prontos para copiar e colar. Achados relacionados foram "
            "agrupados: Storage em F-02, funções de IA em F-03 e relações multi-tenant em F-05."
        )
    )
    for number, finding in enumerate(findings, start=1):
        story.append(Spacer(1, 3 * mm))
        story.append(Preformatted(issue_markdown(finding, number), styles["IssueCodex"], maxLineLength=98))


def on_page(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    width, height = A4
    if page > 1:
        canvas.setStrokeColor(HexColor(PALETTE["Line"]))
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, height - 14 * mm, width - 20 * mm, height - 14 * mm)
        canvas.setFont("Helvetica-Bold", 7)
        canvas.setFillColor(HexColor(PALETTE["Navy"]))
        canvas.drawString(20 * mm, height - 11 * mm, "RELATÓRIO DE AUDITORIA DE SEGURANÇA — MAISLOUVOR")
        canvas.setFillColor(HexColor(PALETTE["Ponto forte"]))
        canvas.rect(width - 26 * mm, height - 11.8 * mm, 6 * mm, 2.2 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(HexColor(PALETTE["Line"]))
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, 13 * mm, width - 20 * mm, 13 * mm)
    canvas.setFont("Helvetica", 6.8)
    canvas.setFillColor(HexColor(PALETTE["Muted"]))
    canvas.drawString(20 * mm, 9.5 * mm, f"{PROJECT} • {REPORT_DATE} • uso interno")
    canvas.drawRightString(width - 20 * mm, 9.5 * mm, f"Página {page}")
    canvas.restoreState()


def build_report():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=f"Relatório de Auditoria de Segurança — {PROJECT}",
        author="OpenAI Codex",
        subject="Auditoria estática de segurança",
    )
    story = []
    cover_story(story)
    executive_story(story)
    stack_story(story)
    strengths_story(story)
    coverage_story(story)
    finding_matrix_story(story)
    detailed_findings_story(story)
    recommendations_story(story)
    issues_story(story)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)

    page_count = "desconhecido"
    try:
        from pypdf import PdfReader

        page_count = str(len(PdfReader(str(OUTPUT)).pages))
    except Exception:
        pass
    print(f"PDF gerado: {OUTPUT}")
    print(f"Páginas: {page_count}")
    print(f"Tamanho: {OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    build_report()
