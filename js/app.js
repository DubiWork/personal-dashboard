document.addEventListener('DOMContentLoaded', async () => {
  await DataStore.init();

  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      $$('.nav-tab').forEach(t => t.classList.remove('active'));
      $$('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      $(`#view-${tab.dataset.view}`).classList.add('active');
      const view = tab.dataset.view;
      if (view === 'daily-log' && typeof DailyLog !== 'undefined') {
        await DailyLog.render();
      } else if (view === 'stats' && typeof Stats !== 'undefined') {
        await Stats.render();
      } else if (view === 'kanban' && typeof Kanban !== 'undefined') {
        Kanban.render();
      } else if (view === 'goals' && typeof Goals !== 'undefined') {
        Goals.render();
      }
    });
  });

  // Settings modal
  const settingsOverlay = $('#settings-overlay');
  const settingsTokenInput = $('#settings-token-input');
  const settingsTokenStatus = $('#settings-token-status');

  function openSettings() {
    const token = localStorage.getItem('gh_token');
    settingsTokenStatus.textContent = token ? 'Token is set' : 'No token set';
    settingsTokenStatus.className = 'settings-token-status ' + (token ? 'token-set' : 'token-missing');
    settingsTokenInput.value = '';
    settingsOverlay.classList.remove('hidden');
    requestAnimationFrame(() => settingsOverlay.classList.add('open'));
  }

  function closeSettings() {
    settingsOverlay.classList.remove('open');
    settingsOverlay.addEventListener('transitionend', () => {
      settingsOverlay.classList.add('hidden');
    }, { once: true });
  }

  $('#btn-settings').addEventListener('click', openSettings);
  $('#settings-close-btn').addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  $('#settings-save-token').addEventListener('click', () => {
    const val = settingsTokenInput.value.trim();
    if (!val) return;
    localStorage.setItem('gh_token', val);
    showToast('Token saved');
    closeSettings();
  });

  $('#settings-clear-token').addEventListener('click', () => {
    localStorage.removeItem('gh_token');
    showToast('Token cleared');
    closeSettings();
  });

  if (typeof Kanban !== 'undefined') Kanban.render();
  if (typeof Goals !== 'undefined') Goals.render();
});
