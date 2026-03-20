const Goals = {
  render() {
    const goals = DataStore.goals.goals;
    const overall = this.overallProgress(goals);
    const container = $('#view-goals');

    const header = createElement('div', 'goals-header');
    header.innerHTML = `
      <h2>Development Goals 2026</h2>
      <div class="goals-summary">
        <span>Overall Progress</span>
        <div class="progress-bar">
          <div class="progress-fill ${this._colorClass(overall)}" style="width:${overall}%"></div>
        </div>
        <span>${overall}%</span>
      </div>
    `;

    const grid = createElement('div', 'goals-grid');
    goals.forEach(goal => grid.appendChild(this.renderGoalCard(goal)));

    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(grid);
  },

  renderGoalCard(goal) {
    const progress = this.goalProgress(goal);
    const card = createElement('div', 'goal-card');

    const goalHeader = createElement('div', 'goal-header');
    goalHeader.innerHTML = `
      <h3>${goal.title}</h3>
      <div class="goal-progress">
        <div class="progress-bar">
          <div class="progress-fill ${this._colorClass(progress)}" style="width:${progress}%"></div>
        </div>
        <span>${progress}%</span>
      </div>
    `;

    const description = createElement('p', 'goal-description', goal.description);

    const measurements = createElement('ul', 'measurements');
    goal.measurements.forEach(m => {
      const pct = Math.min(100, m.target > 0 ? Math.round((m.current / m.target) * 100) : 0);
      const daysLeft = this._daysLeft(m.deadline);
      const urgencyClass = daysLeft < 30 ? 'urgent' : daysLeft < 90 ? 'soon' : 'ok';
      const unit = m.unit || '';

      const item = createElement('li', 'measurement');
      item.innerHTML = `
        <div class="measurement-label">
          <span>${m.label}</span>
          <span>${m.current}${unit} / ${m.target}${unit}</span>
        </div>
        <div class="mini-progress-bar">
          <div class="mini-progress-fill ${this._colorClass(pct)}" style="width:${pct}%"></div>
        </div>
        <div class="deadline ${urgencyClass}">${daysLeft} days left</div>
      `;
      measurements.appendChild(item);
    });

    const btn = createElement('button', 'btn-update', 'Update Progress');
    btn.addEventListener('click', () => this.showUpdateModal(goal.id));

    card.appendChild(goalHeader);
    card.appendChild(description);
    card.appendChild(measurements);
    card.appendChild(btn);
    return card;
  },

  goalProgress(goal) {
    if (!goal.measurements.length) return 0;
    const total = goal.measurements.reduce((sum, m) => {
      return sum + Math.min(100, m.target > 0 ? (m.current / m.target) * 100 : 0);
    }, 0);
    return Math.round(total / goal.measurements.length);
  },

  overallProgress(goals) {
    if (!goals.length) return 0;
    const total = goals.reduce((sum, g) => sum + this.goalProgress(g), 0);
    return Math.round(total / goals.length);
  },

  showUpdateModal(goalId) {
    const goal = DataStore.goals.goals.find(g => g.id === goalId);
    if (!goal) return;

    const modal = $('#modal');
    modal.innerHTML = '';

    const title = createElement('h3', '', `Update: ${goal.title}`);
    modal.appendChild(title);

    const form = createElement('form', 'modal-form');
    goal.measurements.forEach((m, i) => {
      const unit = m.unit || '';
      const group = createElement('div', 'form-group');
      group.innerHTML = `
        <label for="m-input-${i}">${m.label} (target: ${m.target}${unit})</label>
        <input id="m-input-${i}" type="number" min="0" max="${m.target * 2}" value="${m.current}" data-index="${i}">
      `;
      form.appendChild(group);
    });

    const actions = createElement('div', 'modal-actions');

    const saveBtn = createElement('button', 'btn-save', 'Save');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', () => {
      form.querySelectorAll('input[data-index]').forEach(input => {
        const idx = parseInt(input.dataset.index, 10);
        goal.measurements[idx].current = Math.max(0, parseFloat(input.value) || 0);
      });
      this.render();
      this.closeModal();
    });

    const cancelBtn = createElement('button', 'btn-cancel', 'Cancel');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', () => this.closeModal());

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);
    modal.appendChild(form);

    $('#modal-overlay').classList.remove('hidden');
  },

  closeModal() {
    $('#modal-overlay').classList.add('hidden');
    $('#modal').innerHTML = '';
  },

  _daysLeft(deadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(deadline);
    end.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((end - today) / (1000 * 60 * 60 * 24)));
  },

  _colorClass(pct) {
    if (pct >= 70) return 'green';
    if (pct >= 40) return 'orange';
    return 'red';
  }
};
