document.addEventListener('DOMContentLoaded', async () => {
  await DataStore.init();

  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      $$('.nav-tab').forEach(t => t.classList.remove('active'));
      $$('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      $(`#view-${tab.dataset.view}`).classList.add('active');
      if (tab.dataset.view === 'stats' && typeof Stats !== 'undefined') {
        await Stats.render();
      }
    });
  });

  if (typeof Kanban !== 'undefined') Kanban.render();
  if (typeof Goals !== 'undefined') Goals.render();
});
