(() => {
  const CAMPAIGN_ID = '10000000-0000-4000-8000-000000000001';
  const ACTIVE_KEY = 'dnd.activeCharacterId';
  const DEFAULT_ID = '30000000-0000-4000-8000-000000000001';
  const app = document.querySelector('#app');
  const crumb = document.querySelector('#crumb');
  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (value) => new Intl.NumberFormat('ru-RU').format(Number(value || 0));
  const activeId = () => localStorage.getItem(ACTIVE_KEY) || DEFAULT_ID;
  const setActive = (id) => localStorage.setItem(ACTIVE_KEY, id);
  const colors = {
    'Элдрик':['#345c72','#0c2937','✦'], 'Лира':['#6d4842','#251c22','☾'],
    'Бром':['#6b533b','#272119','⚒'], 'Селена':['#56506e','#211e30','☼']
  };

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, { headers:{'Content-Type':'application/json'}, ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  }

  function mods(abilities) {
    return [['СИЛ','str'],['ЛОВ','dex'],['ТЕЛ','con'],['ИНТ','int'],['МДР','wis'],['ХАР','cha']].map(([label,key]) => {
      const score = Number(abilities?.[key] ?? 10);
      const mod = Math.floor((score - 10) / 2);
      return { label, score, mod: mod >= 0 ? `+${mod}` : String(mod) };
    });
  }

  function visual(c, big = false) {
    const [a,b,rune] = colors[c.name] || ['#3b5360','#0d202c','✦'];
    return `<div class="${big?'character-big-visual':'hero-visual'}" style="--hero-a:${a};--hero-b:${b};--a:${a};--b:${b}" data-rune="${rune}">${big?`<span class="character-big-rune">${rune}</span>`:''}</div>`;
  }

  function characterCard(c) {
    const selected = c.id === activeId();
    const pct = c.hp_max ? Math.round((c.hp / c.hp_max) * 100) : 0;
    return `<article class="card character-card ${selected?'selected':''}" data-character-id="${esc(c.id)}" tabindex="0" role="button" aria-label="Открыть персонажа ${esc(c.name)}">
      ${selected?'<span class="character-badge">Текущий герой</span>':''}
      ${visual(c)}
      <div class="card-body"><h3>${esc(c.name)}</h3><div class="meta">${esc(c.class_name)} · ${c.level} уровень</div>
        <div class="stat-row"><span>Здоровье</span><b>${c.hp} / ${c.hp_max}</b></div><div class="bar"><span style="width:${pct}%"></span></div>
        <div class="tags"><span class="tag">${esc(c.race)}</span><span class="tag">Ур. ${c.level}</span><span class="tag">${c.kind==='PLAYER'?'Игрок':'Союзник'}</span></div>
        <div class="character-open-hint"><span>Открыть лист персонажа</span><strong>→</strong></div>
      </div></article>`;
  }

  async function listCharacters() {
    if (!app) return;
    try {
      const chars = await api(`/campaigns/${CAMPAIGN_ID}/characters`);
      app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Текущая партия</div><h1>Персонажи</h1><p>Выбери героя, чтобы открыть его личный лист и продолжить игру с его историей.</p></div><div class="actions"><button class="btn">•••</button><button class="btn gold" data-character-create>Создать героя</button></div></header>
        <section class="grid characters">${chars.map(characterCard).join('')}</section>`;
      crumb.textContent='Персонажи';
      wireCharacterCards();
      document.querySelector('[data-character-create]')?.addEventListener('click',()=>show('Создание нового героя подключим к той же системе состояния кампании.'));
    } catch (error) { app.innerHTML=`<div class="panel" style="padding:24px">Не удалось загрузить персонажей: ${esc(error.message)}</div>`; }
  }

  async function renderDetail(id) {
    try {
      const [character, events, messages, journal] = await Promise.all([
        api(`/characters/${encodeURIComponent(id)}/summary`),
        api(`/campaigns/${CAMPAIGN_ID}/events?characterId=${encodeURIComponent(id)}`),
        api(`/campaigns/${CAMPAIGN_ID}/messages?characterId=${encodeURIComponent(id)}`),
        api(`/campaigns/${CAMPAIGN_ID}/journal?characterId=${encodeURIComponent(id)}`)
      ]);
      const abilities = mods(character.abilities);
      const active = id === activeId();
      const inventory = character.inventory || [];
      const effects = character.effects || [];
      const recentEvents = (events || []).slice(-8).reverse();
      const recentMessages = (messages || []).slice(-6).reverse();
      app.innerHTML = `<div class="character-detail">
        <div class="character-detail-top"><button class="back-button" data-back>← Назад к персонажам</button><button class="start-game" data-start>${active?'Продолжить игру':'Начать игру'}</button></div>
        <section class="character-detail-hero"><div class="panel">${visual(character,true)}</div><div class="panel character-identity-panel">
          <div class="eyebrow">${active?'Активный герой':'Лист персонажа'}</div><h1>${esc(character.name)}</h1><div class="subtitle">${esc(character.class_name)} · ${esc(character.race)} · ${character.level} уровень</div>
          <p class="bio">${esc(character.biography || 'История героя ещё не записана. Его дальнейший путь будет формироваться действиями игрока.')}</p>
          <div class="character-tags"><span class="tag">${esc(character.kind==='PLAYER'?'Персонаж игрока':'Союзник')}</span><span class="tag">Ранг: ${esc(character.rank || '—')}</span><span class="tag">XP ${fmt(character.xp)} / ${fmt(character.xp_next)}</span></div>
          <div class="character-stat-grid"><div class="character-stat hp"><span>Здоровье</span><strong>${character.hp} / ${character.hp_max}</strong></div><div class="character-stat"><span>КД</span><strong>${character.armor_class}</strong></div><div class="character-stat"><span>Скорость</span><strong>${character.speed} фт.</strong></div><div class="character-stat"><span>Инициатива</span><strong>${character.initiative>=0?`+${character.initiative}`:character.initiative}</strong></div></div>
        </div></section>
        <section class="detail-grid">
          <article class="panel"><div class="panel-title">Характеристики <span>${character.proficiency_bonus>=0?`БМ +${character.proficiency_bonus}`:''}</span></div><div class="ability-grid">${abilities.map(a=>`<div class="ability-cell"><span class="ability-name">${a.label}</span><strong class="ability-score">${a.score}</strong><span class="ability-mod">${a.mod}</span></div>`).join('')}</div>
            <div class="resource-grid"><div class="resource"><small>Пассивная внимательность</small><strong>${character.passivePerception}</strong></div><div class="resource"><small>КС заклинаний</small><strong>${character.spell_save_dc ?? '—'}</strong></div><div class="resource"><small>Атака заклинанием</small><strong>${character.spell_attack_bonus!=null?(character.spell_attack_bonus>=0?`+${character.spell_attack_bonus}`:character.spell_attack_bonus):'—'}</strong></div><div class="resource"><small>Вдохновение</small><strong>${character.inspiration?'Да':'Нет'}</strong></div></div>
          </article>
          <article class="panel"><div class="panel-title">Ресурсы и состояние <span>${character.bloodied?'Ниже половины HP':'Стабилен'}</span></div><div class="resource-grid"><div class="resource"><small>Временные HP</small><strong>${character.temp_hp}</strong></div><div class="resource"><small>Кости хитов</small><strong>${esc(character.hit_dice)}</strong></div><div class="resource"><small>Состояния</small><strong class="${effects.length?'danger-state':'success-state'}">${effects.length?esc(effects.map(e=>e.name).join(', ')):'В норме'}</strong></div><div class="resource"><small>Золото</small><strong>${fmt(character.currency?.gp || 0)} gp</strong></div></div><div class="state-note"><b>Важно:</b> этот лист является источником истины для выбранного героя. Все дальнейшие действия игры будут записываться относительно него.</div></article>
          <article class="panel"><div class="panel-title">Инвентарь <span>${inventory.length}</span></div><div class="inventory-list">${inventory.length?inventory.map(i=>`<div class="inventory-row"><div class="inventory-icon">◈</div><div class="inventory-main"><strong>${esc(i.name)} ×${i.quantity}</strong><small>${esc(i.rarity)} · ${esc(i.item_type)}</small></div></div>`).join(''):'<div class="state-note">Инвентарь пуст.</div>'}</div></article>
          <article class="panel"><div class="panel-title">Последние события героя <span>${events.length}</span></div><div class="event-list">${recentEvents.length?recentEvents.map(e=>`<div class="event-row"><i class="event-dot"></i><div><strong>${esc(e.event_type)}</strong><p>${esc(JSON.stringify(e.payload || {}))}</p><small>${new Date(e.created_at).toLocaleString('ru-RU')}</small></div></div>`).join(''):'<div class="state-note">У героя пока нет записанных событий.</div>'}</div></article>
          <article class="panel"><div class="panel-title">История чата <span>${messages.length}</span></div><div class="event-list">${recentMessages.length?recentMessages.map(m=>`<div class="event-row"><i class="event-dot"></i><div><strong>${m.role==='PLAYER'?'Игрок':'Мастер'}</strong><p>${esc(m.body)}</p><small>${new Date(m.created_at).toLocaleString('ru-RU')}</small></div></div>`).join(''):'<div class="state-note">История этого героя ещё пуста.</div>'}</div></article>
          <article class="panel"><div class="panel-title">Личная летопись <span>${journal.length}</span></div><div class="event-list">${journal.length?journal.slice(0,6).map(j=>`<div class="event-row"><i class="event-dot"></i><div><strong>${esc(j.title)}</strong><p>${esc(j.body)}</p><small>${new Date(j.created_at).toLocaleString('ru-RU')}</small></div></div>`).join(''):'<div class="state-note">Записей героя пока нет.</div>'}</div></article>
        </section></div>`;
      crumb.textContent = character.name;
      document.querySelector('[data-back]')?.addEventListener('click',()=>location.hash='characters');
      document.querySelector('[data-start]')?.addEventListener('click',()=>startGame(id));
    } catch(error) { app.innerHTML=`<div class="panel" style="padding:24px">Не удалось открыть героя: ${esc(error.message)}</div>`; }
  }

  function wireCharacterCards() {
    document.querySelectorAll('.character-card').forEach(card => {
      const open=()=>location.hash=`character/${encodeURIComponent(card.dataset.characterId)}`;
      card.addEventListener('click',open);
      card.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
  }

  function startGame(id) {
    setActive(id);
    location.hash='chat';
    location.reload();
  }

  function show(message){const t=document.querySelector('#toast');if(!t)return;t.textContent=message;t.classList.add('show');clearTimeout(window.__characterToast);window.__characterToast=setTimeout(()=>t.classList.remove('show'),2600)}

  async function route() {
    const hash = location.hash || '#chat';
    if (hash === '#characters') { await listCharacters(); return true; }
    const match = hash.match(/^#character\/([^/]+)$/);
    if (match) { await renderDetail(decodeURIComponent(match[1])); return true; }
    return false;
  }

  window.dndCharacterFlowRoute = route;
  window.addEventListener('hashchange', () => setTimeout(route, 0));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(route,0));
  else setTimeout(route,0);
})();
