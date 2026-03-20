const Stats = {
  _range: 'week',

  async render() {
    const container = $('#view-stats');
    container.innerHTML = '';

    const header = createElement('div', 'stats-header');
    header.innerHTML = `
      <h2>Stats &amp; Review</h2>
      <div class="time-range-selector">
        <button class="filter-btn${this._range === 'week' ? ' active' : ''}" data-range="week">This Week</button>
        <button class="filter-btn${this._range === 'month' ? ' active' : ''}" data-range="month">This Month</button>
        <button class="filter-btn${this._range === 'all' ? ' active' : ''}" data-range="all">All Time</button>
      </div>
    `;
    header.querySelectorAll('[data-range]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._range = btn.dataset.range;
        await this.render();
      });
    });
    container.appendChild(header);

    const { start, end } = this._getRange();
    const tasks = DataStore.tasks.tasks;
    const goals = DataStore.goals.goals;

    const doneTasks = this.getTasksDoneInRange(start, end);
    const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
    const overallPct = Goals.overallProgress(goals);
    const sessionCount = await this.getSessionCount(start, end);

    const grid = createElement('div', 'stats-grid');
    grid.appendChild(this._statCard(doneTasks.length, 'Tasks Completed', 'green'));
    grid.appendChild(this._statCard(inProgressTasks.length, 'In Progress', 'blue'));
    grid.appendChild(this._statCard(overallPct + '%', 'Goals Progress', 'orange'));
    grid.appendChild(this._statCard(sessionCount, 'Sessions Logged', ''));
    container.appendChild(grid);

    container.appendChild(this._renderCategoryBreakdown(doneTasks));

    if (this._range === 'week' || this._range === 'month') {
      const weekSummary = await this._renderWeeklySummary();
      container.appendChild(weekSummary);
    }

    const footer = createElement('div', 'stats-footer');
    const exportBtn = createElement('button', 'btn-export', 'Export Annual Review');
    exportBtn.addEventListener('click', () => this.exportMarkdown());
    footer.appendChild(exportBtn);
    container.appendChild(footer);
  },

  _statCard(value, label, colorClass) {
    const card = createElement('div', 'stat-card');
    const num = createElement('div', `stat-number${colorClass ? ' ' + colorClass : ''}`, String(value));
    const lbl = createElement('div', 'stat-label', label);
    card.appendChild(num);
    card.appendChild(lbl);
    return card;
  },

  _renderCategoryBreakdown(doneTasks) {
    const workCount = doneTasks.filter(t => t.category === 'work').length;
    const personalCount = doneTasks.filter(t => t.category === 'personal').length;

    const section = createElement('div', 'log-section');
    const title = createElement('div', 'section-title work', 'Category Breakdown');
    section.appendChild(title);

    const card = createElement('div', 'goal-card');
    card.style.marginBottom = 'var(--spacing-lg)';

    const workRow = createElement('div', 'measurement');
    workRow.innerHTML = `
      <div class="measurement-label">
        <span>Work</span>
        <span>${workCount} completed</span>
      </div>
      <div class="mini-progress-bar">
        <div class="mini-progress-fill green" style="width:${this._pct(workCount, workCount + personalCount)}%"></div>
      </div>
    `;

    const personalRow = createElement('div', 'measurement');
    personalRow.style.marginTop = 'var(--spacing-sm)';
    personalRow.innerHTML = `
      <div class="measurement-label">
        <span>Personal</span>
        <span>${personalCount} completed</span>
      </div>
      <div class="mini-progress-bar">
        <div class="mini-progress-fill" style="width:${this._pct(personalCount, workCount + personalCount)}%; background-color: var(--accent-green);"></div>
      </div>
    `;

    card.appendChild(workRow);
    card.appendChild(personalRow);
    section.appendChild(card);
    return section;
  },

  async _renderWeeklySummary() {
    const { start } = this.getWeekRange();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d.toISOString().split('T')[0]);
    }

    const section = createElement('div', 'log-section');
    const title = createElement('div', 'section-title personal', 'Weekly Summary');
    section.appendChild(title);

    const card = createElement('div', 'goal-card');
    card.style.marginBottom = 'var(--spacing-lg)';

    const allTasks = DataStore.tasks.tasks;

    for (const date of days) {
      const dayTasks = allTasks.filter(t => {
        if (t.status !== 'done' || !t.updatedAt) return false;
        return t.updatedAt.split('T')[0] === date;
      });

      const row = createElement('div', 'measurement');
      row.style.marginBottom = 'var(--spacing-xs)';

      const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
      row.innerHTML = `
        <div class="measurement-label">
          <span>${dayLabel}</span>
          <span>${dayTasks.length} done</span>
        </div>
        <div class="mini-progress-bar">
          <div class="mini-progress-fill green" style="width:${Math.min(100, dayTasks.length * 20)}%"></div>
        </div>
      `;
      card.appendChild(row);
    }

    section.appendChild(card);
    return section;
  },

  getTasksDoneInRange(startDate, endDate) {
    const tasks = DataStore.tasks.tasks;
    if (!startDate && !endDate) {
      return tasks.filter(t => t.status === 'done');
    }
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate + 'T23:59:59') : null;
    return tasks.filter(t => {
      if (t.status !== 'done') return false;
      if (!t.updatedAt) return false;
      const updated = new Date(t.updatedAt);
      if (start && updated < start) return false;
      if (end && updated > end) return false;
      return true;
    });
  },

  async getSessionCount(startDate, endDate) {
    if (!startDate && !endDate) {
      const allLoaded = Object.values(DataStore.dailyLogs);
      return allLoaded.reduce((sum, log) => sum + (log.sessions ? log.sessions.length : 0), 0);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() + 1);
    }

    const logs = await Promise.all(dates.map(d => DataStore.loadDailyLog(d)));
    return logs.reduce((sum, log) => sum + (log && log.sessions ? log.sessions.length : 0), 0);
  },

  getWeekRange() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysFromMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0]
    };
  },

  getMonthRange() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      start: firstDay.toISOString().split('T')[0],
      end: lastDay.toISOString().split('T')[0]
    };
  },

  _getRange() {
    if (this._range === 'week') return this.getWeekRange();
    if (this._range === 'month') return this.getMonthRange();
    return { start: null, end: null };
  },

  _pct(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  },

  async exportMarkdown() {
    const today = todayISO();
    const tasks = DataStore.tasks.tasks;
    const goals = DataStore.goals.goals;

    const doneTasks = tasks.filter(t => t.status === 'done');
    const workDone = doneTasks.filter(t => t.category === 'work').length;
    const personalDone = doneTasks.filter(t => t.category === 'personal').length;

    let md = `# Annual Review Export - ${today}\n\n`;

    md += `## Task Summary\n\n`;
    md += `- Total completed: ${doneTasks.length}\n`;
    md += `- By category: Work: ${workDone}, Personal: ${personalDone}\n\n`;

    md += `## Goals Progress\n\n`;
    goals.forEach(goal => {
      const pct = Goals.goalProgress(goal);
      md += `### ${goal.title} — ${pct}%\n\n`;
      if (goal.description) md += `${goal.description}\n\n`;
      goal.measurements.forEach(m => {
        const unit = m.unit || '';
        const mPct = m.target > 0 ? Math.min(100, Math.round((m.current / m.target) * 100)) : 0;
        md += `- **${m.label}:** ${m.current}${unit} / ${m.target}${unit} (${mPct}%)\n`;
      });
      md += '\n';
    });

    md += `## Recent Activity\n\n`;
    const activityDates = [];
    const cursor = new Date();
    for (let i = 0; i < 30; i++) {
      activityDates.push(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() - 1);
    }

    const logs = await Promise.all(activityDates.map(d => DataStore.loadDailyLog(d)));
    let hasActivity = false;
    logs.forEach((log, i) => {
      if (!log || !log.sessions || !log.sessions.length) return;
      hasActivity = true;
      md += `### ${activityDates[i]}\n\n`;
      log.sessions.forEach(s => {
        const time = s.startTime && s.endTime ? ` (${s.startTime} - ${s.endTime})` : '';
        md += `**${s.project || 'Session'}**${time}: ${s.summary || ''}\n`;
        if (s.accomplishments && s.accomplishments.length) {
          s.accomplishments.forEach(a => { md += `- ${a}\n`; });
        }
        md += '\n';
      });
    });
    if (!hasActivity) md += '_No sessions logged in the last 30 days._\n';

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `annual-review-${today}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
};
