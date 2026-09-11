const CAMPAIGN_ID='10000000-0000-4000-8000-000000000001';
const ACTIVE_KEY='dnd.activeCharacterId';
const navItems=[['chat','▱','Чат с Мастером'],['characters','♙','Персонажи'],['map','⌑','Карта'],['journal','▤','Журнал'],['bestiary','♞','Бестиарий'],['items','♢','Предметы'],['handbook','▥','Справочник']];
const nav=document.querySelector('#nav');
const app=document.querySelector('#app');
const crumb=document.querySelector('#crumb');
const esc=(value)=>String(value??'').replace(/[&<>\"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value)=>new Intl.NumberFormat('ru-RU').format(Number(value||0));
const activeId=()=>localStorage.getItem(ACTIVE_KEY)||null;
const api=async(path,options={})=>{const response=await fetch(path.startsWith('/api/')?path:`/api${path}`,{headers:{'Content-Type':'application/json'},...options});const data=await response.json();if(!response.ok)throw new Error(data.error||'Ошибка сервера');return data};
nav.innerHTML=navItems.map(([id,icon,label])=>`<button class="nav-link" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');

function head(kicker,title,sub){
  return `<header class="page-head"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></header>`;
}

async function bootstrap(){
  const id=activeId();
  return api(`/bootstrap?campaignId=${encodeURIComponent(CAMPAIGN_ID)}${id?`&characterId=${encodeURIComponent(id)}`:''}`);
}

function chat(){
  return `<section class="chat-layout">
    <article class="panel chat-panel">
      <header class="chat-head"><div class="master-seal">✣</div><div><strong>ИИ-Мастер</strong><span>Ведущий текущей кампании</span></div></header>
      <div class="messages" id="messages"></div>
      <form class="composer" id="composer"><span class="spark">✦</span><input id="chatInput" aria-label="Сообщение Мастеру" placeholder="Напишите сообщение Мастеру…" autocomplete="off"><button class="send" aria-label="Отправить">➤</button></form>
      <section class="hero-summary"><div class="hero-identity"><span class="hero-avatar">?</span><div><span class="summary-label">Активный герой</span><h2>Персонаж не выбран</h2><p>Выберите героя в разделе «Персонажи».</p><div class="identity-tags"></div></div></div><div class="hero-stats"><div class="hero-stat hp"><span class="stat-icon">♥</span><span><small>HP</small><strong>—</strong></span></div><div class="hero-stat"><span class="stat-icon">♜</span><span><small>AC</small><strong>—</strong></span></div><div class="hero-stat"><span class="stat-icon">✦</span><span><small>LVL</small><strong>—</strong></span></div><div class="hero-stat"><span class="stat-icon">◈</span><span><small>EXP</small><strong>—</strong></span></div></div></section>
    </article>
    <aside class="chat-side">
      <section class="panel"><div class="panel-title">♟ Текущая партия</div><div class="party-list"></div></section>
      <section class="panel"><div class="panel-title">◉ Инициатива</div><div class="initiative"><div class="state-note">Инициатива появляется после начала боя.</div></div></section>
      <section class="panel location-card"><div class="panel-title">⌖ Локация</div><div class="current-location"><div class="state-note">Локация пока не выбрана.</div></div></section>
      <section class="panel quick"><div class="panel-title">ϟ Быстрые действия</div><button data-roll="1d20">◇ Бросить d20</button><button data-page="bestiary">♞ Открыть бестиарий</button><button data-page="journal">▤ Открыть журнал</button></section>
    </aside>
  </section>`;
}

async function map(){
  const data=await bootstrap();
  const locations=data.locations||[];
  const points=locations.map((location,index)=>`<span class="map-label" style="left:${Number(location.x||20)}%;top:${Number(location.y||20)}%">${esc(location.name)}</span><i class="pin" style="left:${Number(location.x||20)}%;top:${Number(location.y||20)}%"></i>`).join('');
  const list=locations.map((location)=>`<div class="list-item"><i class="bullet"></i>${esc(location.name)}${location.visited?' · посещено':''}</div>`).join('')||'<div class="state-note">Пока нет открытых локаций.</div>';
  return head('Кампания','Карта мира','Только локации, открытые текущей кампанией')+`<section class="grid map-layout"><div class="panel map">${points||'<div class="state-note" style="padding:24px">Карта пока пуста.</div>'}</div><aside class="stack"><div class="panel"><div class="panel-title">Открытые места <span>${locations.length}</span></div><div class="list">${list}</div></div><div class="panel"><div class="panel-title">Легенда</div><div class="list"><div class="list-item"><i class="bullet"></i>Открыто</div><div class="list-item"><i class="bullet" style="background:#6d8aa1"></i>Известно</div></div></div></aside></section>`;
}

async function journal(){
  const data=await bootstrap();
  const entries=data.journal||[];
  const chapters=entries.slice(0,8).map((entry,index)=>`<div class="chapter ${index===0?'active':''}">${esc(entry.title||`Запись ${index+1}`)}</div>`).join('')||'<div class="state-note">Личная летопись пока пуста.</div>';
  const content=entries[0]
    ? `<span class="entry-date">${new Date(entries[0].created_at).toLocaleString('ru-RU')}</span><h2>${esc(entries[0].title)}</h2><p>${esc(entries[0].body)}</p><div class="tags">${(entries[0].tags||[]).map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}</div>`
    : `<div class="state-note">Записей пока нет. Они появятся после игровых событий.</div>`;
  return head('Летопись','Журнал','История, связанная с текущим героем и кампанией')+`<section class="grid journal-layout"><aside class="panel"><div class="panel-title">Записи <span>${entries.length}</span></div><div class="chapter-list">${chapters}</div></aside><article class="panel entry">${content}</article></section>`;
}

async function catalog(type){
  const data=await bootstrap();
  if(type==='bestiary'){
    const creatures=data.bestiary||[];
    return head('Знания героя','Бестиарий','Сведения, изученные текущим персонажем')+`<section class="grid catalog">${creatures.map((creature)=>`<article class="card catalog-card"><div class="creature-icon">♞</div><div><h3>${esc(creature.name)}</h3><div class="meta">${esc(creature.creature_type||'Существо')} · CR ${esc(creature.challenge_rating??'—')}</div><p>${esc((creature.facts||[]).join(' · ')||'Подробности ещё не изучены.')}</p><span class="tag rare">${esc(creature.level)}</span></div></article>`).join('')||'<div class="panel state-note" style="padding:24px">Бестиарий текущего героя пока пуст.</div>'}</section>`;
  }
  const inventory=data.character?.inventory||[];
  return head('Личный инвентарь','Предметы','Предметы принадлежат выбранному герою')+`<section class="grid catalog">${inventory.map((item)=>`<article class="card catalog-card"><div class="item-icon">◇</div><div><h3>${esc(item.name)}</h3><div class="meta">${esc(item.item_type)} · ${esc(item.rarity)}</div><p>${esc(item.description||'Описание отсутствует.')}</p><span class="tag ${item.equipped?'rare':'common'}">${item.quantity} шт.${item.equipped?' · экипировано':''}</span></div></article>`).join('')||'<div class="panel state-note" style="padding:24px">У выбранного героя пока нет предметов.</div>'}</section>`;
}

function handbook(){
  return head('Книга игрока','Справочник','Правила и подсказки для игры')+`<section class="grid handbook"><aside class="panel toc"><div class="search"><input placeholder="Найти правило…" /></div><h4>Основы</h4><button class="active">Проверки характеристик</button><button>Преимущество</button><button>Отдых и лечение</button><h4>Бой</h4><button>Порядок хода</button><button>Действия</button><button>Укрытия</button><h4>Магия</h4><button>Ячейки заклинаний</button><button>Концентрация</button></aside><article class="panel article"><div class="eyebrow">Основы</div><h2>Проверки характеристик</h2><p>Когда персонаж пытается совершить действие с неопределённым исходом, Мастер может назначить проверку характеристики.</p><div class="rule-box"><strong>Формула проверки</strong><p><span class="dice"><span>d20</span></span> + модификатор характеристики + бонус мастерства</p></div><h3>Сложность проверки</h3><p>Мастер выбирает класс сложности (КС). Если итоговый результат равен или выше КС, проверка успешна.</p><div class="list"><div class="list-item"><span class="tag">КС 10</span> Простая задача</div><div class="list-item"><span class="tag">КС 15</span> Задача средней сложности</div><div class="list-item"><span class="tag">КС 20</span> Трудная задача</div></div></article></section>`;
}

const renders={chat,map,journal,bestiary:()=>catalog('bestiary'),items:()=>catalog('items'),handbook};

async function render(){
  const page=location.hash.slice(1)||'chat';
  const characterRoute=page==='characters'||page.startsWith('character/');
  document.querySelectorAll('.nav-link').forEach((link)=>link.classList.toggle('active',link.dataset.page===page.split('/')[0]));
  if(characterRoute&&window.dndCharacterFlowRoute){await window.dndCharacterFlowRoute();return;}
  const renderer=renders[page]||renders.chat;
  try{
    app.innerHTML=await renderer();
    const item=navItems.find((entry)=>entry[0]===page);
    crumb.textContent=page==='chat'?'Чат с Мастером':(item?.[2]||'Кампания');
    app.focus({preventScroll:true});
    wire();
    window.dispatchEvent(new CustomEvent('dnd:page-rendered',{detail:{page}}));
  }catch(error){
    app.innerHTML=`<div class="panel" style="padding:24px"><strong>Ошибка загрузки раздела</strong><p>${esc(error.message)}</p></div>`;
    crumb.textContent='Ошибка';
    window.dispatchEvent(new CustomEvent('dnd:page-rendered',{detail:{page:'error'}}));
  }
}

function wire(){
  document.querySelectorAll('.quick [data-page]').forEach((button)=>button.onclick=()=>{location.hash=button.dataset.page;});
  document.querySelectorAll('[data-roll]').forEach((button)=>button.onclick=async()=>{
    const characterId=activeId();
    if(!characterId){show('Сначала выберите активного героя.');return;}
    try{const result=await api(`/campaigns/${CAMPAIGN_ID}/rolls`,{method:'POST',body:JSON.stringify({characterId,notation:button.dataset.roll,reason:'Быстрый бросок'})});show(`Выпало: ${result.total}`);}catch(error){show(error.message);}
  });
  document.querySelectorAll('.toc button').forEach((button)=>button.onclick=()=>{button.parentElement.querySelectorAll('button').forEach((item)=>item.classList.remove('active'));button.classList.add('active');});
}
function show(message){const toast=document.querySelector('#toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>toast.classList.remove('show'),2200);}
nav.onclick=(event)=>{const button=event.target.closest('[data-page]');if(button)location.hash=button.dataset.page;};
window.addEventListener('hashchange',()=>render());
render();
