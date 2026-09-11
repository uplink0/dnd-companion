(() => {
  const BASE_POINTS = 72;
  const STAT_KEYS = ['str','dex','con','int','wis','cha'];
  let simplifyQueued = false;

  const creatorExists = () => Boolean(document.querySelector('.character-creator'));

  function currentTotal() {
    return STAT_KEYS.reduce((sum, key) => {
      const value = Number(document.querySelector(`.stat-input[data-stat="${key}"]`)?.value || 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function enforceBudgetBeforeAppHandler(input) {
    if (!input?.classList.contains('stat-input')) return;

    let value = Math.trunc(Number(input.value));
    if (!Number.isFinite(value)) value = 1;
    value = Math.max(1, Math.min(18, value));

    const othersTotal = STAT_KEYS.reduce((sum, key) => {
      if (key === input.dataset.stat) return sum;
      const other = Number(document.querySelector(`.stat-input[data-stat="${key}"]`)?.value || 0);
      return sum + (Number.isFinite(other) ? other : 0);
    }, 0);

    // Character flow also has a client-side clamp, but this guard runs in capture
    // phase first, so a value that would push the base pool over 72 never reaches it.
    const maxAllowed = Math.min(18, BASE_POINTS - othersTotal);
    input.value = String(Math.max(1, Math.min(value, maxAllowed)));
  }

  function simplifyBonusDisplay() {
    if (!creatorExists()) return;

    document.querySelectorAll('.stat-input').forEach((input) => {
      const small = input.parentElement?.querySelector('small');
      const modifier = small?.querySelector('.ability-mod')?.textContent?.trim();
      if (small && modifier) small.textContent = modifier;
    });

    // Keep the visible total truthful. Saving is still server-validated at exactly 72.
    const total = currentTotal();
    const totalElement = document.querySelector('#statTotal');
    if (totalElement) {
      totalElement.textContent = total;
      totalElement.classList.toggle('invalid', total !== BASE_POINTS);
    }
  }

  function queueSimplify() {
    if (simplifyQueued) return;
    simplifyQueued = true;
    queueMicrotask(() => {
      simplifyQueued = false;
      simplifyBonusDisplay();
    });
  }

  document.addEventListener('input', (event) => {
    if (!creatorExists()) return;
    if (event.target?.classList.contains('stat-input')) {
      enforceBudgetBeforeAppHandler(event.target);
      queueSimplify();
    }
  }, true);

  document.addEventListener('change', (event) => {
    if (!creatorExists()) return;
    if (event.target?.classList.contains('stat-input')) {
      enforceBudgetBeforeAppHandler(event.target);
      queueSimplify();
    } else if (event.target?.id === 'heroRace' || event.target?.id === 'heroClass') {
      queueSimplify();
    }
  }, true);

  const app = document.querySelector('#app');
  if (app) {
    new MutationObserver(queueSimplify).observe(app, { childList: true, subtree: true });
  }
})();
