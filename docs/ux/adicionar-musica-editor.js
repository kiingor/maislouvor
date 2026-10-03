// Interações da revisão do cadastro. Somente dados locais; nenhum serviço é chamado.
// Importação, separação e detecção demonstram estados de UX com uma gravação original.
const STEM_NAMES = ['Vocais','Bateria','Baixo','Guitarra','Teclado','Outros'];
const NOTE_VALUES = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const SHARP_NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_NOTES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const preparationTimers = new Set();
let prepareTab='recording', contentTab='cifra', previewStopTimer, extraPlayer=null, toolActions=[];
let toolPreviewUrl=null;
const KEY_NOTE_NAMES={C:'Dó','C#':'Dó sustenido',Db:'Ré bemol',D:'Ré','D#':'Ré sustenido',Eb:'Mi bemol',E:'Mi',F:'Fá','F#':'Fá sustenido',Gb:'Sol bemol',G:'Sol','G#':'Sol sustenido',Ab:'Lá bemol',A:'Lá','A#':'Lá sustenido',Bb:'Si bemol',B:'Si'};
const KEY_PICKER_FIELDS=['song-key','song-team-key','track-original-key'];
const KEY_PICKER_CHOICES=Object.keys(KEY_NOTE_NAMES).flatMap(root=>[{value:root,name:KEY_NOTE_NAMES[root]+' maior'},{value:root+'m',name:KEY_NOTE_NAMES[root]+' menor'}]);
let keyPickerField=null,keyPickerResults=[],keyPickerIndex=0;

function keyChoice(value) {return KEY_PICKER_CHOICES.find(choice=>choice.value===value);}
function setKeySelect(id,value) {
  const select=$(id),key=value||'';
  if(![...select.options].some(option=>option.value===key)){const option=document.createElement('option');option.value=option.textContent=key;select.appendChild(option);}
  select.value=key;
}
function keyPickerOptions(field,query='') {
  const text=normalize(query).replace(/♯/g,'#').replace(/♭/g,'b');
  const entries=field==='song-team-key'?[{value:'',name:'Igual ao tom original'},...KEY_PICKER_CHOICES]:KEY_PICKER_CHOICES;
  const matches=entries.filter(choice=>{
    if(!text)return true;
    if(/^[a-g](?:#|b)?m?$/.test(text))return choice.value.toLowerCase().startsWith(text);
    return text.split(/\s+/).every(word=>normalize(choice.value+' '+choice.name).includes(word));
  });
  if(text){
    const rank=choice=>normalize(choice.value)===text||normalize(choice.name)===text?0:1;
    matches.sort((a,b)=>rank(a)-rank(b)||a.name.split(' ').length-b.name.split(' ').length);
  }
  return matches;
}
function renderKeyControls() {
  for(const id of KEY_PICKER_FIELDS){
    const trigger=$(id+'-trigger');if(!trigger)continue;
    const value=$(id).value,choice=keyChoice(value);
    trigger.querySelector('.key-value').textContent=choice?choice.value+' · '+choice.name:id==='song-team-key'?'Igual ao original':'Selecione o tom';
    trigger.classList.toggle('placeholder',!value&&id!=='song-team-key');
    trigger.setAttribute('aria-invalid',$(id).getAttribute('aria-invalid')||'false');
  }
}
function initializeKeyPickers() {
  for(const id of KEY_PICKER_FIELDS){
    const select=$(id),trigger=document.createElement('button');
    trigger.id=id+'-trigger';trigger.type='button';trigger.className='form-control key-picker-trigger';
    trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','key-picker-popover');
    trigger.innerHTML='<span class="key-value" id="'+id+'-value"></span>'+icon('down');
    const label=document.querySelector('label[for="'+id+'"]');
    if(label){label.id=id+'-label';label.htmlFor=trigger.id;trigger.setAttribute('aria-labelledby',label.id+' '+id+'-value');}
    if(select.getAttribute('aria-describedby'))trigger.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
    if(select.required)trigger.setAttribute('aria-required','true');
    select.before(trigger);select.hidden=true;select.tabIndex=-1;
    trigger.addEventListener('click',()=>keyPickerField===id?closeKeyPicker():openKeyPicker(id));
    trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openKeyPicker(id);}});
  }
  const popover=document.createElement('div');
  popover.id='key-picker-popover';popover.className='key-picker-popover';popover.setAttribute('popover','manual');popover.setAttribute('role','dialog');popover.setAttribute('aria-labelledby','key-picker-title');
  popover.innerHTML='<h3 id="key-picker-title">Escolher tom</h3><label class="key-picker-search">'+icon('search')+'<input id="key-picker-search" type="search" role="combobox" aria-label="Buscar tom" aria-autocomplete="list" aria-expanded="true" aria-controls="key-picker-options" placeholder="Buscar tom: G, Sol, menor…" autocomplete="off" spellcheck="false"></label><div id="key-picker-options" class="key-picker-options" role="listbox" aria-label="Tons disponíveis"></div><p id="key-picker-status" class="key-picker-status" role="status" aria-live="polite"></p>';
  $('song-dialog').appendChild(popover);
  $('key-picker-search').addEventListener('input',()=>renderKeyPicker(true));
  $('key-picker-search').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeKeyPicker();return;}
    if(event.key==='Tab'){closeKeyPicker();return;}
    if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(keyPickerResults[keyPickerIndex])commitKeyChoice(keyPickerResults[keyPickerIndex].value);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      if(!keyPickerResults.length)return;
      keyPickerIndex=event.key==='Home'?0:event.key==='End'?keyPickerResults.length-1:(keyPickerIndex+(event.key==='ArrowDown'?1:keyPickerResults.length-1))%keyPickerResults.length;
      highlightKeyOption(true);
    }
  });
  $('key-picker-options').addEventListener('click',event=>{const option=event.target.closest('[data-key-value]');if(option)commitKeyChoice(option.dataset.keyValue);});
  document.addEventListener('pointerdown',event=>{if(keyPickerField&&!popover.contains(event.target)&&!$(keyPickerField+'-trigger').contains(event.target))closeKeyPicker(false);});
  $('song-dialog').addEventListener('cancel',event=>{if(keyPickerField){event.preventDefault();closeKeyPicker();}});
  window.addEventListener('resize',()=>closeKeyPicker(false));
}
function renderKeyPicker(reset=false) {
  if(!keyPickerField)return;
  keyPickerResults=keyPickerOptions(keyPickerField,$('key-picker-search').value);
  const selectedIndex=keyPickerResults.findIndex(choice=>choice.value===$(keyPickerField).value);
  if(reset)keyPickerIndex=0;else keyPickerIndex=Math.max(0,selectedIndex);
  $('key-picker-options').innerHTML=keyPickerResults.length?keyPickerResults.map((choice,index)=>'<div id="key-option-'+index+'" class="key-picker-option" role="option" aria-selected="'+(choice.value===$(keyPickerField).value)+'" data-key-value="'+esc(choice.value)+'"><span class="key-option-symbol">'+esc(choice.value||'—')+'</span><span class="key-option-name">'+esc(choice.name)+'</span>'+(choice.value===$(keyPickerField).value?icon('check'):'')+'</div>').join(''):'<p class="key-picker-empty">Nenhum tom encontrado. Tente a cifra ou o nome, como G ou Sol.</p>';
  $('key-picker-status').textContent=keyPickerResults.length+' '+(keyPickerResults.length===1?'tom encontrado':'tons encontrados');
  highlightKeyOption(reset);
}
function highlightKeyOption(scroll) {
  for(const [index,option]of [...$('key-picker-options').querySelectorAll('[role=option]')].entries())option.classList.toggle('active',index===keyPickerIndex);
  const active=$('key-option-'+keyPickerIndex);
  if(active){
    $('key-picker-search').setAttribute('aria-activedescendant',active.id);
    if(scroll){
      const list=$('key-picker-options'),rect=active.getBoundingClientRect(),bounds=list.getBoundingClientRect();
      if(rect.top<bounds.top)list.scrollTop-=bounds.top-rect.top;
      else if(rect.bottom>bounds.bottom)list.scrollTop+=rect.bottom-bounds.bottom;
    }
  }
  else $('key-picker-search').removeAttribute('aria-activedescendant');
}
function openKeyPicker(id) {
  closeKeyPicker(false);keyPickerField=id;
  const trigger=$(id+'-trigger'),popover=$('key-picker-popover'),rect=trigger.getBoundingClientRect();
  $('key-picker-title').textContent='Escolher '+(id==='song-key'?'tom original':id==='song-team-key'?'tom da equipe':'tom das faixas');
  $('key-picker-search').value='';trigger.setAttribute('aria-expanded','true');renderKeyPicker();
  const width=Math.min(Math.max(rect.width,285),window.innerWidth-24),below=window.innerHeight-rect.bottom-12,above=rect.top-12,up=below<270&&above>below;
  const height=Math.min(360,up?above:below);
  popover.style.width=width+'px';popover.style.maxHeight=height+'px';
  $('key-picker-options').style.maxHeight=Math.max(88,height-130)+'px';
  popover.showPopover();
  const popupHeight=popover.getBoundingClientRect().height;
  popover.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';
  popover.style.top=(up?Math.max(12,rect.top-popupHeight-7):rect.bottom+7)+'px';
  highlightKeyOption(true);
  $('key-picker-search').focus({preventScroll:true});
}
function closeKeyPicker(returnFocus=true) {
  if(!keyPickerField)return;
  const trigger=$(keyPickerField+'-trigger');$('key-picker-popover').hidePopover();trigger.setAttribute('aria-expanded','false');keyPickerField=null;
  if(returnFocus)trigger.focus({preventScroll:true});
}
function commitKeyChoice(value) {
  if(!keyPickerField)return;
  const id=keyPickerField,select=$(id);
  setKeySelect(id,value);closeKeyPicker(false);
  select.dispatchEvent(new Event('change',{bubbles:true}));renderKeyControls();$(id+'-trigger').focus({preventScroll:true});
}

