\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
\ir ../../supabase/migrations/20260930200000_song_registration_catalog.sql
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('93000000-0000-4000-8000-000000000001','song-qa-admin@example.invalid','{"full_name":"Synthetic catalog QA"}'),
 ('93000000-0000-4000-8000-000000000002','song-qa-viewer@example.invalid','{"full_name":"Synthetic catalog viewer"}'),
 ('93000000-0000-4000-8000-000000000003','song-qa-other@example.invalid','{"full_name":"Synthetic catalog other"}');
INSERT INTO public.teams(id,name,owner_id) SELECT '93000000-0000-4000-8000-000000000010','Synthetic catalog team',id FROM public.profiles WHERE user_id='93000000-0000-4000-8000-000000000001';
INSERT INTO public.teams(id,name,owner_id) SELECT '93000000-0000-4000-8000-000000000020','Synthetic other team',id FROM public.profiles WHERE user_id='93000000-0000-4000-8000-000000000003';
INSERT INTO public.team_members(team_id,profile_id,role) SELECT '93000000-0000-4000-8000-000000000010',id,CASE WHEN user_id='93000000-0000-4000-8000-000000000001' THEN 'admin'::public.team_role ELSE 'viewer'::public.team_role END FROM public.profiles WHERE user_id IN ('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002') ON CONFLICT(team_id,profile_id) DO NOTHING;
INSERT INTO public.team_members(team_id,profile_id,role) SELECT '93000000-0000-4000-8000-000000000020',id,'admin' FROM public.profiles WHERE user_id='93000000-0000-4000-8000-000000000003' ON CONFLICT DO NOTHING;
INSERT INTO public.repertorios(id,team_id,name) VALUES
 ('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000010','QA primary repertory'),
 ('93000000-0000-4000-8000-000000000021','93000000-0000-4000-8000-000000000020','QA private repertory');
