document.addEventListener('DOMContentLoaded', async () => {
  await DataStore.init();

  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.nav-tab').forEach(t => t.classList.remove('active'));
      $$('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      $(`#view-${tab.dataset.view}`).classList.add('active');
    });
  });

  if (typeof Kanban !== 'undefined') Kanban.render();
  if (typeof Goals !== 'undefined') Goals.render();
});
