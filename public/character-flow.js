(() => {
  const CAMPAIGN_ID = '10000000-0000-4000-8000-000000000001';
  const ACTIVE_KEY = 'dnd.activeCharacterId';
  const BASE_POINTS = 72;
  const app = document.querySelector('#app');
  const crumb = document.querySelector('#crumb');
  const esc = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));
  const fmt = (value) => new Intl.NumberFormat('ru-RU').format(Number(value || 0));
  const activeId = () => localStorage.getItem(ACTIVE_KEY) || null;
  const setActive = (id) => {
    localStorage.setItem(ACTIVE_KEY, id);
    window.dispatchEvent(new CustomEvent('dnd:active-character-changed', { detail: { id } }));
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path.startsWith('/api/') ? path : `/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  };
  const statList = [['str','СИЛ'],['dex','ЛОВ'],['con','ТЕЛ'],['int','ИНТ'],['wis','МДР'],['cha','ХАР']];
  const colors = {'Элдрик':['#345c72','#0c2937','✦'],'Лира':['#6d4842','#251c22','☾'],'Бром':['#6b533b','#272119','⚒'],'Селена':['#56506e','#211e30','☼']};
  let options = null;

  const ensureOptions = async () => {
    if (!options) options = await api('/characters/options');
    return options;
  };

  const bonusMap = (race, className) => {
    const raceBonus = options?.races?.[race] || {};
    const classBonus = options?.classes?.[className]?.bonuses || {};
    return Object.fromEntries(statList.map(([key]) => [key, (raceBonus[key] || 0) + (classBonus[key] || 0)]));
  };

  const modifier = (score) => Math.floor((Number(score) - 10) / 2);
  const mods = (abilities) => statList.map(([key,label]) => ({ key, label, score: Number(abilities?.[key] || 0), mod: modifier(abilities?.[key] || 0) >= 0 ? `+${modifier(abilities?.[key] || 0)}` : String(modifier(abilities?.[key] || 0)) }));
  const visual = (character, big = false) => {
    const [a,b,rune] = colors[character.name] || ['#3b5360','#0d202c','✦'];
    return `<div class="${big ? 'character-big-visual' : 'hero-visual'}" style="--hero-a:${a};--hero-b:${b};--a:${a};--b:${b}" data-rune="${rune}">${big ? `<span class="character-big-rune">${rune}</span>` : ''}</div>`;
  };

  const characterCard = (character) => {
    const selected = character.id === activeId();
    const percent = character.hp_max ? Math.round(character.hp / character.hp_max * 100) : 0;
    return `<article class="card character-card ${selected ? 'selected' : ''}" data-character-id="${esc(character.id)}" tabindex="0" role="button">
      ${selected ? '<span class="character-badge">Текущий герой</span>' : ''}
      ${visual(character)}
      <div class="card-body">
        <h3>${esc(character.name)}</h3>
        <div class="meta">${esc(character.class_name)} · ${character.level} уровень</div>
        <div class="stat-row"><span>Здоровье</span><b>${character.hp} / ${character.hp_max}</b></div>
        <div class="bar"><span style="width:${percent}%"></span></div>
        <div class="tags"><span class="tag">${esc(character.race)}</span><span class="tag">Ур. ${character.level}</span><span class="tag">Игрок</span></div>
        <div class="character-open-hint"><span>Открыть лист персонажа</span><strong>→</strong></div>
      </div>
    </article>`;
  };

  const addCard = () => '<article class="card add-character-card" data-add-character tabindex="0"><div class="add-character-plus">+</div><div class="add-character-label">добавить героя</div></article>';

  async function listCharacters() {
    try {
      const characters = await api(`/campaigns/${CAMPAIGN_ID}/characters`);
      app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Текущая партия</div><h1>Персонажи</h1><p>Выбери героя, чтобы открыть его личный лист и продолжить игру с его историей.</p></div></header><section class="grid characters">${characters.map(characterCard).join('')}${addCard()}</section>`;
      crumb.textContent = 'Персонажи';
      wireCards();
      const add = document.querySelector('[data-add-character]');
      add.onclick = () => renderCreator();
      add.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); renderCreator(); } };
    } catch (error) {
      app.innerHTML = `<div class="panel" style="padding:24px">Не удалось загрузить персонажей: ${esc(error.message)}</div>`;
    }
  }

  function normalizeBaseAbilities(input = {}) {
    const abilities = Object.fromEntries(statList.map(([key]) => [key, Math.min(18, Math.max(1, Number(input[key] ?? 1)))]));
    let total = statList.reduce((sum, [key]) => sum + abilities[key], 0);
    while (total > BASE_POINTS) {
      const key = [...statList].map(([name]) => name).sort((a,b) => abilities[b] - abilities[a]).find((name) => abilities[name] > 1);
      if (!key) break;
      abilities[key] -= 1;
      total -= 1;
    }
    while (total < BASE_POINTS) {
      const key = [...statList].map(([name]) => name).filter((name) => abilities[name] < 18).sort((a,b) => abilities[a] - abilities[b])[0];
      if (!key) break;
      abilities[key] += 1;
      total += 1;
    }
    return abilities;
  }

  function readAbilities() {
    return Object.fromEntries(Array.from(document.querySelectorAll('.stat-input')).map((input) => [input.dataset.stat, Number(input.value)]));
  }

  function clampEditedStat(input) {
    if (!input) return;
    let value = Number(input.value);
    if (!Number.isFinite(value)) value = 1;
    value = Math.trunc(value);
    value = Math.min(18, Math.max(1, value));

    const othersTotal = statList.reduce((sum, [key]) => {
      if (key === input.dataset.stat) return sum;
      return sum + Number(document.querySelector(`.stat-input[data-stat="${key}"]`)?.value || 0);
    }, 0);

    const maxAllowed = Math.min(18, BASE_POINTS - othersTotal);
    input.value = String(Math.max(1, Math.min(value, maxAllowed)));
  }

  function creatorMarkup(draft = {}) {
    const races = Object.keys(options?.races || {});
    const classes = Object.keys(options?.classes || {});
    const race = draft.race || races[0] || 'Человек';
    const className = draft.className || classes[0] || 'Воин';
    const abilities = normalizeBaseAbilities(draft.baseAbilities || draft.abilities || {str:12,dex:12,con:12,int:12,wis:12,cha:12});
    const total = statList.reduce((sum,[key]) => sum + Number(abilities[key] || 0), 0);
    return `<div class="character-creator">
      <div class="character-detail-top"><button class="back-button" id="creatorBack">← Назад к персонажам</button><div class="creator-total"><b id="statTotal">${total}</b> / ${BASE_POINTS} очка</div></div>
      <section class="panel creator-panel">
        <div class="eyebrow">Новый герой</div><h1>Создание персонажа</h1>
        <p class="creator-help">На 1 уровне у героя ровно 72 базовых очка. Каждый базовый стат — от 1 до 18. Пока одно значение повышается, свободных очков автоматически становится меньше, поэтому невозможно поднять несколько характеристик до 18 и превысить общий лимит. Бонусы расы и класса считаются отдельно.</p>
        <div class="creator-grid">
          <label>Имя<input id="heroName" maxlength="80" value="${esc(draft.name || '')}" placeholder="Имя персонажа"></label>
          <label>Раса<select id="heroRace">${races.map(value => `<option ${race === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
          <label>Класс<select id="heroClass">${classes.map(value => `<option ${className === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
          <label>Предыстория<input id="heroBackground" maxlength="120" value="${esc(draft.background || '')}" placeholder="Например: Искатель древностей"></label>
        </div>
        <div class="stat-editor"><div class="panel-title">Характеристики <span>база 1–18</span></div>
          <div class="creator-stats">${statList.map(([key,label]) => `<label><span>${label}</span><input class="stat-input" data-stat="${key}" type="number" min="1" max="18" value="${Number(abilities[key] || 1)}"><small id="mod-${key}"></small></label>`).join('')}</div>
        </div>
        <div class="creator-actions"><button class="btn" id="generateHero">✦ Сгенерировать персонажа полностью</button><button class="btn gold" id="saveHero">Создать героя</button></div>
        <div id="creatorError" class="creator-error" hidden></div><div class="creator-preview" id="creatorPreview"></div>
      </section>
    </div>`;
  }

  function updateCreator() {
    const race = document.querySelector('#heroRace')?.value;
    const className = document.querySelector('#heroClass')?.value;
    const abilities = readAbilities();
    const bonuses = bonusMap(race, className);
    const total = statList.reduce((sum,[key]) => sum + abilities[key], 0);
    const totalElement = document.querySelector('#statTotal');
    if (totalElement) { totalElement.textContent = total; totalElement.classList.toggle('invalid', total !== BASE_POINTS); }
    statList.forEach(([key]) => {
      const element = document.querySelector(`#mod-${key}`);
      if (!element) return;
      const final = abilities[key] + bonuses[key];
      const mod = modifier(final);
      element.innerHTML = `<b>${final}</b> <span class="ability-mod">${mod >= 0 ? `+${mod}` : mod}</span>`;
    });
    const preview = document.querySelector('#creatorPreview');
    if (preview) preview.innerHTML = `<strong>${esc(document.querySelector('#heroName')?.value.trim() || 'Новый герой')}</strong><span>${esc(race)} · ${esc(className)}</span><span>Базовые очки: ${total}/${BASE_POINTS}</span><div class="bonus-preview">Бонусы расы и класса: ${statList.filter(([key]) => bonuses[key]).map(([key,label]) => `${label} +${bonuses[key]}`).join(' · ') || 'нет'}</div>`;
  }

  const show = (message) => {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__characterToast);
    window.__characterToast = setTimeout(() => toast.classList.remove('show'), 2500);
  };

  async function renderCreator(draft = {}) {
    try {
      await ensureOptions();
      app.innerHTML = creatorMarkup(draft);
      crumb.textContent = 'Создание героя';
      document.querySelector('#creatorBack').onclick = () => { location.hash = 'characters'; };
      document.querySelectorAll('.stat-input').forEach((input) => {
        input.addEventListener('input', () => {
          clampEditedStat(input);
          updateCreator();
        });
        input.addEventListener('change', () => {
          clampEditedStat(input);
          updateCreator();
        });
      });
      document.querySelector('#heroName').addEventListener('input', updateCreator);
      document.querySelector('#heroRace').onchange = updateCreator;
      document.querySelector('#heroClass').onchange = updateCreator;
      document.querySelector('#generateHero').onclick = async () => {
        try { renderCreator(await api('/characters/generate', { method: 'POST', body: '{}' })); }
        catch (error) { show(error.message); }
      };
      document.querySelector('#saveHero').onclick = createCharacter;
      updateCreator();
    } catch (error) {
      app.innerHTML = `<div class="panel" style="padding:24px">Не удалось открыть создание персонажа: ${esc(error.message)}</div>`;
    }
  }

  async function createCharacter() {
    const errorBox = document.querySelector('#creatorError');
    try {
      document.querySelectorAll('.stat-input').forEach(clampEditedStat);
      updateCreator();
      const abilities = readAbilities();
      const total = statList.reduce((sum,[key]) => sum + abilities[key], 0);
      if (total !== BASE_POINTS) throw new Error(`Нужно ровно ${BASE_POINTS} базовых очка. Сейчас: ${total}`);
      const invalid = statList.find(([key]) => !Number.isInteger(abilities[key]) || abilities[key] < 1 || abilities[key] > 18);
      if (invalid) throw new Error(`База ${invalid[1]} должна быть целым числом от 1 до 18`);
      const name = document.querySelector('#heroName').value.trim();
      if (name.length < 2) throw new Error('Укажите имя персонажа минимум из 2 символов');
      const character = await api('/characters', {
        method: 'POST',
        body: JSON.stringify({ campaignId: CAMPAIGN_ID, name, race: document.querySelector('#heroRace').value, className: document.querySelector('#heroClass').value, background: document.querySelector('#heroBackground').value.trim(), abilities })
      });
      setActive(character.id);
      location.hash = `character/${encodeURIComponent(character.id)}`;
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    }
  }

  async function renderDetail(id) {
    try {
      const [character, events, messages, journal] = await Promise.all([
        api(`/characters/${encodeURIComponent(id)}/summary?campaignId=${encodeURIComponent(CAMPAIGN_ID)}`),
        api(`/campaigns/${CAMPAIGN_ID}/events?characterId=${encodeURIComponent(id)}`),
        api(`/campaigns/${CAMPAIGN_ID}/messages?characterId=${encodeURIComponent(id)}`),
        api(`/campaigns/${CAMPAIGN_ID}/journal?characterId=${encodeURIComponent(id)}`)
      ]);
      const abilities = mods(character.abilities);
      const active = id === activeId();
      app.innerHTML = `<div class="character-detail">
        <div class="character-detail-top"><button class="back-button" id="detailBack">← Назад к персонажам</button><button class="start-game" id="startGame">${active ? 'Продолжить игру' : 'Начать игру'}</button></div>
        <section class="character-detail-hero"><div class="panel">${visual(character,true)}</div><div class="panel character-identity-panel"><div class="eyebrow">${active ? 'Активный герой' : 'Лист персонажа'}</div><h1>${esc(character.name)}</h1><div class="subtitle">${esc(character.class_name)} · ${esc(character.race)} · ${character.level} уровень</div><p class="bio">${esc(character.biography || 'История героя ещё не записана.')}</p><div class="character-tags"><span class="tag">Игрок</span><span class="tag">Ранг: ${esc(character.rank || '—')}</span><span class="tag">XP ${fmt(character.xp)} / ${fmt(character.xp_next)}</span></div></div></section>
        <section class="detail-grid">
          <article class="panel"><div class="panel-title">Характеристики <span>БМ +${character.proficiency_bonus}</span></div><div class="ability-grid">${abilities.map((value) => `<div class="ability-cell"><span class="ability-name">${value.label}</span><strong class="ability-score">${value.score}</strong><span class="ability-mod">${value.mod}</span></div>`).join('')}</div></article>
          <article class="panel"><div class="panel-title">Последние события героя</div><div class="event-list">${(events || []).slice(-8).reverse().map((event) => `<div class="event-row"><i class="event-dot"></i><div><strong>${esc(event.event_type)}</strong><p>${esc(JSON.stringify(event.payload || {}))}</p></div></div>`).join('') || '<div class="state-note">У героя пока нет записанных событий.</div>'}</div></article>
          <article class="panel"><div class="panel-title">История чата</div><div class="event-list">${(messages || []).slice(-6).reverse().map((message) => `<div class="event-row"><i class="event-dot"></i><div><strong>${message.role === 'PLAYER' ? 'Игрок' : 'Мастер'}</strong><p>${esc(message.body)}</p></div></div>`).join('') || '<div class="state-note">История пока пуста.</div>'}</div></article>
          <article class="panel"><div class="panel-title">Личная летопись</div><div class="event-list">${(journal || []).slice(0,6).map((entry) => `<div class="event-row"><i class="event-dot"></i><div><strong>${esc(entry.title)}</strong><p>${esc(entry.body)}</p></div></div>`).join('') || '<div class="state-note">Записей пока нет.</div>'}</div></article>
        </section>
      </div>`;
      document.querySelector('#detailBack').onclick = () => { location.hash = 'characters'; };
      document.querySelector('#startGame').onclick = () => { setActive(id); location.hash = 'chat'; };
      crumb.textContent = character.name;
    } catch (error) {
      app.innerHTML = `<div class="panel" style="padding:24px">Ошибка загрузки: ${esc(error.message)}</div>`;
    }
  }

  function wireCards() {
    document.querySelectorAll('.character-card').forEach((card) => {
      const open = () => { location.hash = `character/${encodeURIComponent(card.dataset.characterId)}`; };
      card.onclick = open;
      card.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
    });
  }

  async function route() {
    const hash = location.hash || '#chat';
    if (hash === '#characters') return listCharacters();
    const match = hash.match(/^#character\/([^/]+)$/);
    if (match) return renderDetail(decodeURIComponent(match[1]));
    return false;
  }

  window.dndCharacterFlowRoute = route;
  window.addEventListener('hashchange', () => setTimeout(route, 0));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(route, 0));
  else setTimeout(route, 0);
})();