INSERT INTO public.songs(id,team_id,title,artist,key_original,key_current,theme,cifra_text,audio_path,tags)
 SELECT ('93000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'93000000-0000-4000-8000-000000000010','Canção QA'||lpad(n::text,2,'0'),'Ministério Ágape','C','G','Adoração','C G Am F','qa/'||n||'.mp3',ARRAY['abertura'] FROM generate_series(1,31) n;
INSERT INTO public.songs(id,team_id,title,artist,key_original,key_current,theme,cifra_text,audio_path,is_draft)
 SELECT ('93000000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'93000000-0000-4000-8000-000000000010',CASE WHEN n=1 THEN E' \n\t' ELSE 'Incomplete QA'||n END,CASE WHEN n=2 THEN '' ELSE 'QA artist' END,CASE WHEN n=3 THEN NULL ELSE 'C' END,NULL,CASE WHEN n=4 THEN ' ' ELSE 'Theme' END,CASE WHEN n=5 THEN E'\n\t' ELSE 'C G' END,CASE WHEN n=6 THEN NULL ELSE 'qa/audio.mp3' END,n=7 FROM generate_series(1,7) n;
INSERT INTO public.songs(id,team_id,title,artist,key_original,key_current,theme,cifra_text,audio_path)
 VALUES('93000000-0000-4000-8000-000000000301','93000000-0000-4000-8000-000000000020','Private QA','Private artist','C','C','Other','C G','qa/other.mp3');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE r jsonb; n integer; BEGIN
 r:=public.search_song_catalog('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000011');
 ASSERT (r->>'total')::int=31,'Exclude all six missing fields and drafts';
 ASSERT jsonb_array_length(r->'songs')=12,'Page bounded to 12';
 ASSERT r#>>'{songs,0,title}'='Canção QA01','Stable page sort';
 ASSERT NOT (r#>'{songs,0}') ? 'cifra_text','List metadata only';
 r:=public.search_song_catalog('93000000-0000-4000-8000-000000000010',p_page=>3);
 ASSERT jsonb_array_length(r->'songs')=7 AND r#>>'{songs,0,title}'='Canção QA25','Server pagination';
 r:=public.search_song_catalog('93000000-0000-4000-8000-000000000010',p_query=>'cancao agap abert');
 ASSERT (r->>'total')::int=31,'Accent insensitive prefix title artist tags search';
 r:=public.search_song_catalog('93000000-0000-4000-8000-000000000010',p_theme=>'Adoração',p_key=>'G',p_artist=>'Ministério Ágape',p_page_size=>6);
 ASSERT (r->>'total')::int=31 AND jsonb_array_length(r->'songs')=6,'Combined exact filters and 6 page size';
 r:=public.search_song_catalog('93000000-0000-4000-8000-000000000010',p_key=>'F');ASSERT (r->>'total')::int=0,'Empty filters';
 ASSERT (SELECT count(*) FROM public.song_catalog_facets('93000000-0000-4000-8000-000000000010','artist','agape'))=1,'Searchable facets';
 ASSERT (SELECT count(*) FROM public.song_catalog_facets('93000000-0000-4000-8000-000000000010','artist','%'))=0,'Literal facet wildcard';
 n:=public.add_complete_songs_to_repertorio('93000000-0000-4000-8000-000000000011',ARRAY['93000000-0000-4000-8000-000000000101','93000000-0000-4000-8000-000000000102','93000000-0000-4000-8000-000000000101']::uuid[]);
 ASSERT n=2,'Deduplicated atomic batch';
 n:=public.add_complete_songs_to_repertorio('93000000-0000-4000-8000-000000000011',ARRAY['93000000-0000-4000-8000-000000000101']::uuid[]);ASSERT n=0,'Idempotent duplicate addition';
 r:=public.search_song_catalog('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000011',p_selected_ids=>ARRAY['93000000-0000-4000-8000-000000000101']::uuid[]);
 ASSERT (r->>'total')::int=1 AND (r#>>'{songs,0,already_added}')::boolean,'Selected ID filter and already-added flag';
 BEGIN PERFORM public.add_complete_songs_to_repertorio('93000000-0000-4000-8000-000000000011',ARRAY['93000000-0000-4000-8000-000000000103','93000000-0000-4000-8000-000000000201']::uuid[]);RAISE EXCEPTION 'Expected incomplete rejection';EXCEPTION WHEN check_violation THEN NULL;END;
 ASSERT NOT EXISTS(SELECT 1 FROM public.repertorio_songs WHERE song_id='93000000-0000-4000-8000-000000000103'),'No partial batch';
 BEGIN PERFORM public.search_song_catalog('93000000-0000-4000-8000-000000000020');RAISE EXCEPTION 'Expected team isolation';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.add_complete_songs_to_repertorio('93000000-0000-4000-8000-000000000011',ARRAY['93000000-0000-4000-8000-000000000301']::uuid[]);RAISE EXCEPTION 'Expected cross-team rejection';EXCEPTION WHEN check_violation THEN NULL;END;
 UPDATE public.songs SET title='Prepared draft QA',artist='QA artist',theme='Adoração',key_original='G',key_current='G',media_url='https://youtu.be/abcdefghijk',recording_source_url='https://youtu.be/abcdefghijk' WHERE id='93000000-0000-4000-8000-000000000207';
 BEGIN PERFORM public.publish_song_registration('93000000-0000-4000-8000-000000000207',ARRAY['93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000021']::uuid[]);RAISE EXCEPTION 'Expected foreign repertory rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 ASSERT (SELECT is_draft FROM public.songs WHERE id='93000000-0000-4000-8000-000000000207'),'Atomic failed publication retains draft';
 ASSERT NOT EXISTS(SELECT 1 FROM public.repertorio_songs WHERE song_id='93000000-0000-4000-8000-000000000207'),'Atomic failed publication no links';
 UPDATE public.songs SET media_url='https://youtu.be/ZYXWVUTSRQP' WHERE id='93000000-0000-4000-8000-000000000207';
 BEGIN PERFORM public.publish_song_registration('93000000-0000-4000-8000-000000000207');RAISE EXCEPTION 'Expected stale audio rejection';EXCEPTION WHEN check_violation THEN NULL;END;
 UPDATE public.songs SET media_url=recording_source_url WHERE id='93000000-0000-4000-8000-000000000207';
 PERFORM public.publish_song_registration('93000000-0000-4000-8000-000000000207',ARRAY['93000000-0000-4000-8000-000000000011']::uuid[]);
 ASSERT NOT (SELECT is_draft FROM public.songs WHERE id='93000000-0000-4000-8000-000000000207'),'Successful publication';
 ASSERT EXISTS(SELECT 1 FROM public.repertorio_songs WHERE song_id='93000000-0000-4000-8000-000000000207'),'Link only after completion';
 UPDATE public.songs SET media_url='https://youtu.be/ZYXWVUTSRQP',recording_source_url='https://youtu.be/abcdefghijk' WHERE id='93000000-0000-4000-8000-000000000101';
 r:=public.search_song_catalog('93000000-0000-4000-8000-000000000010',p_selected_ids=>ARRAY['93000000-0000-4000-8000-000000000101']::uuid[]);
 ASSERT (r->>'total')::int=0,'Exclude stale recording versions from the catalog';
 BEGIN PERFORM public.add_complete_songs_to_repertorio('93000000-0000-4000-8000-000000000011',ARRAY['93000000-0000-4000-8000-000000000101']::uuid[]);RAISE EXCEPTION 'Expected stale batch rejection';EXCEPTION WHEN check_violation THEN NULL;END;
 UPDATE public.songs SET media_url=recording_source_url,stems_status='processing' WHERE id='93000000-0000-4000-8000-000000000101';
 BEGIN PERFORM public.publish_song_registration('93000000-0000-4000-8000-000000000101');RAISE EXCEPTION 'Expected processing rejection';EXCEPTION WHEN check_violation THEN NULL;END;
 UPDATE public.songs SET stems_status='idle' WHERE id='93000000-0000-4000-8000-000000000101';
 INSERT INTO public.song_tracks(song_id,track_name,audio_path) VALUES('93000000-0000-4000-8000-000000000101','Vocals','qa/vocals.mp3');
 UPDATE public.songs SET stems_status='done' WHERE id='93000000-0000-4000-8000-000000000101';
 UPDATE public.songs SET audio_revision=gen_random_uuid() WHERE id='93000000-0000-4000-8000-000000000101';
 ASSERT NOT EXISTS(SELECT 1 FROM public.song_tracks WHERE song_id='93000000-0000-4000-8000-000000000101'),'Same-path audio replacement invalidates stems';
 ASSERT (SELECT stems_status FROM public.songs WHERE id='93000000-0000-4000-8000-000000000101')='idle','Separation resets on replacement';
 RAISE NOTICE 'CATALOG QA: core catalog assertions passed';
END $$;
SELECT set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 ASSERT (public.search_song_catalog('93000000-0000-4000-8000-000000000010')->>'total')::int=32,'Viewer can search';
 BEGIN PERFORM public.add_complete_songs_to_repertorio('93000000-0000-4000-8000-000000000011',ARRAY['93000000-0000-4000-8000-000000000103']::uuid[]);RAISE EXCEPTION 'Expected viewer write rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.publish_song_registration('93000000-0000-4000-8000-000000000207');RAISE EXCEPTION 'Expected viewer publish rejection';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RAISE NOTICE 'CATALOG QA: viewer permissions passed';
END $$;
RESET ROLE;
UPDATE public.team_members SET permissions='{"musicas":{"ver":false}}' WHERE profile_id=(SELECT id FROM public.profiles WHERE user_id='93000000-0000-4000-8000-000000000002') AND team_id='93000000-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.search_song_catalog('93000000-0000-4000-8000-000000000010');RAISE EXCEPTION 'Expected granular permission denial';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RAISE NOTICE 'CATALOG QA: granular permissions passed';
END $$;
RESET ROLE;
ROLLBACK;
