'use strict';

const PIN_HASH = '001dc19b607d4f8bd3459a8c619eed7add4daaafb261beefe78f1fc18c74d5f1';
async function verifyPin(pin){
  const data=new TextEncoder().encode('atria-v1:'+String(pin));
  const digest=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')===PIN_HASH;
}
const DB_NAME = 'atria-db';
const DB_VERSION = 1;
const STORES = { entries: 'entries', catalog: 'catalog', meta: 'meta' };

const state = {
  db: null,
  entries: [],
  catalog: [],
  meta: {},
  monthCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: null,
  currentView: 'calendar',
  mealDraft: null,
};

const DEFAULT_META = {
  theme: 'dark',
  hourFormat: '24',
  correlationWindow: 72,
  favoriteMeals: [],
  lastBackupAt: null,
};

const DEFAULT_CATALOG = [
  // Alimentos
  ['food','Pasta','Carbohidratos'],['food','Arroz','Carbohidratos'],['food','Patata','Carbohidratos'],['food','Pan','Carbohidratos'],['food','Avena','Carbohidratos'],['food','Cuscús','Carbohidratos'],
  ['food','Huevo','Proteínas'],['food','Pollo','Proteínas'],['food','Pavo','Proteínas'],['food','Ternera','Proteínas'],['food','Cerdo','Proteínas'],['food','Atún','Proteínas'],['food','Salmón','Proteínas'],['food','Pescado blanco','Proteínas'],
  ['food','Tomate','Verduras'],['food','Cebolla','Verduras'],['food','Pimiento','Verduras'],['food','Calabacín','Verduras'],['food','Berenjena','Verduras'],['food','Zanahoria','Verduras'],['food','Lechuga','Verduras'],['food','Espinacas','Verduras'],['food','Brócoli','Verduras'],
  ['food','Plátano','Fruta'],['food','Manzana','Fruta'],['food','Naranja','Fruta'],['food','Fresas','Fruta'],['food','Kiwi','Fruta'],['food','Uvas','Fruta'],
  ['food','Leche','Lácteos'],['food','Queso','Lácteos'],['food','Yogur','Lácteos'],['food','Nata','Lácteos'],
  ['food','Lentejas','Legumbres'],['food','Garbanzos','Legumbres'],['food','Judías','Legumbres'],['food','Guisantes','Legumbres'],
  ['food','Almendras','Frutos secos'],['food','Nueces','Frutos secos'],['food','Cacahuetes','Frutos secos'],['food','Aguacate','Frutos secos'],
  ['food','Salsa de tomate','Salsas'],['food','Mayonesa','Salsas'],['food','Pesto','Salsas'],['food','Salsa de soja','Salsas'],['food','Kétchup','Salsas'],['food','Mostaza','Salsas'],
  // Síntomas
  ['symptom','Dolor abdominal','Digestivo'],['symptom','Hinchazón','Digestivo'],['symptom','Gases','Digestivo'],['symptom','Diarrea','Digestivo'],['symptom','Estreñimiento','Digestivo'],['symptom','Náuseas','Digestivo'],['symptom','Acidez / reflujo','Digestivo'],
  ['symptom','Dolor de cabeza','Dolor'],['symptom','Migraña','Dolor'],['symptom','Dolor muscular','Dolor'],['symptom','Dolor lumbar','Dolor'],
  ['symptom','Cansancio','General'],['symptom','Mareo','General'],['symptom','Insomnio','General'],
  ['symptom','Picor','Piel'],['symptom','Erupción','Piel'],
  ['symptom','Congestión','Respiratorio'],['symptom','Tos','Respiratorio'],
  ['symptom','Dolor menstrual','Menstrual'],['symptom','Sensibilidad mamaria','Menstrual'],
  ['symptom','Irritabilidad','Ánimo'],['symptom','Ánimo bajo','Ánimo'],['symptom','Ansiedad','Ánimo'],
];

function uid(prefix='id') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function pad(n){ return String(n).padStart(2,'0'); }
function dateStr(d=new Date()){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function todayStr(){ return dateStr(new Date()); }
function nowTime(){ const d=new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function isFuture(s){ return parseDate(s) > parseDate(todayStr()); }
function esc(s=''){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function cap(s){ return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }
function formatDate(s, opts={day:'numeric',month:'long',year:'numeric'}){ return parseDate(s).toLocaleDateString('es-ES', opts); }
function formatTime(t){
  if ((state.meta.hourFormat || '24') === '24') return t;
  const [h,m]=t.split(':').map(Number); const d=new Date(); d.setHours(h,m,0,0);
  return d.toLocaleTimeString('es-ES',{hour:'numeric',minute:'2-digit',hour12:true});
}
function entryDateTime(e){ return new Date(`${e.date}T${e.time || '12:00'}:00`); }
function hoursBetween(a,b){ return (b-a)/36e5; }
function catalogById(id){ return state.catalog.find(x=>x.id===id); }
function activeCatalog(type){ return state.catalog.filter(x=>x.type===type && x.active!==false); }

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORES.entries)) db.createObjectStore(STORES.entries,{keyPath:'id'});
      if(!db.objectStoreNames.contains(STORES.catalog)) db.createObjectStore(STORES.catalog,{keyPath:'id'});
      if(!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta,{keyPath:'key'});
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){ return state.db.transaction(store,mode).objectStore(store); }
function getAll(store){ return new Promise((resolve,reject)=>{ const r=tx(store).getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
function put(store,value){ return new Promise((resolve,reject)=>{ const r=tx(store,'readwrite').put(value); r.onsuccess=()=>resolve(value); r.onerror=()=>reject(r.error); }); }
function del(store,key){ return new Promise((resolve,reject)=>{ const r=tx(store,'readwrite').delete(key); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error); }); }
function clearStore(store){ return new Promise((resolve,reject)=>{ const r=tx(store,'readwrite').clear(); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error); }); }

async function loadData(){
  state.entries = await getAll(STORES.entries);
  state.catalog = await getAll(STORES.catalog);
  const metaRows = await getAll(STORES.meta);
  state.meta = {...DEFAULT_META};
  metaRows.forEach(r=>state.meta[r.key]=r.value);
  if(!state.catalog.length){
    for(const [type,name,category] of DEFAULT_CATALOG){
      const item={id:uid(type),type,name,category,custom:false,active:true,favorite:false};
      await put(STORES.catalog,item); state.catalog.push(item);
    }
  }
  for(const [key,value] of Object.entries(DEFAULT_META)){
    if(!metaRows.some(r=>r.key===key)) await setMeta(key,value,false);
  }
}
async function setMeta(key,value,refresh=true){ state.meta[key]=value; await put(STORES.meta,{key,value}); if(refresh) applySettings(); }
async function saveEntry(entry){ await put(STORES.entries,entry); const i=state.entries.findIndex(e=>e.id===entry.id); if(i>=0) state.entries[i]=entry; else state.entries.push(entry); refreshAll(); }
async function deleteEntry(id){ await del(STORES.entries,id); state.entries=state.entries.filter(e=>e.id!==id); refreshAll(); }

function applySettings(){
  const chosen=state.meta.theme||'dark';
  const resolved=chosen==='system' ? (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark') : chosen;
  document.documentElement.dataset.theme=resolved;
  document.querySelector('meta[name="theme-color"]').setAttribute('content',resolved==='light'?'#f4f6fa':'#111318');
  if(document.getElementById('theme-select')) document.getElementById('theme-select').value=chosen;
  if(document.getElementById('hour-format')) document.getElementById('hour-format').value=state.meta.hourFormat||'24';
  if(document.getElementById('correlation-window')) document.getElementById('correlation-window').value=String(state.meta.correlationWindow||72);
}

function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.add('hidden'),2200); }
function showMain(){ document.getElementById('lock-screen').classList.add('hidden'); document.getElementById('main-ui').classList.remove('hidden'); }
function showLock(){ document.getElementById('main-ui').classList.add('hidden'); document.getElementById('lock-screen').classList.remove('hidden'); setTimeout(()=>document.getElementById('pin-input').focus(),50); }

