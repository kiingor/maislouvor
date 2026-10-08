// Prévia isolada: componentes reais, dados fictícios, sem gravações no servidor.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Capacitor} from '@capacitor/core';
import {AppLayout} from '../../src/components/AppLayout';
import Repertorios from '../../src/pages/Repertorios';
import RepertorioDetail from '../../src/pages/RepertorioDetail';
import SongEditor from '../../src/pages/SongEditor';
import Login from '../../src/pages/Login';
import {TeamDataConsentGate} from '../../src/components/legal/TeamDataConsentGate';
import {TooltipProvider} from '../../src/components/ui/tooltip';
import {supabase} from '../../src/integrations/supabase/client';
import {ORIGINAL_SONGS} from '../../scripts/review-demo/data.mjs';
import '../../src/index.css';
Capacitor.isNativePlatform=()=>true;
Capacitor.getPlatform=()=> 'ios';
const params=new URLSearchParams(location.search);
const songs=ORIGINAL_SONGS.map((s:any,i:number)=>({id:`song-${i}`,team_id:'team-demo',title:s.title,artist:'Equipe Demonstração',theme:s.theme,key_original:s.keyOriginal,key_current:s.keyOriginal,lyrics_text:s.cifra,cifra_text:s.cifra,tags:s.tags,bpm:s.bpm,registration_status:'published',is_draft:false,audio_path:'mix.m4a',stems_status:'done',duration_seconds:180,created_at:'2026-10-08T12:00:00Z',updated_at:'2026-10-08T12:00:00Z'}));
const rep={id:'rep-demo',team_id:'team-demo',name:'Culto de celebração',created_at:'2026-10-08T12:00:00Z',updated_at:'2026-10-08T12:00:00Z',is_public:false};
const tracks=['Voz','Baixo','Bateria','Guitarra','Teclado'].map((track_name,i)=>({id:`track-${i}`,song_id:songs[0].id,track_name,audio_path:['vocals','bass','drums','guitar','keys'][i]+'.m4a',sort_order:i}));
(supabase as any).from=(table:string)=>{
 let one=false,filters:any={},columns='';
 const q:any=new Proxy({}, {get(_t,name){
  if(name==='then') return(resolve:any)=>{
   let data:any=[];
   if(table==='songs') data=filters.id?[songs.find((s:any)=>s.id===filters.id)||songs[0]]:songs;
   if(table==='repertorios')data=[rep];
   if(table==='repertorio_songs')data=songs.map((song:any,i:number)=>({id:`link-${i}`,repertorio_id:rep.id,song_id:song.id,songs:song,sort_order:i}));
   if(table==='song_tracks')data=tracks;
   if(table==='profiles')data=[{id:'profile-demo',full_name:'Líder Demonstração',terms_version:'2026-10-07',privacy_version:'2026-10-08',terms_accepted_at:'2026-10-08'}];
   if(one)data=data[0]||null;
   return Promise.resolve({data,error:null,count:Array.isArray(data)?data.length:1}).then(resolve);
  };
  return(...args:any[])=>{if(name==='select')columns=args[0];if(name==='eq')filters[args[0]]=args[1];if(name==='single'||name==='maybeSingle')one=true;if(['insert','update','delete','upsert'].includes(String(name)))throw new Error('Prévia somente leitura');return q;};
 }});return q;
};
(supabase as any).rpc=async(name:string)=>({data:name==='can_edit_song_audio'?true:name==='my_team_data_consent'?{allowed:false,version:'2026-10-08',accepted_at:null}:[],error:null});
(supabase.storage as any).from=()=>({createSignedUrl:async(path:string)=>({data:{signedUrl:location.origin+'/scripts/review-demo/assets/baby-bird/'+path.split('/').pop()},error:null})});
const channel:any={on:()=>channel,subscribe:()=>channel};(supabase as any).channel=()=>channel;(supabase as any).removeChannel=()=>{};
(supabase.auth as any).getSession=async()=>({data:{session:null},error:null});
(supabase.auth as any).onAuthStateChange=()=>({data:{subscription:{unsubscribe:()=>{}}}});
Object.defineProperty(supabase,'functions',{value:{invoke:async()=>({data:{},error:null})}});
const route=params.get('screen')==='song'?'/app/songs/song-0':params.get('screen')==='detail'?'/app/repertorios/rep-demo':'/app/repertorios';
const qc=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={qc}><TooltipProvider><MemoryRouter initialEntries={[route]}><Routes>{params.get('screen')==='login'?<Route path="*" element={<Login/>}/>:params.get('screen')==='privacy'?<Route path="*" element={<TeamDataConsentGate userId="demo">Autorizado</TeamDataConsentGate>}/>:<Route path="/app" element={<AppLayout/>}><Route path="repertorios" element={<Repertorios/>}/><Route path="repertorios/:id" element={<RepertorioDetail/>}/><Route path="songs/:id" element={<SongEditor songId="song-0"/>}/></Route>}</Routes></MemoryRouter></TooltipProvider></QueryClientProvider>);
