const Kanban = {
  _filter: 'all',
  _draggedId: null,
  _touchGhost: null,
  _touchTask: null,

  // Map between display status keys (used in data-status / CSS) and data store values
  _columns: [
    { key: 'todo',        dataStatus: 'todo',        label: 'To Do' },
    { key: 'in_progress', dataStatus: 'in-progress', label: 'In Progress' },
    { key: 'blocked',     dataStatus: 'blocked',     label: 'Blocked' },
    { key: 'done',        dataStatus: 'done',        label: 'Done' }
  ],

  render() {
    const view = $('#view-kanban');
    if (!view) return;

    view.innerHTML = `
      <div class="kanban-header">
        <h2>Task Board</h2>
        <button class="btn-add" id="btn-add-task">+ Add Task</button>
      </div>
      <div class="kanban-filters" id="kanban-filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="work">Work</button>
        <button class="filter-btn" data-filter="personal">Personal</button>
      </div>
      <div class="kanban-board" id="kanban-board"></div>
    `;

    const board = $('#kanban-board');
    this._columns.forEach(col => {
      const tasks = DataStore.getTasksByStatus(col.key);
      const colEl = document.createElement('div');
      colEl.className = 'kanban-column';
      colEl.dataset.status = col.key;

      const header = document.createElement('div');
      header.className = 'column-header';
      header.dataset.status = col.dataStatus;
      header.innerHTML = `
        <span class="column-title">${col.label}</span>
        <span class="column-count">${tasks.length}</span>
      `;

      const cardsContainer = document.createElement('div');
      cardsContainer.className = 'column-cards';
      cardsContainer.dataset.status = col.key;

      tasks.forEach(task => {
        cardsContainer.appendChild(this.renderCard(task));
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add-column';
      addBtn.textContent = '+ Add task';
      addBtn.addEventListener('click', () => this.showAddModal(col.key));

      colEl.appendChild(header);
      colEl.appendChild(cardsContainer);
      colEl.appendChild(addBtn);
      board.appendChild(colEl);
    });

    this.setupDragDrop();
    this.setupFilters();
    this._applyFilter(this._filter);

    $('#btn-add-task').addEventListener('click', () => this.showAddModal());
  },

  renderCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', 'true');
    card.dataset.id = task.id;
    card.dataset.category = task.category || 'work';

    const categoryClass = task.category === 'personal' ? 'badge-personal' : 'badge-work';
    const categoryLabel = task.category === 'personal' ? 'Personal' : 'Work';

    const tagsHtml = Array.isArray(task.tags) && task.tags.length
      ? `<div class="card-tags">${task.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
      : '';

    const jiraHtml = task.jiraId
      ? `<div class="card-jira">${task.jiraId}</div>`
      : '';

    const timeHtml = task.timeSpent
      ? `<div class="card-time">${task.timeSpent}</div>`
      : '';

    card.innerHTML = `
      <span class="card-category ${categoryClass}">${categoryLabel}</span>
      <div class="card-title">${task.title}</div>
      ${jiraHtml}
      ${timeHtml}
      ${tagsHtml}
      <div class="card-actions">
        <button class="btn-edit" data-id="${task.id}">Edit</button>
        <button class="btn-delete" data-id="${task.id}">Delete</button>
      </div>
    `;

    card.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      this.editTask(task.id);
    });
    card.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteTask(task.id);
    });

    // Touch drag events
    card.addEventListener('touchstart', (e) => this._onTouchStart(e, task.id), { passive: true });
    card.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    card.addEventListener('touchend', (e) => this._onTouchEnd(e));

    return card;
  },

  setupDragDrop() {
    const board = $('#kanban-board');
    if (!board) return;

    // Drag events on cards (delegated from board)
    board.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.task-card');
      if (!card) return;
      this._draggedId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.id);
    });

    board.addEventListener('dragend', (e) => {
      const card = e.target.closest('.task-card');
      if (card) card.classList.remove('dragging');
      this._draggedId = null;
      $$('.kanban-column.drag-over').forEach(col => col.classList.remove('drag-over'));
    });

    // Drop zone events on columns (delegated)
    board.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const col = e.target.closest('.kanban-column');
      if (col) {
        $$('.kanban-column.drag-over').forEach(c => {
          if (c !== col) c.classList.remove('drag-over');
        });
        col.classList.add('drag-over');
      }
    });

    board.addEventListener('dragleave', (e) => {
      const col = e.target.closest('.kanban-column');
      if (col && !col.contains(e.relatedTarget)) {
        col.classList.remove('drag-over');
      }
    });

    board.addEventListener('drop', (e) => {
      e.preventDefault();
      const col = e.target.closest('.kanban-column');
      if (!col) return;
      col.classList.remove('drag-over');

      const taskId = e.dataTransfer.getData('text/plain') || this._draggedId;
      if (!taskId) return;

      const newStatus = col.dataset.status;
      const task = DataStore.tasks.tasks.find(t => t.id === taskId);
      if (task && task.status !== newStatus) {
        DataStore.updateTask(taskId, { status: newStatus });
        this.render();
        DataStore.saveTasks().then(ok => {
          if (ok) showToast('Saved');
        });
      }
    });
  },

  // Touch drag-and-drop implementation
  _onTouchStart(e, taskId) {
    this._touchTask = taskId;
    const touch = e.touches[0];
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();

    // Create ghost element
    const ghost = card.cloneNode(true);
    ghost.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      opacity: 0.75;
      pointer-events: none;
      z-index: 9999;
      transform: rotate(2deg) scale(1.02);
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      transition: none;
    `;
    document.body.appendChild(ghost);
    this._touchGhost = ghost;
    this._touchOffsetX = touch.clientX - rect.left;
    this._touchOffsetY = touch.clientY - rect.top;

    card.classList.add('dragging');
  },

  _onTouchMove(e) {
    if (!this._touchGhost) return;
    e.preventDefault();
    const touch = e.touches[0];
    this._touchGhost.style.left = `${touch.clientX - this._touchOffsetX}px`;
    this._touchGhost.style.top = `${touch.clientY - this._touchOffsetY}px`;

    // Highlight the column under the touch point
    this._touchGhost.style.display = 'none';
    const elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    this._touchGhost.style.display = '';

    const colUnder = elUnder && elUnder.closest('.kanban-column');
    $$('.kanban-column.drag-over').forEach(c => {
      if (c !== colUnder) c.classList.remove('drag-over');
    });
    if (colUnder) colUnder.classList.add('drag-over');
  },

  _onTouchEnd(e) {
    if (!this._touchTask) return;

    const touch = e.changedTouches[0];

    // Remove ghost
    if (this._touchGhost) {
      this._touchGhost.remove();
      this._touchGhost = null;
    }

    // Remove dragging class from original card
    const card = $('#kanban-board').querySelector(`.task-card[data-id="${this._touchTask}"]`);
    if (card) card.classList.remove('dragging');

    // Find column under touch point
    const ghostWasHere = document.elementFromPoint(touch.clientX, touch.clientY);
    const colUnder = ghostWasHere && ghostWasHere.closest('.kanban-column');
    $$('.kanban-column.drag-over').forEach(c => c.classList.remove('drag-over'));

    if (colUnder) {
      const newStatus = colUnder.dataset.status;
      const task = DataStore.tasks.tasks.find(t => t.id === this._touchTask);
      if (task && task.status !== newStatus) {
        DataStore.updateTask(this._touchTask, { status: newStatus });
        this.render();
        DataStore.saveTasks().then(ok => {
          if (ok) showToast('Saved');
        });
      }
    }

    this._touchTask = null;
  },

  setupFilters() {
    const filters = $('#kanban-filters');
    if (!filters) return;

    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      $$('#kanban-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this._filter = btn.dataset.filter;
      this._applyFilter(this._filter);
    });
  },

  _applyFilter(filter) {
    $$('#kanban-board .task-card').forEach(card => {
      if (filter === 'all' || card.dataset.category === filter) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  },

  showAddModal(defaultStatus) {
    this.showModal('Add Task', null, defaultStatus || 'todo');
  },

  editTask(id) {
    const task = DataStore.tasks.tasks.find(t => t.id === id);
    if (!task) return;
    this.showModal('Edit Task', task);
  },

  deleteTask(id) {
    if (confirm('Delete this task?')) {
      DataStore.deleteTask(id);
      this.render();
      DataStore.saveTasks().then(ok => {
        if (ok) showToast('Saved');
      });
    }
  },

  showModal(title, task = null, defaultStatus = 'todo') {
    const modal = $('#modal');
    const overlay = $('#modal-overlay');
    if (!modal || !overlay) return;

    const currentStatus = task ? task.status : defaultStatus;
    const tagsValue = task && Array.isArray(task.tags) ? task.tags.join(', ') : '';

    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" id="modal-close-btn" aria-label="Close">&times;</button>
      </div>
      <form id="task-form" novalidate>
        <div class="form-group">
          <label for="field-title">Title *</label>
          <input type="text" id="field-title" name="title" required
            placeholder="Task title"
            value="${task ? this._esc(task.title) : ''}">
        </div>
        <div class="form-group">
          <label for="field-description">Description</label>
          <textarea id="field-description" name="description"
            placeholder="Optional description">${task ? this._esc(task.description || '') : ''}</textarea>
        </div>
        <div class="form-group">
          <label for="field-status">Status</label>
          <select id="field-status" name="status">
            <option value="todo"        ${currentStatus === 'todo'        ? 'selected' : ''}>To Do</option>
            <option value="in_progress" ${currentStatus === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="blocked"     ${currentStatus === 'blocked'     ? 'selected' : ''}>Blocked</option>
            <option value="done"        ${currentStatus === 'done'        ? 'selected' : ''}>Done</option>
          </select>
        </div>
        <div class="form-group">
          <label for="field-category">Category</label>
          <select id="field-category" name="category">
            <option value="work"     ${(!task || task.category === 'work')     ? 'selected' : ''}>Work</option>
            <option value="personal" ${(task && task.category === 'personal')  ? 'selected' : ''}>Personal</option>
          </select>
        </div>
        <div class="form-group">
          <label for="field-jiraId">Jira ID</label>
          <input type="text" id="field-jiraId" name="jiraId"
            placeholder="e.g. CXCDP-33418"
            value="${task ? this._esc(task.jiraId || '') : ''}">
        </div>
        <div class="form-group">
          <label for="field-timeSpent">Time Spent</label>
          <input type="text" id="field-timeSpent" name="timeSpent"
            placeholder="e.g. 4h"
            value="${task ? this._esc(task.timeSpent || '') : ''}">
        </div>
        <div class="form-group">
          <label for="field-tags">Tags <small>(comma-separated)</small></label>
          <input type="text" id="field-tags" name="tags"
            placeholder="e.g. emarsys, idx-cdp"
            value="${this._esc(tagsValue)}">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" id="modal-cancel-btn">Cancel</button>
          <button type="submit" class="btn-primary">${task ? 'Save Changes' : 'Add Task'}</button>
        </div>
      </form>
    `;

    // Show overlay
    overlay.classList.remove('hidden');
    // Trigger CSS animation on next frame
    requestAnimationFrame(() => overlay.classList.add('open'));

    // Focus first field
    const titleField = $('#field-title');
    if (titleField) titleField.focus();

    // Close handlers
    const close = () => this.closeModal();
    $('#modal-close-btn').addEventListener('click', close);
    $('#modal-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    }, { once: true });

    // Submit
    $('#task-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const titleVal = form.title.value.trim();
      if (!titleVal) {
        form.title.focus();
        return;
      }

      const tagsRaw = form.tags.value.trim();
      const tagsArr = tagsRaw
        ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const payload = {
        title:       titleVal,
        description: form.description.value.trim(),
        status:      form.status.value,
        category:    form.category.value,
        jiraId:      form.jiraId.value.trim(),
        timeSpent:   form.timeSpent.value.trim(),
        tags:        tagsArr
      };

      if (task) {
        DataStore.updateTask(task.id, payload);
      } else {
        DataStore.addTask(payload);
      }

      this.closeModal();
      this.render();
      DataStore.saveTasks().then(ok => {
        if (ok) showToast('Saved');
      });
    });
  },

  closeModal() {
    const overlay = $('#modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    // Wait for transition to finish before hiding
    overlay.addEventListener('transitionend', () => {
      overlay.classList.add('hidden');
    }, { once: true });
  },

  // Escape HTML to prevent injection in value attributes / text
  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