function openSheet(html){ document.getElementById('sheet-content').innerHTML=html; document.getElementById('sheet-backdrop').classList.remove('hidden'); document.getElementById('sheet').classList.remove('hidden'); }
function closeSheet(){ document.getElementById('sheet').classList.add('hidden'); document.getElementById('sheet-backdrop').classList.add('hidden'); document.getElementById('sheet-content').innerHTML=''; }
function sheetHead(title,sub=''){ return `<div class="sheet-head"><div><h2>${esc(title)}</h2>${sub?`<p class="muted small">${esc(sub)}</p>`:''}</div><button class="close-btn" data-close-sheet>×</button></div>`; }

function setView(view){
  state.currentView=view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(`${view}-view`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const titles={calendar:'Calendario',analysis:'Análisis',settings:'Ajustes'};
  document.getElementById('screen-title').textContent=titles[view];
  document.getElementById('today-btn').style.visibility=view==='calendar'?'visible':'hidden';
  document.getElementById('add-btn').style.display=view==='calendar'?'block':'none';
  if(view==='analysis') renderAnalysis();
  if(view==='settings') renderSettingsState();
}

function monthEntries(){ const y=state.monthCursor.getFullYear(),m=state.monthCursor.getMonth(); return state.entries.filter(e=>{const d=parseDate(e.date);return d.getFullYear()===y&&d.getMonth()===m;}); }
function renderCalendar(){
  const y=state.monthCursor.getFullYear(),m=state.monthCursor.getMonth();
  document.getElementById('month-label').textContent=state.monthCursor.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
  const mEntries=monthEntries();
  const registeredDays=new Set(mEntries.map(e=>e.date)).size;
  const symptomDays=new Set(mEntries.filter(e=>e.type==='symptom').map(e=>e.date)).size;
  document.getElementById('month-summary').textContent=`${registeredDays} días registrados · ${symptomDays} con síntomas`;
  const first=new Date(y,m,1); const mondayIndex=(first.getDay()+6)%7; const start=new Date(y,m,1-mondayIndex);
  const grid=document.getElementById('calendar-grid'); let html='';
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=dateStr(d); const sameMonth=d.getMonth()===m;
    const entries=state.entries.filter(e=>e.date===ds); const mealCount=Math.min(entries.filter(e=>e.type==='meal').length,4);
    const markers=[...Array(mealCount)].map(()=>'<i class="marker meal"></i>').join('')+
      (entries.some(e=>e.type==='symptom')?'<i class="marker symptom"></i>':'')+
      (entries.some(e=>e.type==='period')?'<i class="marker period"></i>':'')+
      (entries.some(e=>e.type==='med')?'<i class="marker med"></i>':'');
    const cls=['day-cell',!sameMonth?'other-month':'',ds===todayStr()?'today':'',isFuture(ds)?'future':'',state.selectedDate===ds?'selected':''].filter(Boolean).join(' ');
    html+=`<button class="${cls}" data-date="${ds}" aria-label="${esc(formatDate(ds))}"><span class="day-number">${d.getDate()}</span><span class="day-markers">${markers}</span></button>`;
  }
  grid.innerHTML=html;
}

