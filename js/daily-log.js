const DailyLog = {
  currentDate: todayISO(),

  async render() {
    const view = $('#view-daily-log');
    if (!view) return;

    view.innerHTML = `
      <div class="log-header">
        <h2>Daily Log</h2>
        <div class="date-nav">
          <button id="log-prev-day" aria-label="Previous day">&#8249;</button>
          <input type="date" id="log-date-input" value="${this._esc(this.currentDate)}">
          <button id="log-next-day" aria-label="Next day">&#8250;</button>
        </div>
        <button class="btn-add" id="btn-add-entry">+ Add Entry</button>
      </div>
      <div class="log-content" id="log-content"></div>
    `;

    $('#log-prev-day').addEventListener('click', () => this.prevDay());
    $('#log-next-day').addEventListener('click', () => this.nextDay());
    $('#log-date-input').addEventListener('change', (e) => {
      if (e.target.value) this.goToDate(e.target.value);
    });
    $('#btn-add-entry').addEventListener('click', () => this.showAddModal());

    const log = await DataStore.loadDailyLog(this.currentDate);
    const content = $('#log-content');
    if (!content) return;

    const sessions = Array.isArray(log.sessions) ? log.sessions : [];

    if (sessions.length === 0) {
      content.appendChild(this._renderEmptyState());
      return;
    }

    const workSessions = sessions.filter(s => s.category === 'work');
    const personalSessions = sessions.filter(s => s.category !== 'work');

    if (workSessions.length > 0) {
      content.appendChild(this.renderSection('Work', workSessions));
    }
    if (personalSessions.length > 0) {
      content.appendChild(this.renderSection('Personal', personalSessions));
    }
  },

  renderSection(title, sessions) {
    const section = createElement('div', 'log-section');

    const categoryKey = title.toLowerCase();
    const sectionTitle = createElement(
      'div',
      `section-title ${categoryKey}`,
      `<span class="badge-${categoryKey}">${title}</span> <span>${sessions.length} session${sessions.length !== 1 ? 's' : ''}</span>`
    );
    section.appendChild(sectionTitle);

    sessions.forEach(session => {
      const card = createElement('div', 'session-card');

      const meta = createElement('div', 'session-meta');

      const time = createElement('span', 'session-time', this._esc(session.timestamp || ''));
      meta.appendChild(time);

      if (session.project) {
        const project = createElement('span', 'session-project', this._esc(this._shortenPath(session.project)));
        meta.appendChild(project);
      }

      card.appendChild(meta);

      if (session.summary) {
        const summary = createElement('div', 'session-summary', this._esc(session.summary));
        card.appendChild(summary);
      }

      if (Array.isArray(session.accomplishments) && session.accomplishments.length > 0) {
        const toggleBtn = createElement(
          'button',
          'btn-secondary',
          `Accomplishments (${session.accomplishments.length})`
        );
        toggleBtn.style.cssText = 'font-size:0.75rem;padding:2px 8px;min-height:unset;margin-top:4px;';

        const list = createElement('ul', 'session-accomplishments');
        session.accomplishments.forEach(item => {
          const li = createElement('li', '', this._esc(item));
          list.appendChild(li);
        });
        list.style.display = 'none';

        toggleBtn.addEventListener('click', () => {
          const collapsed = list.style.display === 'none';
          list.style.display = collapsed ? '' : 'none';
          toggleBtn.textContent = collapsed
            ? `Hide accomplishments`
            : `Accomplishments (${session.accomplishments.length})`;
        });

        card.appendChild(toggleBtn);
        card.appendChild(list);
      }

      if (Array.isArray(session.tasksWorkedOn) && session.tasksWorkedOn.length > 0) {
        const tasks = createElement('div', 'session-tasks');
        session.tasksWorkedOn.forEach(t => {
          tasks.appendChild(createElement('span', 'session-task-tag', this._esc(t)));
        });
        card.appendChild(tasks);
      }

      section.appendChild(card);
    });

    return section;
  },

  _renderEmptyState() {
    const el = createElement('div', 'empty-state');
    el.innerHTML = `
      <div class="empty-state-icon">&#128214;</div>
      <div class="empty-state-text">No sessions logged for this day.</div>
    `;
    return el;
  },

  prevDay() {
    const d = new Date(this.currentDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    this.goToDate(d.toISOString().split('T')[0]);
  },

  nextDay() {
    const d = new Date(this.currentDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    this.goToDate(d.toISOString().split('T')[0]);
  },

  goToDate(date) {
    this.currentDate = date;
    this.render();
  },

  showAddModal() {
    const modal = $('#modal');
    const overlay = $('#modal-overlay');
    if (!modal || !overlay) return;

    const nowTime = new Date().toTimeString().slice(0, 5);

    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Add Log Entry</span>
        <button class="modal-close" id="log-modal-close" aria-label="Close">&times;</button>
      </div>
      <form id="log-entry-form" novalidate>
        <div class="form-group">
          <label for="log-field-time">Time</label>
          <input type="time" id="log-field-time" name="timestamp" value="${nowTime}">
        </div>
        <div class="form-group">
          <label for="log-field-category">Category</label>
          <select id="log-field-category" name="category">
            <option value="work" selected>Work</option>
            <option value="personal">Personal</option>
          </select>
        </div>
        <div class="form-group">
          <label for="log-field-project">Project</label>
          <input type="text" id="log-field-project" name="project" placeholder="e.g. C:\\SAPDevelop">
        </div>
        <div class="form-group">
          <label for="log-field-summary">Summary *</label>
          <input type="text" id="log-field-summary" name="summary" required placeholder="What did you work on?">
        </div>
        <div class="form-group">
          <label for="log-field-accomplishments">Accomplishments <small>(one per line)</small></label>
          <textarea id="log-field-accomplishments" name="accomplishments" placeholder="Found root cause&#10;Fixed the bug&#10;Wrote tests"></textarea>
        </div>
        <div class="form-group">
          <label for="log-field-tasks">Tasks Worked On <small>(comma-separated)</small></label>
          <input type="text" id="log-field-tasks" name="tasksWorkedOn" placeholder="e.g. CXCDP-33418, CXCDP-35182">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" id="log-modal-cancel">Cancel</button>
          <button type="submit" class="btn-primary">Save Entry</button>
        </div>
      </form>
    `;

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('open'));

    const summaryField = $('#log-field-summary');
    if (summaryField) summaryField.focus();

    const close = () => this.closeModal();
    $('#log-modal-close').addEventListener('click', close);
    $('#log-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    }, { once: true });

    $('#log-entry-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;

      const summaryVal = form.summary.value.trim();
      if (!summaryVal) {
        form.summary.focus();
        return;
      }

      const accomplishmentsRaw = form.accomplishments.value.trim();
      const accomplishments = accomplishmentsRaw
        ? accomplishmentsRaw.split('\n').map(l => l.trim()).filter(Boolean)
        : [];

      const tasksRaw = form.tasksWorkedOn.value.trim();
      const tasksWorkedOn = tasksRaw
        ? tasksRaw.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const newSession = {
        timestamp:      form.timestamp.value,
        category:       form.category.value,
        project:        form.project.value.trim(),
        summary:        summaryVal,
        accomplishments,
        tasksWorkedOn
      };

      const log = await DataStore.loadDailyLog(this.currentDate);
      if (!Array.isArray(log.sessions)) log.sessions = [];
      log.sessions.push(newSession);
      DataStore.dailyLogs[this.currentDate] = log;

      this.closeModal();
      this.render();
    });
  },

  closeModal() {
    const overlay = $('#modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => {
      overlay.classList.add('hidden');
    }, { once: true });
  },

  _shortenPath(path) {
    if (!path) return '';
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
  },

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