function cloneRegistration(value) {
  return {...value,tracks:(value.tracks||[]).map(t=>({...t})),additional:(value.additional||[]).map(a=>({...a})),loops:(value.loops||[]).map(l=>({...l})),repertoires:[...(value.repertoires||[])]};
}
function later(callback,ms) {
  const timer=setTimeout(()=>{preparationTimers.delete(timer);callback();},ms);
  preparationTimers.add(timer);
}
function cancelPreparation() {
  for(const timer of preparationTimers)clearTimeout(timer);
  preparationTimers.clear();
  if(form.importStatus==='processing')form.importStatus='idle';
  if(form.separationStatus==='processing')form.separationStatus='idle';
  for(const item of form.additional||[])if(item.status==='processing')item.status='pending';
  stopPreviewPlayback();
}
function stopPreviewPlayback() {
  clearInterval(previewStopTimer); $('audio-player').pause();
  if(extraPlayer){extraPlayer.pause();extraPlayer=null;}
}
function validURL(value) {
  try { const url=new URL(String(value).trim());return ['https:','http:'].includes(url.protocol)?url:null; } catch{return null;}
}
function youtubeId(value) {
  const url=validURL(value);if(!url)return null;
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  let id=null;
  if(host==='youtu.be')id=url.pathname.split('/')[1];
  else if(['youtube.com','m.youtube.com','music.youtube.com'].includes(host))id=url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
  return /^[\w-]{11}$/.test(id||'')?id:null;
}
function tagValues() {return String(form.tags||'').split(',').map(t=>t.trim()).filter(Boolean);}
function commitTags(value=$('song-tags').value) {
  const values=tagValues(), seen=new Set(values.map(normalize));
  for(const tag of String(value).split(',')){const clean=tag.trim();if(clean&&!seen.has(normalize(clean))){values.push(clean);seen.add(normalize(clean));}}
  form.tags=values.join(', ');$('song-tags').value='';renderTags();renderEditor();
}
function renderTags() {
  $('tag-list').innerHTML=tagValues().map((tag,i)=>'<span class="tag-chip">'+esc(tag)+'<button type="button" data-remove-tag="'+i+'" aria-label="Remover tag '+esc(tag)+'">'+icon('x')+'</button></span>').join('');
  for(const button of $('tag-suggestions').querySelectorAll('[data-add-tag]'))button.hidden=tagValues().some(tag=>normalize(tag)===normalize(button.dataset.addTag));
}
function durationSeconds(value) {
  const text=String(value||'').trim();if(!text)return null;
  if(/^\d+(?:\.\d+)?$/.test(text))return Number(text)>0?Number(text):NaN;
  const match=text.match(/^(\d+):([0-5]\d)$/);return match&&Number(match[1])*60+Number(match[2])>0?Number(match[1])*60+Number(match[2]):NaN;
}
function timeLabel(seconds) {const n=Math.max(0,Math.floor(seconds||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
function audioDuration() {
  const duration=$('audio-player').duration;
  return Number.isFinite(duration)&&duration>0?duration:durationSeconds(form.duration)||4;
}
function recordingChanged() {return Boolean(form.audio&&form.sourceKind==='youtube'&&form.sourceUrl!==form.link.trim());}
function registrationReady() {
  return complete(form)&&!recordingChanged()&&form.importStatus!=='processing'&&form.separationStatus!=='processing'&&form.additional.every(a=>a.status==='ready');
}
function setPrepareTab(name,focus=false) {
  closeKeyPicker(false);
  prepareTab=name;
  for(const tab of document.querySelectorAll('[data-prepare]')){
    const active=tab.dataset.prepare===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    $('panel-'+tab.dataset.prepare).hidden=!active;
  }
  if(focus)$('tab-'+name).focus({preventScroll:true});
  stopPreviewPlayback();
}
function setContentTab(name,focus=false) {
  contentTab=name;
  for(const value of ['cifra','lyrics']){const active=name===value;$('tab-'+value).setAttribute('aria-selected',String(active));$('tab-'+value).tabIndex=active?0:-1;$('panel-'+value).hidden=!active;}
  if(focus)$('tab-'+name).focus({preventScroll:true});
}
function syncForm() {
  for(const [field,id]of Object.entries(fieldIds)){if(KEY_PICKER_FIELDS.includes(id))setKeySelect(id,form[field]);else $(id).value=form[field]??'';}
  for(const [field]of requirements)setError(field,'');
  for(const field of ['link','cover','bpm','duration'])setError(field,'');
  $('song-tags').value='';
  $('cover-preview').hidden=!form.coverUrl;$('remove-cover').hidden=!form.coverUrl;
  if(form.coverUrl)$('cover-preview').src=form.coverUrl;else $('cover-preview').removeAttribute('src');
  $('audio-player').hidden=!form.audioUrl;
  if(form.audioUrl){if($('audio-player').getAttribute('src')!==form.audioUrl)$('audio-player').src=form.audioUrl;}
  else{$('audio-player').pause();$('audio-player').removeAttribute('src');}
  $('audio-file').value='';$('cover-file').value='';$('track-files').value='';
  $('trim-start').value=form.trimStart||0;$('trim-end').value=form.trimEnd??'';
  $('loop-end').value=form.trimEnd??durationSeconds(form.duration)??'';
  renderTags();setPrepareTab(prepareTab);setContentTab(contentTab);renderPreparation();renderKeyControls();
}
function renderEditor() {
  for(const panel of document.querySelectorAll('[data-panel]'))panel.hidden=Number(panel.dataset.panel)!==step;
  for(const button of document.querySelectorAll('[data-step]')){
    const n=Number(button.dataset.step);button.disabled=n>maxStep;
    if(n===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    button.querySelector('.step-number').innerHTML=n<step?icon('check'):String(n);
  }
  const statuses=checklistStatus();if(recordingChanged())statuses.find(s=>s.field==='audio').done=false;
  const count=statuses.filter(s=>s.done).length;
  $('progress-caption').textContent=count+' de 6 informações preenchidas';
  $('progress-fill').style.width=count/6*100+'%';$('form-progress').setAttribute('aria-valuenow',String(count));
  $('form-checklist').innerHTML=statuses.map(s=>'<li class="'+(s.done?'done':'')+'"><span class="check" aria-hidden="true">'+(s.done?icon('check'):'')+'</span>'+esc(s.field==='audio'?'Gravação preparada':s.label)+'<span class="sr-only">: '+(s.done?'preenchido':'pendente')+'</span></li>').join('');
  const destinations=form.repertoires||[];
  $('editor-next').innerHTML=step===3?(destinations.length?'Cadastrar e adicionar':'Cadastrar na biblioteca'):'Continuar'+icon('right');
  $('editor-next').disabled=step===3&&!registrationReady();$('editor-back').textContent=step===1?'Cancelar':'Voltar';
  if(step===1){
    const match=songs.filter(complete).find(s=>normalize(s.title)===normalize(form.title)&&(!form.artist.trim()||normalize(s.artist)===normalize(form.artist)));
    $('duplicate-note').hidden=!match;
    if(match)$('duplicate-note').innerHTML='<strong>Esta música já está cadastrada.</strong><br>'+esc(match.title)+' · '+esc(match.artist)+' · tom '+esc(match.key)+'<br><button type="button" class="button quiet" data-existing="'+esc(match.id)+'">Conferir a versão antes de continuar '+icon('right')+'</button>';
  }
  renderTags();renderPreparation();renderKeyControls();
  if(step===3){
    $('review-key').innerHTML=esc(form.key)+'<small>original</small>';
    $('review-title').textContent=form.title.trim()||'Sem nome';$('review-artist').textContent=form.artist.trim()||'Artista pendente';
    $('review-theme').textContent=form.theme||'Pendente';$('review-team-key').textContent=form.teamKey||form.key+' · original';
    $('review-tempo').textContent=(form.bpm?form.bpm+' BPM':'BPM não informado')+' · '+(form.duration||'duração não informada');
    $('review-cover').textContent=form.coverUrl?'Imagem adicionada':'Sem capa';
    $('review-link').textContent=form.link||'Não informado · arquivo enviado';
    $('review-audio').textContent=form.audio?.name||'Pendente';
    $('review-tracks').textContent=form.tracks.length?form.tracks.length+' faixas preparadas':form.separationStatus==='processing'?'Separação em andamento':'Ainda não separadas';
    $('review-cifra').textContent=(form.cifra.trim()?form.cifra.trim().split('\n').length+' linhas de cifra':'Cifra pendente')+(form.lyrics.trim()?' · letra adicionada':' · sem letra separada');
    $('review-additional').textContent=form.additional.length?form.additional.length+(form.additional.length===1?' áudio':' áudios')+(form.additional.some(a=>a.status!=='ready')?' · importação pendente':''):'Nenhum';
    $('review-loops').textContent=form.loops.length?form.loops.length+(form.loops.length===1?' trecho':' trechos'):'Nenhum';
    $('review-tags').innerHTML=tagValues().map(t=>'<span class="tag-chip">'+esc(t)+'</span>').join('');
    $('review-ready').hidden=!registrationReady();
    $('review-ready').querySelector('strong').textContent=destinations.length?'Pronta para entrar no repertório':'Pronta para entrar na biblioteca';
    for(const input of $('repertoire-options').querySelectorAll('input'))input.checked=destinations.includes(input.value);
    $('discard-registration').textContent=form.id?'Excluir rascunho':'Descartar cadastro';
  }
  tellParent();
}
function renderPreparation() {
  const videoId=youtubeId(form.link), busy=form.importStatus==='processing', prepared=Boolean(form.audio), changed=recordingChanged();
  $('recording-preview').hidden=!videoId;
  $('recording-title').textContent=form.title||'Gravação selecionada';$('recording-source').textContent=(form.artist?form.artist+' · ':'')+'Vídeo '+(videoId||'');
  $('import-recording').disabled=busy||Boolean(prepared&&form.sourceKind==='youtube'&&!changed);
  $('import-recording').querySelector('span').textContent=busy?'Importando áudio…':prepared&&form.sourceKind==='youtube'&&!changed?'Áudio da gravação importado':changed?'Importar nova gravação':'Importar áudio da gravação';
  $('import-caption').textContent=prepared&&!changed?'Áudio pronto para cortar e separar em faixas.':'Depois, corte o trecho e separe as faixas.';
  $('import-progress').hidden=!busy;$('recording-changed').hidden=!changed;$('upload-audio').disabled=busy;
  $('audio-card').hidden=!prepared;
  if(prepared){$('audio-name').textContent=form.audio.name;$('audio-size').textContent=form.sourceKind==='youtube'?'Importado da gravação selecionada':((form.audio.size||0)/1024/1024).toFixed(1)+' MB · arquivo selecionado';}
  $('trim-tools').hidden=!prepared;$('separation-entry').hidden=!prepared;
  $('separate-audio').disabled=!prepared||changed||form.separationStatus==='processing';
  $('separate-audio').innerHTML=icon('tracks')+(form.tracks.length?'Separar novamente':'Separar em faixas');
  $('detect-bpm').disabled=!prepared;$('cifra-current-key').textContent=form.cifraKey||form.key||'—';
  $('apply-team-key').hidden=!form.teamKey||form.teamKey===(form.cifraKey||form.key);
  for(const [id,done,isBusy]of [['recording-status',prepared&&!changed,busy],['content-status',Boolean(form.cifra.trim()),false],['tracks-status',Boolean(form.tracks.length),form.separationStatus==='processing']])$(id).className='tab-dot'+(done?' done':'')+(isBusy?' busy':'');
  $('trim-applied').hidden=!form.trimApplied;
  if(form.trimApplied)$('trim-applied').textContent='Trecho escolhido: '+form.trimApplied.start.toFixed(1)+'s a '+form.trimApplied.end.toFixed(1)+'s. Será usado na separação.';
  renderAdditional();renderTracks();renderLoops();renderTrimWindow();
}
function validateStep(which) {
  commitPendingTag();
  const fields=which===1?['title','artist','key','theme']:['audio','cifra'];
  const messages={title:'Informe o nome da música.',artist:'Informe o artista ou ministério desta versão.',key:'Selecione o tom original.',theme:'Informe o tema principal.',cifra:'Cole a cifra completa para a equipe ensaiar.',audio:'Importe o áudio pelo link da gravação ou escolha um arquivo. Você também pode salvar um rascunho.'};
  let firstMissing=null;
  for(const field of fields){const missing=field==='audio'?!form.audio:!String(form[field]||'').trim();setError(field,missing?messages[field]:'');if(missing&&!firstMissing)firstMissing=field;}
  if(which>=2){
    if(form.link.trim()&&!validURL(form.link)){setError('link','Use um link completo, começando com https://.');firstMissing||='link';}
    if(recordingChanged()){setError('link','Importe o áudio do novo link para preparar esta versão.');firstMissing||='link';}
    if(form.importStatus==='processing'||form.separationStatus==='processing'){notify('Aguarde o processamento terminar ou salve como rascunho.');firstMissing||='link';}
    if(form.additional.some(a=>a.status!=='ready')){setError('audio','Conclua ou remova a importação do áudio adicional antes de cadastrar.');firstMissing||='audio';}
    const bpm=Number(form.bpm);
    if(form.bpm&&(!Number.isFinite(bpm)||bpm<40||bpm>240)){setError('bpm','Informe um BPM entre 40 e 240.');firstMissing||='bpm';}
    if(form.duration&&Number.isNaN(durationSeconds(form.duration))){setError('duration','Use minutos:segundos, como 04:30, ou o total em segundos.');firstMissing||='duration';}
  }
  if(firstMissing){
    step=which===1?1:2;maxStep=Math.max(maxStep,step);renderEditor();
    if(which>=2){setPrepareTab(firstMissing==='cifra'?'content':'recording');if(firstMissing==='cifra')setContentTab('cifra');}
    const target=firstMissing==='audio'?$('import-recording'):$(fieldIds[firstMissing]+'-trigger')||$(fieldIds[firstMissing]);target.focus();target.scrollIntoView({block:'nearest',behavior:'auto'});
  }
  return !firstMissing;
}
function commitPendingTag(){if($('song-tags').value.trim())commitTags();}
function changeStep(next) {
  closeKeyPicker(false);
  if(next>step){if(!validateStep(step))return;if(next===3&&!validateStep(2))return;}
  stopPreviewPlayback();step=next;maxStep=Math.max(maxStep,step);
  if(step===2)setPrepareTab('recording');
  renderEditor();$('sheet-scroll').scrollTop=0;
  (step===1?$('song-title'):step===2?$('song-link'):$('editor-next')).focus({preventScroll:true});
}
function removeRecording() {
  cancelPreparation();
  if(form.audioUrl?.startsWith('blob:')&&!currentMediaUsed(form.audioUrl))URL.revokeObjectURL(form.audioUrl);
  Object.assign(form,{audio:null,audioUrl:null,sourceKind:'',sourceUrl:'',importStatus:'idle',separationStatus:'idle',tracks:[],trimStart:0,trimEnd:null,trimApplied:null});
  syncForm();renderEditor();$('song-link').focus();
}
function acceptAudioFile(file) {
  if(!file)return false;
  const valid=file.type.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name);
  if(!valid||!file.size||file.size>50*1024*1024){notify(!valid?'Escolha um arquivo de áudio.':!file.size?'Este arquivo está vazio.':'O áudio deve ter até 50 MB.');return false;}
  return true;
}
function selectAudio(file) {
  if(!acceptAudioFile(file))return;
  cancelPreparation();
  if(form.audioUrl?.startsWith('blob:')&&!currentMediaUsed(form.audioUrl))URL.revokeObjectURL(form.audioUrl);
  Object.assign(form,{audio:{name:file.name,size:file.size,type:file.type},audioUrl:URL.createObjectURL(file),sourceKind:'file',sourceUrl:'',importStatus:'ready',tracks:[],separationStatus:'idle',trimStart:0,trimEnd:null,trimApplied:null});
  syncForm();renderEditor();notify('Gravação adicionada. Você já pode preparar as faixas.');
}
function importRecording() {
  if(form.importStatus==='processing')return;
  if(!validURL(form.link)){setError('link','Cole o link completo da gravação do YouTube.');$('song-link').focus();return;}
  if(!youtubeId(form.link)){setError('link','Para importar o áudio, use um link de vídeo do YouTube. Para esta gravação, você também pode escolher um arquivo.');$('song-link').focus();return;}
  const active=form, url=form.link.trim();
  setError('link','');stopPreviewPlayback();form.importStatus='processing';renderEditor();
  later(()=>{
    if(form!==active||form.link.trim()!==url){if(form===active){form.importStatus='idle';renderEditor();}return;}
    if(form.audioUrl?.startsWith('blob:')&&!currentMediaUsed(form.audioUrl))URL.revokeObjectURL(form.audioUrl);
    const media=demoAudio();media.audio.name=(form.title||'gravacao').toLowerCase().replace(/\s+/g,'-')+'.wav';
    Object.assign(form,media,{sourceKind:'youtube',sourceUrl:url,importStatus:'ready',duration:'0:04',trimStart:0,trimEnd:4,trimApplied:null,tracks:[],separationStatus:'idle'});
    syncForm();renderEditor();notify('Áudio preparado. Confira o trecho e separe as faixas.');
  },1350);
}
function separateAudio() {
  if(!form.audio||recordingChanged()||form.separationStatus==='processing')return;
  const active=form;stopPreviewPlayback();form.separationStatus='processing';setPrepareTab('tracks');renderEditor();$('sheet-scroll').scrollTop=0;
  later(()=>{
    if(form!==active)return;
    form.tracks=STEM_NAMES.map((name,i)=>({id:'stem-'+i,name,volume:100,mute:false,solo:false,demo:true}));
    form.trackKey=form.trackKey||form.key;form.separationStatus='ready';renderEditor();notify('Seis faixas prontas para preparar o ensaio.');
  },1900);
}
function renderTracks() {
  const processing=form.separationStatus==='processing', ready=Boolean(form.tracks.length)&&!processing;
  $('tracks-empty').hidden=processing||ready;$('separation-progress').hidden=!processing;$('tracks-ready').hidden=!ready;
  if(!ready)return;
  const currentHTML=form.tracks.map(t=>'<div class="track-row '+(t.mute?'muted':'')+'" data-track-id="'+esc(t.id)+'"><span class="track-name">'+esc(t.name)+'</span><input type="range" min="0" max="100" value="'+t.volume+'" data-volume="'+esc(t.id)+'" aria-label="Volume de '+esc(t.name)+'"><span class="track-volume">'+t.volume+'%</span><button type="button" class="track-switch" data-mute="'+esc(t.id)+'" aria-label="Silenciar '+esc(t.name)+'" aria-pressed="'+t.mute+'">M</button><button type="button" class="track-switch" data-solo="'+esc(t.id)+'" aria-label="Isolar '+esc(t.name)+'" aria-pressed="'+t.solo+'">S</button></div>').join('');
  if($('track-list').dataset.render!==currentHTML){$('track-list').innerHTML=currentHTML;$('track-list').dataset.render=currentHTML;}
  $('track-original-key').innerHTML=$('song-key').innerHTML;setKeySelect('track-original-key',form.trackKey||form.key);
  $('track-pitch').textContent=(form.pitch>0?'+':'')+form.pitch+' semitons';
  const isolated=form.tracks.filter(t=>t.solo).map(t=>t.name),muted=form.tracks.filter(t=>t.mute).length;
  $('track-adjustment').textContent=isolated.length?'Isolando: '+isolated.join(', '):muted?muted+' instrumento(s) silenciado(s)':'Mistura original · nenhum instrumento isolado';
  const audible=form.tracks.filter(t=>!t.mute&&(!isolated.length||t.solo));
  $('audio-player').volume=audible.length?audible.reduce((n,t)=>n+t.volume/100,0)/form.tracks.length:0;renderKeyControls();
}
function renderAdditional() {
  $('additional-empty').hidden=Boolean(form.additional.length);
  $('additional-list').innerHTML=form.additional.map(a=>'<div class="additional-row"><button type="button" class="icon-button" data-play-additional="'+esc(a.id)+'" aria-label="Ouvir '+esc(a.name)+'" '+(a.status!=='ready'?'disabled':'')+'>'+icon('play')+'</button><div><strong>'+esc(a.name)+'</strong><small>'+(a.status==='processing'?'Importando gravação…':a.status==='pending'?'Importação pendente · retome pelo botão':a.source==='youtube'?'Importado do YouTube':'Arquivo adicionado')+'</small></div>'+(a.status==='pending'?'<button type="button" class="icon-button" data-retry-additional="'+esc(a.id)+'" aria-label="Retomar importação de '+esc(a.name)+'">'+icon('down')+'</button>':'')+'<button type="button" class="icon-button" data-rename-additional="'+esc(a.id)+'" aria-label="Renomear '+esc(a.name)+'">'+icon('file')+'</button><button type="button" class="icon-button" data-remove-additional="'+esc(a.id)+'" aria-label="Remover '+esc(a.name)+'">'+icon('x')+'</button></div>').join('');
}
function renderTrimWindow() {
  const total=audioDuration(),start=Number($('trim-start').value)||0,end=Number($('trim-end').value)||total;
  $('trim-window').style.left=Math.min(100,Math.max(0,start/total*100))+'%';
  $('trim-window').style.right=Math.min(100,Math.max(0,(total-end)/total*100))+'%';
}
function trimSelection() {
  const start=Number($('trim-start').value),end=Number($('trim-end').value),total=audioDuration();
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>total+.05){
    $('trim-error').textContent='Escolha um início menor que o fim, dentro dos '+total.toFixed(1)+' segundos da gravação.';$('trim-error').hidden=false;return null;
  }
  $('trim-error').hidden=true;return {start,end};
}
function playSegment(start,end,repeat=false) {
  const player=$('audio-player');if(!form.audioUrl)return;
  stopPreviewPlayback();player.currentTime=start;
  player.play().catch(()=>notify('Use o botão de reprodução da gravação para ouvir o trecho.'));
  previewStopTimer=setInterval(()=>{if(player.currentTime>=end-.03){if(repeat)player.currentTime=start;else stopPreviewPlayback();}},40);
}
function renderLoops() {
  $('loop-list').innerHTML=form.loops.map((loop,i)=>'<div class="loop-row"><span>'+esc(loop.name)+'<small>'+timeLabel(loop.start)+' a '+timeLabel(loop.end)+'</small></span><button type="button" class="icon-button" data-play-loop="'+i+'" aria-label="Repetir '+esc(loop.name)+'">'+icon('play')+'</button><button type="button" class="icon-button" data-remove-loop="'+i+'" aria-label="Remover trecho '+esc(loop.name)+'">'+icon('x')+'</button></div>').join('');
}
function chordToken(token) {return /^[A-G](?:#|b)?(?:(?:maj|min|m|M|sus|add|dim|aug|\d|[()+\-#b°ø])*)(?:\/[A-G](?:#|b)?)?$/.test(token);}
function chordLine(line) {const tokens=line.trim().split(/\s+/).filter(Boolean);return tokens.length>0&&tokens.filter(chordToken).length/tokens.length>=.6;}
function transposeToken(token,delta,flat=false) {
  if(!chordToken(token))return token;
  const notes=flat?FLAT_NOTES:SHARP_NOTES;
  return token.replace(/[A-G](?:#|b)?/g,root=>notes[((NOTE_VALUES[root]+delta)%12+12)%12]);
}
function transposeContent(delta,reset=false) {
  if(!form.cifra.trim()){setError('cifra','Cole a cifra antes de transpor.');return;}
  if(!form.cifraOriginal)form.cifraOriginal=form.cifra;
  form.cifraOffset=reset?0:form.cifraOffset+delta;
  const originalKey=form.key||form.cifraOriginal.split('\n').find(chordLine)?.trim().split(/\s+/)[0]||'C';
  form.cifra=form.cifraOriginal.split('\n').map(line=>chordLine(line)?line.replace(/\S+/g,token=>transposeToken(token,form.cifraOffset,originalKey.includes('b'))):line).join('\n');
  form.cifraKey=transposeToken(originalKey,form.cifraOffset,originalKey.includes('b'));
  form.teamKey=form.cifraKey===form.key?'':form.cifraKey;
  const select=$('song-team-key');if(form.teamKey&&![...select.options].some(option=>option.value===form.teamKey)){const option=document.createElement('option');option.value=option.textContent=form.teamKey;select.appendChild(option);}select.value=form.teamKey;
  $('song-cifra').value=form.cifra;renderEditor();
}
function openEditorTool(title,description,body,actions) {
  toolActions=actions;
  $('editor-tool-title').textContent=title;$('editor-tool-description').textContent=description;$('editor-tool-body').innerHTML=body;
  $('editor-tool-footer').innerHTML=actions.map((action,i)=>'<button type="button" class="button '+(action.primary?'primary':'secondary')+'" data-tool-action="'+i+'">'+esc(action.label)+'</button>').join('');
  $('editor-tool-dialog').showModal();
}
function closeEditorTool() {
  for(const audio of $('editor-tool-dialog').querySelectorAll('audio'))audio.pause();
  $('editor-tool-body').querySelector('iframe')?.remove();
  if(toolPreviewUrl){URL.revokeObjectURL(toolPreviewUrl);toolPreviewUrl=null;}
  $('editor-tool-dialog').close();
}
function openRecordingPreview() {
  const videoId=youtubeId(form.link);if(!videoId)return;
  if(/^MLdemo/.test(videoId)){
    const media=demoAudio();toolPreviewUrl=media.audioUrl;
    openEditorTool('Conferir gravação','Nossa canção · gravação original de exemplo · 4 segundos',(form.coverUrl?'<img class="demo-recording-poster" src="'+esc(form.coverUrl)+'" alt="Capa da gravação de exemplo">':'')+'<audio controls src="'+esc(toolPreviewUrl)+'" style="width:100%;margin-top:15px"></audio>',[{label:'Voltar ao cadastro',primary:true,run:closeEditorTool}]);
  }else{
    openEditorTool('Conferir gravação',form.title||'Versão selecionada','<iframe class="video-preview" title="Vídeo da gravação selecionada" src="https://www.youtube-nocookie.com/embed/'+esc(videoId)+'" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>',[{label:'Voltar ao cadastro',primary:true,run:closeEditorTool}]);
  }
}
function openMoises() {
  openEditorTool('Importar do Moises','Cole o texto completo da cifra ou dos acordes exportados.', '<div class="tool-form"><label class="field-label" for="moises-text">Texto exportado do Moises</label><textarea id="moises-text" class="form-control" placeholder="Cole aqui o texto completo…" spellcheck="false"></textarea><p class="field-help">Você pode incluir nome, artista e tom no início do texto. Um link sozinho não contém a cifra.</p><p id="moises-error" class="field-error" hidden></p></div>',[
    {label:'Cancelar',run:closeEditorTool},
    {label:'Importar conteúdo',primary:true,run:()=>{
      const text=$('moises-text').value.trim();
      if(text.length<20||/^https?:\/\/\S+$/.test(text)||!text.split('\n').some(chordLine)){$('moises-error').hidden=false;$('moises-error').textContent='Cole o conteúdo completo com os acordes, em vez de apenas um link.';return;}
      const info=label=>text.match(new RegExp('^'+label+':\\s*(.+)$','im'))?.[1]?.trim();
      form.title=info('(?:Título|Nome)')||form.title;form.artist=info('Artista')||form.artist;
      const key=info('Tom');if(key&&NOTE_VALUES[key.replace(/m$/,'')]!==undefined)form.key=key;
      form.cifra=text.split('\n').filter(line=>!/^(Título|Nome|Artista|Tom):/i.test(line)).join('\n').trim();
      form.cifraOriginal=form.cifra;form.cifraKey=form.key;form.cifraOffset=0;
      if(!form.lyrics)form.lyrics=form.cifra.split('\n').filter(line=>!chordLine(line)).join('\n');
      syncForm();renderEditor();closeEditorTool();setContentTab('cifra');notify('Cifra e letra importadas. Confira a formatação.');
    }}
  ]);
}
function openCifraPreview() {
  const content=form.cifra.split('\n').map(line=>'<span class="'+(chordLine(line)?'chord-line':/^\[.*\]$/.test(line.trim())?'section-line':'')+'">'+esc(line)+'</span>').join('\n');
  openEditorTool('Conferir cifra','Tom '+(form.cifraKey||form.key||'não informado')+' · acordes destacados para leitura','<pre class="cifra-preview">'+content+'</pre>',[{label:'Voltar ao cadastro',primary:true,run:closeEditorTool}]);
}
function finishAdditional(item) {
  item.status='processing';renderAdditional();const active=form;
  later(()=>{if(form!==active||!form.additional.includes(item))return;const demo=demoAudio();item.url=demo.audioUrl;item.status='ready';renderEditor();},1250);
}
function openAdditional() {
  openEditorTool('Adicionar áudio','Guarde uma versão ou um guia para a equipe.', '<div class="tool-form"><div class="field"><label class="field-label" for="extra-name">Nome do áudio</label><input id="extra-name" class="form-control" placeholder="Ex.: guia de voz"></div><div class="field"><label class="field-label" for="extra-link">Link do YouTube</label><input id="extra-link" class="form-control" type="url" placeholder="Cole o link da outra gravação…"></div><p class="field-help">Ou escolha um arquivo de áudio:</p><input id="extra-file" class="form-control" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" aria-label="Arquivo de áudio adicional"><p id="extra-error" class="field-error" hidden></p></div>',[
    {label:'Cancelar',run:closeEditorTool},
    {label:'Adicionar áudio',primary:true,run:()=>{
      const name=$('extra-name').value.trim(),url=$('extra-link').value.trim(),file=$('extra-file').files?.[0];
      if(!name||(!file&&!youtubeId(url))){$('extra-error').hidden=false;$('extra-error').textContent=!name?'Dê um nome para identificar este áudio.':'Escolha um arquivo ou cole um link de vídeo do YouTube.';return;}
      if(file&&!acceptAudioFile(file))return;
      const item={id:'extra-'+Date.now(),name,source:file?'file':'youtube',link:url,url:file?URL.createObjectURL(file):null,status:file?'ready':'processing'};
      form.additional.push(item);closeEditorTool();if(!file)finishAdditional(item);renderEditor();
    }}
  ]);
}
function fillExample() {
  if(view!=='editor')openView('editor',{fresh:true});
  if($('editor-tool-dialog').open)closeEditorTool();
  cancelPreparation();releaseCurrentMedia();
  const cover='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#303037"/><path d="M68 205V115l62-12v87m0-64 61-13v77m0-48 60-13v65" stroke="#d7d7df" stroke-width="5" fill="none"/><text x="160" y="263" fill="#f1f1f5" text-anchor="middle" font-family="sans-serif" font-size="22">Nossa canção</text></svg>';
  form={...blankForm(),id:form.id,title:'Nossa canção',artist:'Equipe MaisLouvor',key:'G',theme:'Gratidão',tags:'abertura, acústico',bpm:'72',link:'https://www.youtube.com/watch?v=MLdemo00001',coverUrl:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(cover),cifra:'[Introdução]\nG    D    Em    C\n\n[Verso]\nG               D\nJuntos seguimos, unidos na voz\nEm              C\nUma canção nasce dentro de nós\n\n[Refrão]\nG              D\nVamos cantar, vamos agradecer\nEm                 C\nCada novo dia nos convida a viver',lyrics:'[Verso]\nJuntos seguimos, unidos na voz\nUma canção nasce dentro de nós\n\n[Refrão]\nVamos cantar, vamos agradecer\nCada novo dia nos convida a viver'};
  form.cifraOriginal=form.cifra;form.cifraKey=form.key;prepareTab='recording';contentTab='cifra';
  syncForm();renderEditor();notify('Exemplo preenchido. Em Preparar música, teste importar a gravação e separar as faixas.');
}
function simulateRegistration(mode) {
  closeKeyPicker(false);
  if(mode==='reset'){
    cancelPreparation();releaseCurrentMedia();form=blankForm();step=maxStep=1;prepareTab='recording';contentTab='cifra';
    openView('editor');syncForm();renderEditor();notify('Cadastro limpo. Preencha os campos ou escolha uma simulação.');return;
  }
  fillExample();form.id=null;step=maxStep=1;
  if(mode==='ready'){
    const media=demoAudio();media.audio.name='nossa-cancao.wav';
    Object.assign(form,media,{sourceKind:'youtube',sourceUrl:form.link,importStatus:'ready',duration:'0:04',trimStart:0,trimEnd:4,separationStatus:'ready',trackKey:form.key,tracks:STEM_NAMES.map((name,index)=>({id:'stem-'+index,name,volume:100,mute:false,solo:false,demo:true}))});
    step=maxStep=3;
  }
  syncForm();openView('editor');renderEditor();$('sheet-scroll').scrollTop=0;
  notify(mode==='ready'?'Música pronta na simulação. Confira a revisão ou volte para testar os campos.':'Informações preenchidas. Teste a importação da gravação e a separação das faixas.');
}
function saveDraft() {
  commitPendingTag();cancelPreparation();
  const id=form.id||'draft-'+Date.now();form.id=id;drafts.set(id,{...cloneRegistration(form),updated:Date.now()});
  updateDraftButtons();tellParent();closeSheet();notify('Rascunho salvo com os dados e recursos preparados. Ele fica fora da busca.');
}
function publishSong() {
  if(!validateStep(1)||!validateStep(2)||!registrationReady())return;
  const song={...cloneRegistration(form),id:'new-'+Date.now(),title:form.title.trim(),artist:form.artist.trim(),originalKey:form.key,key:form.teamKey||form.key,tags:tagValues(),created:Date.now(),demo:false};
  songs.push(song);if(form.repertoires.includes('repertorio-2026-2'))already.add(song.id);if(form.id)drafts.delete(form.id);
  fillOptions();updateDraftButtons();renderRepertorio();tellParent();closeSheet();
  notify(song.title+(song.repertoires.length?' cadastrada e adicionada a '+song.repertoires.length+' repertório(s).':' cadastrada na biblioteca.'));
  form=blankForm();step=maxStep=1;prepareTab='recording';contentTab='cifra';syncForm();
}

// Controles do cadastro; os controles das telas aprovadas continuam no HTML principal.
initializeKeyPickers();
$('add-tag').addEventListener('click',()=>commitTags());
$('tag-list').addEventListener('click',event=>{const button=event.target.closest('[data-remove-tag]');if(!button)return;const tags=tagValues();tags.splice(Number(button.dataset.removeTag),1);form.tags=tags.join(', ');renderTags();$('song-tags').focus();});
$('tag-suggestions').addEventListener('click',event=>{const button=event.target.closest('[data-add-tag]');if(button)commitTags(button.dataset.addTag);});
$('choose-cover').addEventListener('click',()=>$('cover-file').click());
$('remove-cover').addEventListener('click',()=>{if(form.coverUrl?.startsWith('blob:')&&!currentMediaUsed(form.coverUrl))URL.revokeObjectURL(form.coverUrl);form.coverUrl=null;syncForm();renderEditor();});
document.querySelector('.prepare-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-prepare]');if(button)setPrepareTab(button.dataset.prepare);});
document.querySelector('.prepare-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
  const names=['recording','content','tracks'],index=names.indexOf(prepareTab);
  setPrepareTab(names[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3],true);
});
for(const name of ['cifra','lyrics'])$('tab-'+name).addEventListener('click',()=>setContentTab(name));
document.querySelector('.content-tabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setContentTab(event.key==='Home'?'cifra':event.key==='End'?'lyrics':contentTab==='cifra'?'lyrics':'cifra',true);}});
$('import-recording').addEventListener('click',importRecording);
$('preview-recording').addEventListener('click',openRecordingPreview);
$('separate-audio').addEventListener('click',separateAudio);
$('go-recording').addEventListener('click',()=>setPrepareTab('recording',true));
$('detect-bpm').addEventListener('click',()=>{form.bpm='72';$('song-bpm').value='72';renderEditor();notify('BPM detectado: 72. Confira e ajuste se necessário.');});
$('audio-player').addEventListener('loadedmetadata',()=>{
  const duration=$('audio-player').duration;if(!Number.isFinite(duration))return;
  if(!form.duration){form.duration=timeLabel(duration);$('song-duration').value=form.duration;}
  if(form.trimEnd==null){form.trimEnd=duration;$('trim-end').value=duration.toFixed(1);$('loop-end').value=duration.toFixed(1);}
  renderTrimWindow();
});
$('audio-player').addEventListener('play',()=>{$('tracks-play').innerHTML=icon('pause');$('tracks-play').setAttribute('aria-label','Pausar faixas');});
$('audio-player').addEventListener('pause',()=>{$('tracks-play').innerHTML=icon('play');$('tracks-play').setAttribute('aria-label','Reproduzir faixas');});
$('audio-player').addEventListener('timeupdate',()=>{const player=$('audio-player');$('tracks-time').textContent=timeLabel(player.currentTime);$('tracks-seek').value=Number.isFinite(player.duration)?player.currentTime/player.duration*100:0;});
for(let i=0;i<48;i++){const bar=document.createElement('span');bar.className='wave-bar';bar.style.height=(13+Math.abs(Math.sin(i*1.73)*Math.cos(i*.19))*41)+'px';$('trim-waveform').appendChild(bar);}
for(const name of ['trim-start','trim-end'])$(name).addEventListener('input',()=>{form.trimStart=Number($('trim-start').value);form.trimEnd=Number($('trim-end').value);renderTrimWindow();});
$('listen-trim').addEventListener('click',()=>{const range=trimSelection();if(range)playSegment(range.start,range.end);});
$('reset-trim').addEventListener('click',()=>{form.trimStart=0;form.trimEnd=audioDuration();form.trimApplied=null;$('trim-start').value=0;$('trim-end').value=form.trimEnd.toFixed(1);$('trim-error').hidden=true;renderEditor();});
$('apply-trim').addEventListener('click',()=>{const range=trimSelection();if(!range)return;cancelPreparation();form.trimApplied=range;form.tracks=[];form.separationStatus='idle';renderEditor();notify('Trecho preparado para a separação.');});
$('tracks-play').addEventListener('click',()=>{const player=$('audio-player');if(!player.paused){stopPreviewPlayback();return;}playSegment(form.trimApplied?.start||0,form.trimApplied?.end||audioDuration());});
$('tracks-seek').addEventListener('input',()=>{const player=$('audio-player');if(Number.isFinite(player.duration))player.currentTime=Number($('tracks-seek').value)/100*player.duration;});
$('track-list').addEventListener('input',event=>{
  const input=event.target.closest('[data-volume]');if(!input)return;const track=form.tracks.find(t=>t.id===input.dataset.volume);if(!track)return;
  track.volume=Number(input.value);input.closest('.track-row').querySelector('.track-volume').textContent=track.volume+'%';
  // O input permanece montado durante o arraste.
  $('track-list').dataset.render='';const solo=form.tracks.some(t=>t.solo),audible=form.tracks.filter(t=>!t.mute&&(!solo||t.solo));$('audio-player').volume=audible.reduce((n,t)=>n+t.volume/100,0)/form.tracks.length;
});
$('track-list').addEventListener('click',event=>{const button=event.target.closest('[data-mute],[data-solo]');if(!button)return;const kind=button.dataset.mute?'mute':'solo',id=button.dataset[kind],track=form.tracks.find(t=>t.id===id);if(track){track[kind]=!track[kind];renderTracks();$('track-list').querySelector('[data-'+kind+'="'+id+'"]')?.focus();}});
$('reset-mix').addEventListener('click',()=>{for(const t of form.tracks)Object.assign(t,{volume:100,mute:false,solo:false});renderTracks();});
$('track-original-key').addEventListener('change',()=>{form.trackKey=$('track-original-key').value;});
$('detect-key').addEventListener('click',()=>{form.trackKey=form.key||'G';renderTracks();notify('Tom detectado: '+form.trackKey+'. Confira a gravação.');});
for(const [id,delta]of [['pitch-down',-1],['pitch-up',1]])$(id).addEventListener('click',()=>{form.pitch=Math.min(12,Math.max(-12,form.pitch+delta));renderTracks();});
$('pitch-reset').addEventListener('click',()=>{form.pitch=0;renderTracks();});
$('upload-tracks').addEventListener('click',()=>$('track-files').click());
$('track-files').addEventListener('change',event=>{
  const files=[...(event.target.files||[])];if(!files.length||!files.every(acceptAudioFile))return;cancelPreparation();
  form.tracks=files.map((file,i)=>({id:'manual-'+i,name:STEM_NAMES.find(n=>normalize(file.name).includes(normalize(n)))||file.name.replace(/\.[^.]+$/,''),volume:100,mute:false,solo:false,url:URL.createObjectURL(file)}));
  form.trackKey=form.key;form.separationStatus='ready';renderEditor();notify('Faixas adicionadas para o ensaio.');
});
$('add-loop').addEventListener('click',()=>{
  const name=$('loop-name').value.trim(),start=Number($('loop-start').value),end=Number($('loop-end').value);
  if(!name||!form.audio||start<0||end<=start||end>audioDuration()+.05){$('loop-error').hidden=false;$('loop-error').textContent='Informe o nome e um intervalo válido dentro da gravação preparada.';return;}
  $('loop-error').hidden=true;form.loops.push({name,start,end});$('loop-name').value='';renderLoops();notify('Trecho de ensaio salvo.');
});
$('loop-list').addEventListener('click',event=>{const play=event.target.closest('[data-play-loop]'),remove=event.target.closest('[data-remove-loop]');if(play){const loop=form.loops[Number(play.dataset.playLoop)];playSegment(loop.start,loop.end,true);notify('Repetindo '+loop.name+'. Use pausar para parar.');}if(remove){form.loops.splice(Number(remove.dataset.removeLoop),1);renderLoops();}});
$('open-moises').addEventListener('click',openMoises);
$('preview-cifra').addEventListener('click',openCifraPreview);
$('cifra-down').addEventListener('click',()=>transposeContent(-1));
$('cifra-up').addEventListener('click',()=>transposeContent(1));
$('cifra-reset').addEventListener('click',()=>transposeContent(0,true));
$('apply-team-key').addEventListener('click',()=>{const current=NOTE_VALUES[(form.cifraKey||form.key).replace(/m$/,'')],target=NOTE_VALUES[form.teamKey.replace(/m$/,'')];if(current===undefined||target===undefined)return;let delta=(target-current+12)%12;if(delta>6)delta-=12;transposeContent(delta);});
$('add-additional').addEventListener('click',openAdditional);
$('additional-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-play-additional],[data-rename-additional],[data-remove-additional],[data-retry-additional]');if(!button)return;
  const kind=['play','rename','remove','retry'].find(k=>button.hasAttribute('data-'+k+'-additional')),item=form.additional.find(a=>a.id===button.dataset[kind+'Additional']);if(!item)return;
  if(kind==='play'){stopPreviewPlayback();extraPlayer=new Audio(item.url);extraPlayer.play().catch(()=>notify('Não foi possível reproduzir este áudio.'));}
  if(kind==='retry')finishAdditional(item);
  if(kind==='remove'){if(item.url?.startsWith('blob:')&&!currentMediaUsed(item.url))URL.revokeObjectURL(item.url);form.additional=form.additional.filter(a=>a!==item);renderEditor();}
  if(kind==='rename')openEditorTool('Renomear áudio','Use um nome que ajude a equipe a reconhecer a versão.','<label class="field-label" for="rename-audio">Nome do áudio</label><input id="rename-audio" class="form-control" value="'+esc(item.name)+'">',[{label:'Cancelar',run:closeEditorTool},{label:'Salvar nome',primary:true,run:()=>{const name=$('rename-audio').value.trim();if(!name)return;item.name=name;renderEditor();closeEditorTool();}}]);
});
$('close-editor-tool').addEventListener('click',closeEditorTool);
$('editor-tool-footer').addEventListener('click',event=>{const button=event.target.closest('[data-tool-action]');if(button)toolActions[Number(button.dataset.toolAction)]?.run();});
$('editor-tool-dialog').addEventListener('cancel',closeEditorTool);
$('repertoire-options').addEventListener('change',()=>{form.repertoires=[...$('repertoire-options').querySelectorAll('input:checked')].map(input=>input.value);renderEditor();});
$('editor-view').addEventListener('click',event=>{const button=event.target.closest('[data-edit-step]');if(button)changeStep(Number(button.dataset.editStep));});
$('discard-registration').addEventListener('click',()=>openEditorTool(form.id?'Excluir rascunho?':'Descartar cadastro?','Os dados desta prévia serão removidos.','<p class="section-caption">Você também pode fechar esta janela e salvar como rascunho para continuar depois.</p>',[{label:'Continuar cadastro',run:closeEditorTool},{label:form.id?'Excluir rascunho':'Descartar',primary:true,run:()=>{cancelPreparation();if(form.id)drafts.delete(form.id);releaseCurrentMedia();form=blankForm();step=maxStep=1;prepareTab='recording';closeEditorTool();syncForm();updateDraftButtons();openView('choose');notify('Cadastro descartado nesta prévia.');}}]));