function entryTitle(e){
  if(e.type==='meal') return cap(e.mealType||'Comida');
  if(e.type==='symptom') return catalogById(e.symptomId)?.name || e.symptomName || 'Síntoma';
  if(e.type==='period') return 'Menstruación';
  if(e.type==='med') return catalogById(e.medId)?.name || e.medName || 'Medicamento';
  return 'Entrada';
}
function entrySubtitle(e){
  if(e.type==='meal'){
    const foods=(e.foods||[]).map(id=>catalogById(id)?.name).filter(Boolean).join(' · ');
    return [foods,e.amount?`Cantidad ${e.amount}`:'',e.note||''].filter(Boolean).join(' · ');
  }
  if(e.type==='symptom') return [`Intensidad ${e.intensity}/10`,e.duration?`Duración ${e.duration}`:'',e.ongoing?'Continúa desde ayer':'',e.note||''].filter(Boolean).join(' · ');
  if(e.type==='period') return [`Flujo ${e.flow}`,`Dolor ${e.pain}/10`,e.note||''].filter(Boolean).join(' · ');
  if(e.type==='med') return [e.dose||'',e.note||''].filter(Boolean).join(' · ');
  return '';
}
function showDay(date){
  state.selectedDate=date; renderCalendar();
  const entries=state.entries.filter(e=>e.date===date).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const canAdd=!isFuture(date);
  const list=entries.length?`<div class="day-entry-list">${entries.map(e=>`<div class="day-entry"><i class="entry-bar ${e.type}"></i><div class="entry-time">${formatTime(e.time||'12:00')}</div><div class="entry-body"><strong>${esc(entryTitle(e))}</strong><span>${esc(entrySubtitle(e))}</span></div><button class="entry-menu" data-entry-menu="${e.id}">•••</button></div>`).join('')}</div>`:`<div class="empty-state">No hay registros este día.</div>`;
  openSheet(`${sheetHead(formatDate(date,{weekday:'long',day:'numeric',month:'long'}),canAdd?'Registro del día':'Puedes consultar este día, pero no añadir entradas futuras.')}${list}${canAdd?`<button class="primary-btn full" style="margin-top:14px" data-add-for-day="${date}">+ Añadir entrada</button>`:''}`);
}
function showEntryMenu(id){
  const e=state.entries.find(x=>x.id===id); if(!e)return;
  openSheet(`${sheetHead(entryTitle(e),formatDate(e.date))}<div class="button-stack"><button class="secondary-btn" data-edit-entry="${id}">Editar</button><button class="danger-btn" data-delete-entry="${id}">Borrar</button></div>`);
}

function showAddPicker(date=state.selectedDate||todayStr()){
  if(isFuture(date)){ showToast('No puedes añadir entradas futuras.'); return; }
  openSheet(`${sheetHead('Añadir entrada',formatDate(date))}<div class="entry-type-grid">
    <button class="type-choice meal" data-add-type="meal" data-date="${date}"><strong>Comida</strong><span>Alimentos, cantidad y hora</span></button>
    <button class="type-choice symptom" data-add-type="symptom" data-date="${date}"><strong>Síntoma</strong><span>Intensidad y duración</span></button>
    <button class="type-choice period" data-add-type="period" data-date="${date}"><strong>Regla</strong><span>Flujo y dolor</span></button>
    <button class="type-choice med" data-add-type="med" data-date="${date}"><strong>Medicamento</strong><span>Dosis y hora</span></button>
  </div>`);
}

