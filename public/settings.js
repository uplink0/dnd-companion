(() => {
  const THEME_KEY = 'dnd.theme';
  const THEMES = ['system', 'dark', 'light'];
  const applyTheme = (theme) => {
    const value = THEMES.includes(theme) ? theme : 'system';
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value === 'system' ? 'dark light' : value;
  };
  const savedTheme = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(savedTheme);

  const renderSettings = () => {
    const app = document.querySelector('#app');
    const crumb = document.querySelector('#crumb');
    if (!app || !location.hash.startsWith('#settings')) return;
    app.innerHTML = `<header class="page-head"><div><div class="eyebrow">Настройки</div><h1>Настройки</h1><p>Параметры интерфейса D&D Realm сохраняются в этом браузере.</p></div></header><section class="panel" style="padding:24px;max-width:760px"><div class="panel-title">Тема интерфейса</div><div class="settings-options" role="radiogroup" aria-label="Тема интерфейса"><button type="button" data-theme-choice="system">Системная</button><button type="button" data-theme-choice="dark">Тёмная</button><button type="button" data-theme-choice="light">Светлая</button></div></section>`;
    if (crumb) crumb.textContent = 'Настройки';
    const sync = () => document.querySelectorAll('[data-theme-choice]').forEach((button) => button.classList.toggle('active', button.dataset.themeChoice === (localStorage.getItem(THEME_KEY) || 'system')));
    document.querySelectorAll('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => { localStorage.setItem(THEME_KEY, button.dataset.themeChoice); applyTheme(button.dataset.themeChoice); sync(); }));
    sync();
  };

  const bindTopActions = () => {
    const buttons = document.querySelectorAll('.top-actions > button');
    if (buttons[0]) buttons[0].onclick = () => { location.hash = 'handbook'; };
    if (buttons[1]) buttons[1].onclick = () => { location.hash = 'settings'; };
  };

  window.addEventListener('dnd:page-rendered', (event) => {
    bindTopActions();
    if (event.detail?.page === 'settings') renderSettings();
  });
  window.addEventListener('hashchange', () => { bindTopActions(); if (location.hash.startsWith('#settings')) setTimeout(renderSettings, 0); });
  window.addEventListener('DOMContentLoaded', bindTopActions);
})();
