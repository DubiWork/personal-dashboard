const DailyLog = {
  currentDate: todayISO(),

  // ── Public API ────────────────────────────────────────────────────────────

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

    // Auto-create/link tasks from sessions before grouping
    await this._autoLinkSessions(sessions);

    // Group sessions by taskId
    const grouped = this._groupByTask(sessions);

    // Render a card per task (linked sessions)
    grouped.linked.forEach(({ task, sessionIndexes }) => {
      const taskSessions = sessionIndexes.map(i => ({ session: sessions[i], index: i }));
      content.appendChild(this._renderTaskCard(task, taskSessions));
    });

    // Render unlinked sessions at the bottom
    if (grouped.unlinked.length > 0) {
      content.appendChild(this._renderUnlinkedSection(grouped.unlinked, sessions));
    }

    // Jira push section (only if any linked task has a jiraId)
    const hasJiraTasks = grouped.linked.some(g => g.task && g.task.jiraId);
    if (hasJiraTasks) {
      content.appendChild(this._renderJiraPushSection(grouped.linked, sessions));
    }
  },

  prevDay() {
    const d = new Date(this.currentDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    this.goToDate(this._localISO(d));
  },

  nextDay() {
    const d = new Date(this.currentDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    this.goToDate(this._localISO(d));
  },

  goToDate(date) {
    this.currentDate = date;
    this.render();
  },

  // ── Auto-link ───────────────────────────────────────────────────────────

  async _autoLinkSessions(sessions) {
    let changed = false;
    sessions.forEach(session => {
      if (!session.taskId || !DataStore.getTaskById(session.taskId)) {
        const taskId = DataStore.ensureTaskForSession(session);
        if (taskId) {
          session.taskId = taskId;
          changed = true;
        }
      }
    });
    if (changed) {
      await Promise.all([
        DataStore.saveDailyLog(this.currentDate),
        DataStore.saveTasks()
      ]);
    }
  },

  // ── Grouping ──────────────────────────────────────────────────────────────

  _groupByTask(sessions) {
    const taskMap = new Map(); // taskId -> { task, sessionIndexes[] }
    const unlinked = []; // { session, index }

    sessions.forEach((session, index) => {
      const tid = session.taskId;
      if (!tid) {
        unlinked.push({ session, index });
        return;
      }
      if (!taskMap.has(tid)) {
        const task = DataStore.getTaskById(tid) || null;
        taskMap.set(tid, { task, sessionIndexes: [] });
      }
      taskMap.get(tid).sessionIndexes.push(index);
    });

    return {
      linked: Array.from(taskMap.values()),
      unlinked
    };
  },

  // ── Task Card ─────────────────────────────────────────────────────────────

  _renderTaskCard(task, taskSessions) {
    const card = createElement('div', 'task-log-card');

    const totalMin = taskSessions.reduce((sum, { session }) => sum + (session.duration || 0), 0);

    const title = task ? this._esc(task.title) : '<em>Unknown Task</em>';
    const jiraBadge = task && task.jiraId
      ? `<span class="card-jira">${this._esc(task.jiraId)}</span>`
      : '';
    const statusBadge = task && task.status
      ? `<span class="task-log-status">${this._esc(this._formatStatus(task.status))}</span>`
      : '';

    const header = createElement('div', 'task-log-header');
    header.innerHTML = `
      <div class="task-log-title">${title}${jiraBadge ? ' ' + jiraBadge : ''}</div>
      <div class="task-log-meta">${statusBadge}<span class="task-log-total">${this._formatDuration(totalMin)}</span></div>
    `;
    card.appendChild(header);

    const entriesWrap = createElement('div', 'task-log-entries');
    taskSessions.forEach(({ session, index }) => {
      entriesWrap.appendChild(this._renderTimeEntry(session, index));
    });
    card.appendChild(entriesWrap);

    // + Add Time Entry button pre-linked to this task
    if (task) {
      const addBtn = createElement('button', 'btn-add-time-entry', '+ Add Time Entry');
      addBtn.addEventListener('click', () => this.showAddModal({ presetTaskId: task.id }));
      card.appendChild(addBtn);
    }

    return card;
  },

  // ── Individual Time Entry ─────────────────────────────────────────────────

  _renderTimeEntry(session, index) {
    const entry = createElement('div', 'time-entry');

    const timeStr = session.endTime
      ? `${this._esc(session.timestamp || '')} - ${this._esc(session.endTime)}`
      : this._esc(session.timestamp || '');

    const durationBadge = session.duration
      ? `<span class="time-entry-duration">${this._formatDuration(session.duration)}</span>`
      : '';

    const projectStr = session.project
      ? ` <span class="session-project">${this._esc(this._shortenPath(session.project))}</span>`
      : '';

    const header = createElement('div', 'time-entry-header');
    header.innerHTML = `
      <span class="time-entry-time">${timeStr}</span>${durationBadge}${projectStr}
    `;
    entry.appendChild(header);

    if (session.summary) {
      entry.appendChild(createElement('div', 'time-entry-summary', this._esc(session.summary)));
    }

    if (Array.isArray(session.accomplishments) && session.accomplishments.length > 0) {
      const count = session.accomplishments.length;

      const toggleBtn = createElement('button', 'btn-secondary time-entry-toggle',
        `Accomplishments (${count})`);
      toggleBtn.style.cssText = 'font-size:0.75rem;padding:2px 8px;min-height:unset;margin-top:4px;';

      const list = createElement('ul', 'session-accomplishments');
      session.accomplishments.forEach(item => {
        list.appendChild(createElement('li', '', this._esc(item)));
      });
      list.style.display = 'none';

      toggleBtn.addEventListener('click', () => {
        const collapsed = list.style.display === 'none';
        list.style.display = collapsed ? '' : 'none';
        toggleBtn.textContent = collapsed
          ? 'Hide accomplishments'
          : `Accomplishments (${count})`;
      });

      entry.appendChild(toggleBtn);
      entry.appendChild(list);
    }

    if (Array.isArray(session.tasksWorkedOn) && session.tasksWorkedOn.length > 0) {
      const tags = createElement('div', 'session-tasks');
      session.tasksWorkedOn.forEach(t => {
        tags.appendChild(createElement('span', 'session-task-tag', this._esc(t)));
      });
      entry.appendChild(tags);
    }

    return entry;
  },

  // ── Unlinked Section ──────────────────────────────────────────────────────

  _renderUnlinkedSection(unlinkedItems, allSessions) {
    const section = createElement('div', 'unlinked-section');
    section.appendChild(createElement('div', 'task-log-header',
      '<span class="task-log-title">Unlinked Sessions</span>'));

    unlinkedItems.forEach(({ session, index }) => {
      const row = createElement('div', 'unlinked-row');

      const timeStr = session.timestamp || '';
      const summary = session.summary || '(no summary)';
      row.appendChild(createElement('div', 'unlinked-info',
        `<span class="time-entry-time">${this._esc(timeStr)}</span> <span class="time-entry-summary">${this._esc(summary)}</span>`));

      const actions = createElement('div', 'unlinked-actions');

      // "Link to Task" — shows an inline dropdown
      const linkBtn = createElement('button', 'btn-secondary', 'Link to Task');
      linkBtn.style.cssText = 'font-size:0.75rem;padding:2px 8px;min-height:unset;';
      linkBtn.addEventListener('click', () => {
        this._showLinkDropdown(row, actions, index, allSessions);
      });
      actions.appendChild(linkBtn);

      // "Create Task" — opens Kanban modal then links the new task
      const createBtn = createElement('button', 'btn-secondary', 'Create Task');
      createBtn.style.cssText = 'font-size:0.75rem;padding:2px 8px;min-height:unset;';
      createBtn.addEventListener('click', () => {
        this._openCreateAndLink(index, allSessions);
      });
      actions.appendChild(createBtn);

      row.appendChild(actions);
      section.appendChild(row);
    });

    return section;
  },

  _showLinkDropdown(rowEl, actionsEl, sessionIndex, allSessions) {
    // Remove any existing dropdown first
    const existing = rowEl.querySelector('.link-task-dropdown');
    if (existing) { existing.remove(); return; }

    const select = createElement('select', 'link-task-dropdown');
    select.innerHTML = '<option value="">-- Select task --</option>';

    // Group tasks by category
    const tasks = (DataStore.tasks && DataStore.tasks.tasks) ? DataStore.tasks.tasks : [];
    const work = tasks.filter(t => t.category !== 'personal');
    const personal = tasks.filter(t => t.category === 'personal');

    const addOptgroup = (label, items) => {
      if (!items.length) return;
      const grp = document.createElement('optgroup');
      grp.label = label;
      items.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = (t.jiraId ? `${t.jiraId}: ` : '') + t.title;
        grp.appendChild(opt);
      });
      select.appendChild(grp);
    };

    addOptgroup('Work', work);
    addOptgroup('Personal', personal);

    select.addEventListener('change', async () => {
      const taskId = select.value;
      if (!taskId) return;

      DataStore.linkSessionToTask(this.currentDate, sessionIndex, taskId);
      const saved = await DataStore.saveDailyLog(this.currentDate);
      if (saved) showToast('Session linked');
      this.render();
    });

    rowEl.appendChild(select);
    select.focus();
  },

  _openCreateAndLink(sessionIndex) {
    const tasksBefore = (DataStore.tasks && DataStore.tasks.tasks)
      ? DataStore.tasks.tasks.length
      : 0;

    Kanban.showModal('Add Task', null, 'todo');

    // After the modal overlay closes, check if a new task was added
    const overlay = $('#modal-overlay');
    if (!overlay) return;

    const onClose = () => {
      const tasksAfter = (DataStore.tasks && DataStore.tasks.tasks)
        ? DataStore.tasks.tasks.length
        : 0;

      if (tasksAfter > tasksBefore) {
        const newestTask = DataStore.tasks.tasks[DataStore.tasks.tasks.length - 1];
        if (newestTask) {
          DataStore.linkSessionToTask(this.currentDate, sessionIndex, newestTask.id);
          DataStore.saveDailyLog(this.currentDate).then(ok => {
            if (ok) showToast('Session linked to new task');
            this.render();
          });
          return;
        }
      }
      // No new task was created — just re-render to restore state
      this.render();
    };

    overlay.addEventListener('transitionend', () => {
      if (overlay.classList.contains('hidden')) {
        onClose();
      }
    }, { once: true });
  },

  // ── Jira Push Section ─────────────────────────────────────────────────────

  _renderJiraPushSection(linkedGroups, allSessions) {
    const section = createElement('div', 'jira-push-section');

    const pushBtn = createElement('button', 'btn-primary', 'Push to Jira Work Log');
    pushBtn.addEventListener('click', () => {
      this._showJiraPushModal(linkedGroups, allSessions);
    });
    section.appendChild(pushBtn);
    return section;
  },

  _showJiraPushModal(linkedGroups, allSessions) {
    const modal = $('#modal');
    const overlay = $('#modal-overlay');
    if (!modal || !overlay) return;

    // Build entries with jiraId and total time
    const entries = linkedGroups
      .filter(g => g.task && g.task.jiraId)
      .map(g => {
        const totalMin = g.sessionIndexes
          .reduce((sum, i) => sum + (allSessions[i].duration || 0), 0);
        return { task: g.task, totalMin };
      })
      .filter(e => e.totalMin > 0);

    if (entries.length === 0) {
      showToast('No linked sessions with duration to push');
      return;
    }

    const rows = entries.map(e =>
      `<tr>
        <td style="padding:4px 8px;font-family:monospace;color:var(--accent-blue);">${this._esc(e.task.jiraId)}</td>
        <td style="padding:4px 8px;">${this._esc(e.task.title)}</td>
        <td style="padding:4px 8px;text-align:right;color:var(--accent-green);font-weight:600;">${this._formatDuration(e.totalMin)}</td>
      </tr>`
    ).join('');

    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Push to Jira Work Log</span>
        <button class="modal-close" id="jira-modal-close" aria-label="Close">&times;</button>
      </div>
      <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px;">
        The following work will be copied to clipboard as a formatted summary. Paste it into Jira manually.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <th style="padding:4px 8px;text-align:left;font-size:0.75rem;color:var(--text-secondary);">Jira ID</th>
            <th style="padding:4px 8px;text-align:left;font-size:0.75rem;color:var(--text-secondary);">Task</th>
            <th style="padding:4px 8px;text-align:right;font-size:0.75rem;color:var(--text-secondary);">Time</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" id="jira-modal-cancel">Cancel</button>
        <button type="button" class="btn-primary" id="jira-modal-copy">Copy to Clipboard</button>
      </div>
    `;

    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('open'));

    const close = () => this.closeModal();
    $('#jira-modal-close').addEventListener('click', close);
    $('#jira-modal-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    }, { once: true });

    $('#jira-modal-copy').addEventListener('click', () => {
      const lines = [`Work Log — ${this.currentDate}`, ''];
      entries.forEach(e => {
        lines.push(`${e.task.jiraId}: ${e.task.title} — ${this._formatDuration(e.totalMin)}`);
      });
      const text = lines.join('\n');

      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!');
        close();
      }).catch(() => {
        // Fallback for environments without clipboard API
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Copied to clipboard!');
        close();
      });
    });
  },

  // ── Add Entry Modal ───────────────────────────────────────────────────────

  showAddModal(opts = {}) {
    const modal = $('#modal');
    const overlay = $('#modal-overlay');
    if (!modal || !overlay) return;

    const nowTime = new Date().toTimeString().slice(0, 5);
    const presetTaskId = opts.presetTaskId || '';

    const tasks = (DataStore.tasks && DataStore.tasks.tasks) ? DataStore.tasks.tasks : [];
    const taskOptions = this._buildTaskOptions(tasks, presetTaskId);

    modal.innerHTML = `
      <div class="modal-header">
        <span class="modal-title">Add Log Entry</span>
        <button class="modal-close" id="log-modal-close" aria-label="Close">&times;</button>
      </div>
      <form id="log-entry-form" novalidate>
        <div class="form-group">
          <label for="log-field-time">Start Time</label>
          <input type="time" id="log-field-time" name="timestamp" value="${nowTime}">
        </div>
        <div class="form-group">
          <label for="log-field-endtime">End Time <small>(optional)</small></label>
          <input type="time" id="log-field-endtime" name="endTime">
        </div>
        <div class="form-group">
          <label for="log-field-duration">Duration (minutes) <small>(optional, auto-calc if start+end given)</small></label>
          <input type="number" id="log-field-duration" name="duration" min="1" placeholder="e.g. 45">
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
          <input type="text" id="log-field-project" name="project" placeholder="e.g. idx-cdp">
        </div>
        <div class="form-group">
          <label for="log-field-task">Task</label>
          <select id="log-field-task" name="taskId">
            ${taskOptions}
          </select>
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
          <label for="log-field-tasks">Tasks Worked On <small>(comma-separated Jira IDs)</small></label>
          <input type="text" id="log-field-tasks" name="tasksWorkedOn" placeholder="e.g. CXCDP-33418">
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

    // Auto-calc duration when start + end both filled
    const timeField = $('#log-field-time');
    const endField = $('#log-field-endtime');
    const durField = $('#log-field-duration');

    const calcDuration = () => {
      const start = timeField.value;
      const end = endField.value;
      if (start && end) {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) durField.value = diff;
      }
    };
    endField.addEventListener('change', calcDuration);
    timeField.addEventListener('change', calcDuration);

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

      const startTime = form.timestamp.value;
      const endTime = form.endTime.value.trim() || undefined;

      // Determine duration: explicit field > auto-calc from times
      let duration;
      const durRaw = parseInt(form.duration.value, 10);
      if (!isNaN(durRaw) && durRaw > 0) {
        duration = durRaw;
      } else if (startTime && endTime) {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) duration = diff;
      }

      const accomplishmentsRaw = form.accomplishments.value.trim();
      const accomplishments = accomplishmentsRaw
        ? accomplishmentsRaw.split('\n').map(l => l.trim()).filter(Boolean)
        : [];

      const tasksRaw = form.tasksWorkedOn.value.trim();
      const tasksWorkedOn = tasksRaw
        ? tasksRaw.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      const taskId = form.taskId.value || undefined;

      const newSession = {
        timestamp: startTime,
        ...(endTime && { endTime }),
        ...(duration != null && { duration }),
        category: form.category.value,
        project: form.project.value.trim(),
        ...(taskId && { taskId }),
        summary: summaryVal,
        accomplishments,
        tasksWorkedOn
      };

      const log = await DataStore.loadDailyLog(this.currentDate);
      if (!Array.isArray(log.sessions)) log.sessions = [];
      log.sessions.push(newSession);
      DataStore.dailyLogs[this.currentDate] = log;

      const saved = await DataStore.saveDailyLog(this.currentDate);
      if (saved) showToast('Entry saved');

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

  // ── Helpers ───────────────────────────────────────────────────────────────

  _buildTaskOptions(tasks, presetTaskId) {
    const work = tasks.filter(t => t.category !== 'personal');
    const personal = tasks.filter(t => t.category === 'personal');

    const noneSelected = !presetTaskId ? 'selected' : '';
    let html = `<option value="" ${noneSelected}>None</option>`;

    const buildOptgroup = (label, items) => {
      if (!items.length) return '';
      const opts = items.map(t => {
        const sel = t.id === presetTaskId ? 'selected' : '';
        const label = this._esc((t.jiraId ? `${t.jiraId}: ` : '') + t.title);
        return `<option value="${this._esc(t.id)}" ${sel}>${label}</option>`;
      }).join('');
      return `<optgroup label="${label}">${opts}</optgroup>`;
    };

    html += buildOptgroup('Work', work);
    html += buildOptgroup('Personal', personal);
    return html;
  },

  _renderEmptyState() {
    const el = createElement('div', 'empty-state');
    el.innerHTML = `
      <div class="empty-state-icon">&#128214;</div>
      <div class="empty-state-text">No sessions logged for this day.</div>
    `;
    return el;
  },

  _formatDuration(minutes) {
    if (!minutes || minutes <= 0) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  },

  _formatStatus(status) {
    const map = {
      todo: 'To Do',
      in_progress: 'In Progress',
      blocked: 'Blocked',
      done: 'Done'
    };
    return map[status] || status;
  },

  _localISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