function guessMealType(){ const h=new Date().getHours(); if(h<10)return'desayuno'; if(h<12)return'media mañana'; if(h<16)return'comida'; if(h<19)return'merienda'; if(h<23)return'cena'; return'snack'; }
function groupedCatalog(type){
  const groups={}; activeCatalog(type).forEach(i=>{(groups[i.category||'Otros'] ||= []).push(i)}); return groups;
}
function recentFoodIds(){
  const meals=state.entries.filter(e=>e.type==='meal').sort((a,b)=>entryDateTime(b)-entryDateTime(a)); const seen=[];
  for(const m of meals) for(const id of (m.foods||[])) if(!seen.includes(id) && catalogById(id)?.active!==false) seen.push(id);
  return seen.slice(0,8);
}
function ensureMealDraft(date,entry=null){
  if(entry){ state.mealDraft={id:entry.id,date:entry.date,time:entry.time,mealType:entry.mealType,amount:entry.amount||'normal',foods:[...(entry.foods||[])],note:entry.note||''}; }
  else state.mealDraft={id:null,date,time:date===todayStr()?nowTime():'12:00',mealType:guessMealType(),amount:'normal',foods:[],note:''};
}
function renderMealForm(date,entry=null){
  if(!state.mealDraft || entry) ensureMealDraft(date,entry);
  const d=state.mealDraft; const groups=groupedCatalog('food'); const recents=recentFoodIds().map(catalogById).filter(Boolean);
  const favorites=(state.meta.favoriteMeals||[]);
  const chips=(items)=>items.map(i=>`<button type="button" class="chip ${d.foods.includes(i.id)?'active':''}" data-food-chip="${i.id}">${esc(i.name)}</button>`).join('');
  const cats=Object.keys(groups).sort((a,b)=>a==='Salsas'?1:b==='Salsas'?-1:a.localeCompare(b,'es')).map(cat=>`<div class="category-block"><div class="category-title">${esc(cat)}</div><div class="segmented">${chips(groups[cat])}</div></div>`).join('');
  openSheet(`${sheetHead(d.id?'Editar comida':'Añadir comida',formatDate(d.date))}<form id="meal-form" class="form-grid">
    <div class="two-col"><label class="field-label">Tipo<select id="meal-type" class="field-input">${['desayuno','media mañana','comida','merienda','cena','snack'].map(x=>`<option ${d.mealType===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="field-label">Hora<input id="meal-time" class="field-input" type="time" value="${d.time}"></label></div>
    ${favorites.length?`<div><div class="category-title">Comidas favoritas</div><div class="segmented">${favorites.map(f=>`<button type="button" class="chip favorite" data-fav-meal="${f.id}">${esc(f.name)}</button>`).join('')}</div></div>`:''}
    ${recents.length?`<div><div class="category-title">Recientes</div><div class="segmented">${chips(recents)}</div></div>`:''}
    <div class="toolbar-row"><input id="food-search" class="field-input" placeholder="Buscar alimento…"><button type="button" class="secondary-btn" id="toggle-new-food">+ Nuevo</button></div>
    <div id="new-food-panel" class="card compact-card hidden"><div class="two-col"><label class="field-label">Nombre<input id="new-food-name" class="field-input"></label><label class="field-label">Categoría<select id="new-food-category" class="field-input">${['Carbohidratos','Proteínas','Verduras','Fruta','Lácteos','Legumbres','Frutos secos','Salsas'].map(x=>`<option>${x}</option>`).join('')}</select></label></div><button type="button" id="save-new-food" class="primary-btn" style="margin-top:10px">Guardar alimento</button></div>
    <div id="food-categories">${cats}</div>
    <label class="field-label">Cantidad<div class="segmented">${['poca','normal','mucha'].map(x=>`<button type="button" class="chip ${d.amount===x?'active':''}" data-amount="${x}">${cap(x)}</button>`).join('')}</div></label>
    <label class="field-label">Notas opcionales<textarea id="meal-note" class="field-textarea" placeholder="Algo excepcional de esta comida…">${esc(d.note)}</textarea></label>
    <div class="form-actions"><button type="button" id="save-meal-favorite" class="secondary-btn">Guardar como favorita</button><button class="primary-btn" type="submit">Guardar</button></div>
  </form>`);
}

function renderSymptomForm(date,entry=null){
  const symptoms=activeCatalog('symptom'); const favorites=symptoms.filter(x=>x.favorite); const groups=groupedCatalog('symptom');
  const selected=entry?.symptomId || favorites[0]?.id || symptoms[0]?.id || '';
  const intensity=entry?.intensity ?? 5; const duration=entry?.duration||'1 h';
  openSheet(`${sheetHead(entry?'Editar síntoma':'Añadir síntoma',formatDate(date))}<form id="symptom-form" class="form-grid" data-entry-id="${entry?.id||''}" data-date="${date}">
    ${favorites.length?`<div><div class="category-title">Favoritos</div><div class="segmented">${favorites.map(i=>`<button type="button" class="chip favorite ${selected===i.id?'active':''}" data-symptom-chip="${i.id}">${esc(i.name)}</button>`).join('')}</div></div>`:''}
    <label class="field-label">Síntoma<select id="symptom-select" class="field-input">${Object.entries(groups).map(([cat,items])=>`<optgroup label="${esc(cat)}">${items.map(i=>`<option value="${i.id}" ${selected===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <button type="button" class="inline-link" id="toggle-new-symptom">+ Crear síntoma nuevo</button>
    <div id="new-symptom-panel" class="card compact-card hidden"><div class="two-col"><label class="field-label">Nombre<input id="new-symptom-name" class="field-input"></label><label class="field-label">Categoría<select id="new-symptom-category" class="field-input">${['Digestivo','Dolor','General','Piel','Respiratorio','Menstrual','Ánimo'].map(x=>`<option>${x}</option>`).join('')}</select></label></div><button type="button" id="save-new-symptom" class="primary-btn" style="margin-top:10px">Guardar síntoma</button></div>
    <div class="two-col"><label class="field-label">Hora<input id="symptom-time" class="field-input" type="time" value="${entry?.time|| (date===todayStr()?nowTime():'12:00')}"></label><label class="field-label">Duración<select id="symptom-duration" class="field-input">${['15 min','30 min','1 h','2 h','4 h','Todo el día','En curso'].map(x=>`<option ${duration===x?'selected':''}>${x}</option>`).join('')}</select></label></div>
    <label class="field-label">Intensidad <span class="muted small">1 muy leve · 5 moderado · 10 muy intenso</span><div class="scale-row">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" class="scale-btn ${intensity===n?'active':''}" data-intensity="${n}">${n}</button>`).join('')}</div><input id="symptom-intensity" type="hidden" value="${intensity}"></label>
    <label class="field-label"><span><input id="symptom-ongoing" type="checkbox" ${entry?.ongoing?'checked':''}> Continúa desde ayer</span></label>
    <label class="field-label">Notas opcionales<textarea id="symptom-note" class="field-textarea">${esc(entry?.note||'')}</textarea></label>
    <button class="primary-btn" type="submit">Guardar síntoma</button>
  </form>`);
}

function renderPeriodForm(date,entry=null){
  const flow=entry?.flow||'medio'; const pain=entry?.pain??0;
  openSheet(`${sheetHead(entry?'Editar menstruación':'Registrar menstruación',formatDate(date))}<form id="period-form" class="form-grid" data-entry-id="${entry?.id||''}" data-date="${date}">
    <label class="field-label">Flujo<div class="segmented">${['leve','medio','abundante'].map(x=>`<button type="button" class="chip ${flow===x?'active':''}" data-flow="${x}">${cap(x)}</button>`).join('')}</div><input id="period-flow" type="hidden" value="${flow}"></label>
    <label class="field-label">Dolor <span class="muted small">0 sin dolor · 10 máximo</span><div class="segmented">${[0,1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" class="scale-btn ${pain===n?'active':''}" data-period-pain="${n}">${n}</button>`).join('')}</div><input id="period-pain" type="hidden" value="${pain}"></label>
    <label class="field-label">Hora<input id="period-time" class="field-input" type="time" value="${entry?.time||(date===todayStr()?nowTime():'12:00')}"></label>
    <label class="field-label">Notas opcionales<textarea id="period-note" class="field-textarea">${esc(entry?.note||'')}</textarea></label>
    <button class="primary-btn" type="submit">Guardar</button>
  </form>`);
}

function renderMedForm(date,entry=null){
  const meds=activeCatalog('med'); const selected=entry?.medId || meds[0]?.id || '';
  openSheet(`${sheetHead(entry?'Editar medicamento':'Añadir medicamento',formatDate(date))}<form id="med-form" class="form-grid" data-entry-id="${entry?.id||''}" data-date="${date}">
    ${meds.length?`<label class="field-label">Medicamento<select id="med-select" class="field-input">${meds.map(i=>`<option value="${i.id}" ${selected===i.id?'selected':''}>${esc(i.name)}</option>`).join('')}</select></label>`:`<div class="empty-state">Todavía no tienes medicamentos guardados.</div>`}
    <button type="button" class="inline-link" id="toggle-new-med">+ Añadir medicamento a mi lista</button>
    <div id="new-med-panel" class="card compact-card hidden"><label class="field-label">Nombre<input id="new-med-name" class="field-input" placeholder="Ej. Ibuprofeno"></label><button type="button" id="save-new-med" class="primary-btn" style="margin-top:10px">Guardar medicamento</button></div>
    <div class="two-col"><label class="field-label">Dosis<input id="med-dose" class="field-input" value="${esc(entry?.dose||'')}" placeholder="Ej. 400 mg o 1 comprimido"></label><label class="field-label">Hora<input id="med-time" class="field-input" type="time" value="${entry?.time||(date===todayStr()?nowTime():'12:00')}"></label></div>
    <label class="field-label">Notas opcionales<textarea id="med-note" class="field-textarea">${esc(entry?.note||'')}</textarea></label>
    <button class="primary-btn" type="submit" ${meds.length?'':'disabled'}>Guardar medicamento</button>
  </form>`);
}

async function addCatalogItem(type,name,category='Otros'){
  name=name.trim(); if(!name)return null;
  const existing=state.catalog.find(i=>i.type===type&&i.name.toLowerCase()===name.toLowerCase()); if(existing){ if(existing.active===false){existing.active=true;await put(STORES.catalog,existing);} return existing; }
  const item={id:uid(type),type,name,category,custom:true,active:true,favorite:false}; await put(STORES.catalog,item); state.catalog.push(item); return item;
}

function filterByAnalysisPeriod(){ const val=document.getElementById('analysis-period')?.value||'30'; if(val==='all') return [...state.entries]; const cutoff=new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate()-Number(val)+1); return state.entries.filter(e=>entryDateTime(e)>=cutoff); }
function countMap(arr){ const m=new Map(); arr.forEach(x=>m.set(x,(m.get(x)||0)+1)); return [...m.entries()].sort((a,b)=>b[1]-a[1]); }
function renderAnalysis(){
  const entries=filterByAnalysisPeriod(); const meals=entries.filter(e=>e.type==='meal'); const symptoms=entries.filter(e=>e.type==='symptom'); const periods=entries.filter(e=>e.type==='period');
  const allFoodIds=meals.flatMap(m=>[...new Set(m.foods||[])]); const foodCounts=countMap(allFoodIds); const symptomCounts=countMap(symptoms.map(s=>s.symptomId));
  const regDays=new Set(entries.map(e=>e.date)).size; const symptomDays=new Set(symptoms.map(e=>e.date)).size; const periodDays=new Set(periods.map(e=>e.date)).size;
  const topFood=foodCounts[0] ? catalogById(foodCounts[0][0])?.name : '—';
  document.getElementById('analysis-summary').innerHTML=[
    [meals.length,'comidas registradas'],[symptomDays,'días con síntomas'],[periodDays,'días con regla'],[topFood,'alimento más repetido']
  ].map(([v,l])=>`<div class="stat-card"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('');
  document.getElementById('top-foods').innerHTML=foodCounts.length?foodCounts.slice(0,10).map(([id,n],idx)=>`<div class="rank-item"><div><strong>${idx+1}. ${esc(catalogById(id)?.name||'Alimento')}</strong><div class="meta">${esc(catalogById(id)?.category||'')}</div></div><strong>${n}</strong></div>`).join(''):'<div class="empty-state">Todavía no hay suficientes comidas.</div>';
  document.getElementById('top-symptoms').innerHTML=symptomCounts.length?symptomCounts.slice(0,8).map(([id,n],idx)=>`<div class="rank-item"><div><strong>${idx+1}. ${esc(catalogById(id)?.name||'Síntoma')}</strong><div class="meta">${esc(catalogById(id)?.category||'')}</div></div><strong>${n}</strong></div>`).join(''):'<div class="empty-state">Todavía no hay síntomas registrados.</div>';
  const windowHours=Number(state.meta.correlationWindow||72); document.getElementById('correlation-window-label').textContent=`0–${windowHours} h`;
  const correlations=computeCorrelations(entries,windowHours);
  document.getElementById('correlations-list').innerHTML=correlations.length?correlations.slice(0,20).map((c,i)=>`<button class="correlation-item" data-correlation-index="${i}"><div class="correlation-main"><strong>${esc(c.foodName)} → ${esc(c.symptomName)}</strong><div class="meta">${c.hits} de ${c.exposures} exposiciones · ${Math.round(c.rate*100)} %${c.lags.length?` · ${Math.floor(Math.min(...c.lags))}–${Math.ceil(Math.max(...c.lags))} h`:''}</div></div><span class="badge ${c.levelClass}">${c.level}</span></button>`).join(''):'<div class="empty-state">Necesitas al menos 4 exposiciones a un alimento para empezar a mostrar asociaciones.</div>';
  state.lastCorrelations=correlations;
  const periodDates=new Set(periods.map(p=>p.date)); const cycleSymptomCounts=countMap(symptoms.filter(s=>periodDates.has(s.date)).map(s=>s.symptomId));
  document.getElementById('cycle-analysis').innerHTML=periodDates.size?(cycleSymptomCounts.length?cycleSymptomCounts.slice(0,8).map(([id,n])=>`<div class="rank-item"><div><strong>${esc(catalogById(id)?.name||'Síntoma')}</strong><div class="meta">Apareció ${n} ${n===1?'vez':'veces'} durante días de regla</div></div><span class="badge">${periodDates.size} días de regla</span></div>`).join(''):'<div class="empty-state">Tienes días de regla registrados, pero todavía no coinciden con síntomas.</div>'):'<div class="empty-state">Registra días de menstruación para comparar el ciclo con tus síntomas.</div>';
}
function computeCorrelations(entries,windowHours){
  const meals=entries.filter(e=>e.type==='meal').sort((a,b)=>entryDateTime(a)-entryDateTime(b)); const symptoms=entries.filter(e=>e.type==='symptom').sort((a,b)=>entryDateTime(a)-entryDateTime(b));
  const exposures=new Map();
  for(const meal of meals) for(const foodId of new Set(meal.foods||[])){ if(!exposures.has(foodId)) exposures.set(foodId,[]); exposures.get(foodId).push(meal); }
  const result=[];
  for(const [foodId,foodMeals] of exposures){
    if(foodMeals.length<4) continue;
    const symptomIds=[...new Set(symptoms.map(s=>s.symptomId))];
    for(const symptomId of symptomIds){ let hits=0; const lags=[]; const matches=[];
      for(const meal of foodMeals){ const start=entryDateTime(meal); const candidates=symptoms.filter(s=>s.symptomId===symptomId && entryDateTime(s)>=start && hoursBetween(start,entryDateTime(s))<=windowHours);
        if(candidates.length){ const first=candidates[0]; const lag=hoursBetween(start,entryDateTime(first)); hits++; lags.push(lag); matches.push({mealDate:meal.date,mealTime:meal.time,symptomDate:first.date,symptomTime:first.time,lag}); }
      }
      if(!hits)continue; const rate=hits/foodMeals.length; const level=rate>=.75?'Alta':rate>=.5?'Moderada':'Baja';
      result.push({foodId,symptomId,foodName:catalogById(foodId)?.name||'Alimento',symptomName:catalogById(symptomId)?.name||'Síntoma',exposures:foodMeals.length,hits,rate,lags,matches,level,levelClass:level==='Alta'?'high':level==='Moderada'?'medium':'low'});
    }
  }
  return result.sort((a,b)=>b.exposures-a.exposures || b.rate-a.rate || b.hits-a.hits);
}
function showCorrelationDetail(c){
  openSheet(`${sheetHead(`${c.foodName} → ${c.symptomName}`,'Posible asociación; no demuestra causalidad.')}<div class="card compact-card"><strong>${c.hits} de ${c.exposures} exposiciones (${Math.round(c.rate*100)} %)</strong><p class="muted small">Nivel orientativo: ${c.level}${c.lags.length?` · aparición entre ${Math.floor(Math.min(...c.lags))} y ${Math.ceil(Math.max(...c.lags))} horas`:''}.</p></div><div class="match-list">${c.matches.map(m=>`<div class="match-row"><span>${esc(formatDate(m.mealDate,{day:'numeric',month:'short'}))} ${formatTime(m.mealTime)}</span><strong>+${Math.round(m.lag)} h</strong><span>${esc(formatDate(m.symptomDate,{day:'numeric',month:'short'}))} ${formatTime(m.symptomTime)}</span></div>`).join('')}</div>`);
}

function renderSettingsState(){
  applySettings();
  const t=document.getElementById('last-backup-text'); if(t) t.textContent=state.meta.lastBackupAt?`Última exportación: ${new Date(state.meta.lastBackupAt).toLocaleString('es-ES')}`:'Todavía no has exportado ninguna copia.';
}
function refreshAll(){ renderCalendar(); if(state.currentView==='analysis')renderAnalysis(); if(state.currentView==='settings')renderSettingsState(); }

function downloadBlob(blob,name){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
async function exportJSON(){
  const payload={app:'Atria',version:1,exportedAt:new Date().toISOString(),entries:state.entries,catalog:state.catalog,meta:{...state.meta,lastBackupAt:new Date().toISOString()}};
  const stamp=todayStr(); downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`atria-backup-${stamp}.json`); await setMeta('lastBackupAt',new Date().toISOString()); renderSettingsState(); showToast('Copia JSON exportada.');
}
function exportCSV(){
  const headers=['date','time','type','title','meal_type','foods','amount','intensity','duration','flow','pain','dose','note'];
  const rows=state.entries.sort((a,b)=>entryDateTime(a)-entryDateTime(b)).map(e=>[
    e.date,e.time||'',e.type,entryTitle(e),e.mealType||'',(e.foods||[]).map(id=>catalogById(id)?.name||id).join('|'),e.amount||'',e.intensity??'',e.duration||'',e.flow||'',e.pain??'',e.dose||'',e.note||''
  ]);
  const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadBlob(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),`atria-datos-${todayStr()}.csv`); showToast('CSV exportado.');
}
async function importJSONFile(file){
  try{
    const text=await file.text(); const data=JSON.parse(text);
    if(data.app!=='Atria'||!Array.isArray(data.entries)||!Array.isArray(data.catalog)) throw new Error('Archivo no válido');
    if(!confirm('La importación reemplazará todos los datos actuales de Atria. ¿Continuar?'))return;
    if(!confirm('Esta acción no se puede deshacer salvo que tengas otra copia. ¿Reemplazar todo?'))return;
    await clearStore(STORES.entries); await clearStore(STORES.catalog); await clearStore(STORES.meta);
    for(const e of data.entries) await put(STORES.entries,e); for(const c of data.catalog) await put(STORES.catalog,c);
    const importedMeta={...DEFAULT_META,...(data.meta||{})}; for(const [key,value] of Object.entries(importedMeta)) await put(STORES.meta,{key,value});
    await loadData(); applySettings(); refreshAll(); showToast('Copia restaurada correctamente.');
  }catch(err){ alert('No se pudo importar la copia. Comprueba que sea un backup JSON de Atria.'); console.error(err); }
}

function manageCatalog(type){
  const labels={food:'Alimentos',symptom:'Síntomas',med:'Medicamentos'}; const items=activeCatalog(type).sort((a,b)=>(a.category||'').localeCompare(b.category||'','es')||a.name.localeCompare(b.name,'es'));
  openSheet(`${sheetHead(labels[type],type==='food'?'Eliminar de la lista no borra el historial antiguo.':'Puedes editar tus listas sin cambiar registros pasados.')}<div class="manager-list">${items.map(i=>`<div class="manager-item"><div><strong>${esc(i.name)}</strong><div class="sub">${esc(i.category||'')}</div></div><div>${type==='symptom'?`<button class="star-btn ${i.favorite?'active':''}" data-star-item="${i.id}" aria-label="Favorito">★</button>`:''}<button class="mini-btn" data-rename-item="${i.id}">Editar</button>${i.custom?`<button class="mini-btn" data-deactivate-item="${i.id}">Quitar</button>`:''}</div></div>`).join('')}</div><button class="primary-btn full" style="margin-top:12px" data-manager-add="${type}">+ Añadir</button>`);
}
async function renameItem(id){
  const item=catalogById(id); if(!item)return; const name=prompt('Nombre:',item.name); if(!name?.trim())return; item.name=name.trim();
  if(item.type!=='med'){ const category=prompt('Categoría:',item.category||'Otros'); if(category?.trim()) item.category=category.trim(); }
  await put(STORES.catalog,item); manageCatalog(item.type); refreshAll();
}
async function deactivateItem(id){ const item=catalogById(id); if(!item)return; if(!confirm(`Quitar “${item.name}” de futuras selecciones? El historial antiguo se conservará.`))return; item.active=false; await put(STORES.catalog,item); manageCatalog(item.type); refreshAll(); }
async function toggleFavorite(id){ const item=catalogById(id); if(!item)return; item.favorite=!item.favorite; await put(STORES.catalog,item); manageCatalog(item.type); }
async function managerAdd(type){ const name=prompt(type==='food'?'Nombre del alimento:':type==='symptom'?'Nombre del síntoma:':'Nombre del medicamento:'); if(!name?.trim())return; let cat='Otros'; if(type==='food')cat=prompt('Categoría (ej. Verduras, Proteínas, Salsas):','Otros')||'Otros'; if(type==='symptom')cat=prompt('Categoría (ej. Digestivo, Dolor, General):','General')||'General'; await addCatalogItem(type,name,cat); manageCatalog(type); }

async function resetApp(){
  if(!confirm('Esto borrará todos los registros, listas personalizadas y ajustes de Atria. ¿Continuar?'))return;
  const p=prompt('Escribe el PIN de Atria para confirmar:'); if(!(await verifyPin(p))){alert('PIN incorrecto.');return;}
  if(!confirm('Última confirmación: ¿borrar todos los datos?'))return;
  await clearStore(STORES.entries); await clearStore(STORES.catalog); await clearStore(STORES.meta); await loadData(); state.selectedDate=null; state.monthCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1); applySettings(); refreshAll(); showToast('Atria se ha restablecido.');
}

function bindEvents(){
  document.getElementById('pin-submit').addEventListener('click',async()=>{ const input=document.getElementById('pin-input'); if(await verifyPin(input.value)){localStorage.setItem('atria_trusted','1');input.value='';document.getElementById('pin-error').textContent='';showMain();renderCalendar();navigator.storage?.persist?.().catch(()=>{});}else document.getElementById('pin-error').textContent='PIN incorrecto.'; });
  document.getElementById('pin-input').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('pin-submit').click();});
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.getElementById('today-btn').addEventListener('click',()=>{state.monthCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);state.selectedDate=todayStr();renderCalendar();});
  document.getElementById('prev-month').addEventListener('click',()=>{state.monthCursor=new Date(state.monthCursor.getFullYear(),state.monthCursor.getMonth()-1,1);renderCalendar();});
  document.getElementById('next-month').addEventListener('click',()=>{state.monthCursor=new Date(state.monthCursor.getFullYear(),state.monthCursor.getMonth()+1,1);renderCalendar();});
  document.getElementById('calendar-grid').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(b)showDay(b.dataset.date);});
  document.getElementById('add-btn').addEventListener('click',()=>showAddPicker(state.selectedDate||todayStr()));
  document.getElementById('sheet-backdrop').addEventListener('click',closeSheet);
  document.getElementById('analysis-period').addEventListener('change',renderAnalysis);
  document.getElementById('theme-select').addEventListener('change',e=>setMeta('theme',e.target.value));
  document.getElementById('hour-format').addEventListener('change',e=>setMeta('hourFormat',e.target.value));
  document.getElementById('correlation-window').addEventListener('change',e=>setMeta('correlationWindow',Number(e.target.value)));
  document.getElementById('export-json').addEventListener('click',exportJSON); document.getElementById('export-csv').addEventListener('click',exportCSV);
  document.getElementById('import-json').addEventListener('click',()=>document.getElementById('import-file').click()); document.getElementById('import-file').addEventListener('change',e=>{if(e.target.files[0])importJSONFile(e.target.files[0]);e.target.value='';});
  document.getElementById('lock-now').addEventListener('click',()=>{localStorage.removeItem('atria_trusted');showLock();}); document.getElementById('reset-app').addEventListener('click',resetApp);
  document.querySelectorAll('[data-manage]').forEach(b=>b.addEventListener('click',()=>manageCatalog(b.dataset.manage)));

  document.getElementById('sheet').addEventListener('click',async e=>{
    if(e.target.closest('[data-close-sheet]')) return closeSheet();
    const addDay=e.target.closest('[data-add-for-day]'); if(addDay)return showAddPicker(addDay.dataset.addForDay);
    const type=e.target.closest('[data-add-type]'); if(type){ const d=type.dataset.date; if(type.dataset.addType==='meal'){state.mealDraft=null;renderMealForm(d);} if(type.dataset.addType==='symptom')renderSymptomForm(d); if(type.dataset.addType==='period')renderPeriodForm(d); if(type.dataset.addType==='med')renderMedForm(d); return; }
    const menu=e.target.closest('[data-entry-menu]'); if(menu)return showEntryMenu(menu.dataset.entryMenu);
    const edit=e.target.closest('[data-edit-entry]'); if(edit){ const ent=state.entries.find(x=>x.id===edit.dataset.editEntry); if(!ent)return; if(ent.type==='meal')renderMealForm(ent.date,ent); if(ent.type==='symptom')renderSymptomForm(ent.date,ent); if(ent.type==='period')renderPeriodForm(ent.date,ent); if(ent.type==='med')renderMedForm(ent.date,ent); return; }
    const dele=e.target.closest('[data-delete-entry]'); if(dele){ const ent=state.entries.find(x=>x.id===dele.dataset.deleteEntry); if(ent&&confirm(`¿Borrar “${entryTitle(ent)}”?`)){ await deleteEntry(ent.id); closeSheet(); showToast('Entrada borrada.'); } return; }
    const food=e.target.closest('[data-food-chip]'); if(food){ const id=food.dataset.foodChip; const arr=state.mealDraft.foods; state.mealDraft.foods=arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]; food.classList.toggle('active'); return; }
    const amt=e.target.closest('[data-amount]'); if(amt){state.mealDraft.amount=amt.dataset.amount;document.querySelectorAll('[data-amount]').forEach(x=>x.classList.toggle('active',x===amt));return;}
    const fav=e.target.closest('[data-fav-meal]'); if(fav){const f=(state.meta.favoriteMeals||[]).find(x=>x.id===fav.dataset.favMeal);if(f){state.mealDraft.foods=[...f.foods];state.mealDraft.mealType=f.mealType||state.mealDraft.mealType;state.mealDraft.amount=f.amount||'normal';renderMealForm(state.mealDraft.date);}return;}
    if(e.target.id==='toggle-new-food'){document.getElementById('new-food-panel').classList.toggle('hidden');return;}
    if(e.target.id==='save-new-food'){const item=await addCatalogItem('food',document.getElementById('new-food-name').value,document.getElementById('new-food-category').value);if(item){state.mealDraft.foods.push(item.id);renderMealForm(state.mealDraft.date);showToast('Alimento añadido.');}return;}
    const symChip=e.target.closest('[data-symptom-chip]'); if(symChip){document.getElementById('symptom-select').value=symChip.dataset.symptomChip;document.querySelectorAll('[data-symptom-chip]').forEach(x=>x.classList.toggle('active',x===symChip));return;}
    const intens=e.target.closest('[data-intensity]'); if(intens){document.getElementById('symptom-intensity').value=intens.dataset.intensity;document.querySelectorAll('[data-intensity]').forEach(x=>x.classList.toggle('active',x===intens));return;}
    if(e.target.id==='toggle-new-symptom'){document.getElementById('new-symptom-panel').classList.toggle('hidden');return;}
    if(e.target.id==='save-new-symptom'){const item=await addCatalogItem('symptom',document.getElementById('new-symptom-name').value,document.getElementById('new-symptom-category').value);if(item){renderSymptomForm(document.getElementById('symptom-form').dataset.date);showToast('Síntoma añadido.');}return;}
    const flow=e.target.closest('[data-flow]'); if(flow){document.getElementById('period-flow').value=flow.dataset.flow;document.querySelectorAll('[data-flow]').forEach(x=>x.classList.toggle('active',x===flow));return;}
    const pp=e.target.closest('[data-period-pain]'); if(pp){document.getElementById('period-pain').value=pp.dataset.periodPain;document.querySelectorAll('[data-period-pain]').forEach(x=>x.classList.toggle('active',x===pp));return;}
    if(e.target.id==='toggle-new-med'){document.getElementById('new-med-panel').classList.toggle('hidden');return;}
    if(e.target.id==='save-new-med'){const item=await addCatalogItem('med',document.getElementById('new-med-name').value,'Medicamentos');if(item){renderMedForm(document.getElementById('med-form').dataset.date);showToast('Medicamento añadido.');}return;}
    if(e.target.id==='save-meal-favorite'){ if(!state.mealDraft.foods.length){showToast('Selecciona alimentos primero.');return;} const name=prompt('Nombre de esta comida favorita:','Comida habitual'); if(name?.trim()){const favs=[...(state.meta.favoriteMeals||[])];favs.push({id:uid('fav'),name:name.trim(),foods:[...state.mealDraft.foods],mealType:document.getElementById('meal-type').value,amount:state.mealDraft.amount});await setMeta('favoriteMeals',favs,false);showToast('Comida favorita guardada.');}return; }
    const star=e.target.closest('[data-star-item]'); if(star)return toggleFavorite(star.dataset.starItem);
    const rename=e.target.closest('[data-rename-item]'); if(rename)return renameItem(rename.dataset.renameItem);
    const deact=e.target.closest('[data-deactivate-item]'); if(deact)return deactivateItem(deact.dataset.deactivateItem);
    const madd=e.target.closest('[data-manager-add]'); if(madd)return managerAdd(madd.dataset.managerAdd);
  });

  document.getElementById('sheet').addEventListener('input',e=>{
    if(e.target.id==='food-search'){
      const q=e.target.value.trim().toLowerCase(); document.querySelectorAll('#food-categories .chip').forEach(ch=>{ch.style.display=ch.textContent.toLowerCase().includes(q)?'inline-flex':'none';});
    }
  });

  document.getElementById('sheet').addEventListener('submit',async e=>{
    e.preventDefault();
    if(e.target.id==='meal-form'){
      if(!state.mealDraft.foods.length){showToast('Selecciona al menos un alimento.');return;}
      const entry={id:state.mealDraft.id||uid('entry'),type:'meal',date:state.mealDraft.date,time:document.getElementById('meal-time').value,mealType:document.getElementById('meal-type').value,foods:[...state.mealDraft.foods],amount:state.mealDraft.amount,note:document.getElementById('meal-note').value.trim()};
      await saveEntry(entry); state.mealDraft=null; closeSheet(); showToast('Comida guardada.'); return;
    }
    if(e.target.id==='symptom-form'){
      const id=document.getElementById('symptom-select').value; if(!id){showToast('Selecciona un síntoma.');return;}
      const entry={id:e.target.dataset.entryId||uid('entry'),type:'symptom',date:e.target.dataset.date,time:document.getElementById('symptom-time').value,symptomId:id,intensity:Number(document.getElementById('symptom-intensity').value),duration:document.getElementById('symptom-duration').value,ongoing:document.getElementById('symptom-ongoing').checked,note:document.getElementById('symptom-note').value.trim()};
      await saveEntry(entry); closeSheet(); showToast('Síntoma guardado.'); return;
    }
    if(e.target.id==='period-form'){
      const date=e.target.dataset.date; const existingSameDay=state.entries.find(x=>x.type==='period'&&x.date===date&&x.id!==e.target.dataset.entryId); if(existingSameDay){showToast('Ya hay un registro de regla ese día. Edita el existente.');return;}
      const entry={id:e.target.dataset.entryId||uid('entry'),type:'period',date,time:document.getElementById('period-time').value,flow:document.getElementById('period-flow').value,pain:Number(document.getElementById('period-pain').value),note:document.getElementById('period-note').value.trim()};
      await saveEntry(entry); closeSheet(); showToast('Menstruación guardada.'); return;
    }
    if(e.target.id==='med-form'){
      const id=document.getElementById('med-select')?.value; if(!id){showToast('Añade o selecciona un medicamento.');return;}
      const entry={id:e.target.dataset.entryId||uid('entry'),type:'med',date:e.target.dataset.date,time:document.getElementById('med-time').value,medId:id,dose:document.getElementById('med-dose').value.trim(),note:document.getElementById('med-note').value.trim()};
      await saveEntry(entry); closeSheet(); showToast('Medicamento guardado.'); return;
    }
  });

  document.getElementById('correlations-list').addEventListener('click',e=>{const b=e.target.closest('[data-correlation-index]');if(b){const c=state.lastCorrelations?.[Number(b.dataset.correlationIndex)];if(c)showCorrelationDetail(c);}});
}

async function init(){
  try{
    state.db=await openDB(); await loadData(); applySettings(); bindEvents(); renderCalendar(); renderSettingsState();
    if(localStorage.getItem('atria_trusted')==='1') showMain(); else showLock();
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }catch(err){ console.error(err); document.body.innerHTML='<div style="padding:30px;font-family:sans-serif">Atria no ha podido iniciar el almacenamiento local. Prueba a recargar la página.</div>'; }
}

init();
