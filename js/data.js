const DataStore = {
  tasks: null,
  goals: null,
  config: null,
  dailyLogs: {},

  async init() {
    const [tasks, goals, config] = await Promise.all([
      fetch('data/tasks.json').then(r => r.json()),
      fetch('data/goals.json').then(r => r.json()),
      fetch('data/config.json').then(r => r.json())
    ]);
    this.tasks = tasks;
    this.goals = goals;
    this.config = config;
  },

  async loadDailyLog(date) {
    if (this.dailyLogs[date]) return this.dailyLogs[date];
    try {
      const log = await fetch(`data/daily-logs/${date}.json`).then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      });
      this.dailyLogs[date] = log;
      return log;
    } catch {
      return { date, sessions: [] };
    }
  },

  getTasksByStatus(status) {
    return this.tasks.tasks.filter(t => t.status === status);
  },

  addTask(task) {
    task.id = uuid();
    task.createdAt = new Date().toISOString();
    task.updatedAt = task.createdAt;
    this.tasks.tasks.push(task);
  },

  updateTask(id, updates) {
    const task = this.tasks.tasks.find(t => t.id === id);
    if (task) Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  },

  deleteTask(id) {
    this.tasks.tasks = this.tasks.tasks.filter(t => t.id !== id);
  },

  async saveToGitHub(path, content, message) {
    const config = this.config.github;
    const token = localStorage.getItem('gh_token');
    if (!token) {
      this.showTokenPrompt();
      return false;
    }

    try {
      // Get current file SHA (required for updates)
      const fileResp = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`,
        { headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
      );

      const sha = fileResp.ok ? (await fileResp.json()).sha : undefined;

      // Create/update file
      const resp = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
            sha,
            branch: config.branch
          })
        }
      );

      if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
      return true;
    } catch (err) {
      console.error('GitHub save failed:', err);
      alert('Failed to save: ' + err.message);
      return false;
    }
  },

  showTokenPrompt() {
    const token = prompt('Enter your GitHub Personal Access Token (needs repo scope):');
    if (token) {
      localStorage.setItem('gh_token', token.trim());
      alert('Token saved! Try again.');
    }
  },

  async saveTasks() {
    return this.saveToGitHub('data/tasks.json', this.tasks, 'update: tasks');
  },

  async saveGoals() {
    return this.saveToGitHub('data/goals.json', this.goals, 'update: goals');
  }
};
