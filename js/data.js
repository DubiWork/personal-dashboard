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

  async saveToGitHub(path, content, message, { silent = false } = {}) {
    const config = this.config.github;
    const token = localStorage.getItem('gh_token');
    if (!token) {
      if (!silent) this.showTokenPrompt();
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
      if (!silent) alert('Failed to save: ' + err.message);
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

  getTaskById(id) {
    if (!this.tasks || !this.tasks.tasks) return null;
    return this.tasks.tasks.find(t => t.id === id) || null;
  },

  findTaskByJiraId(jiraId) {
    if (!jiraId || !this.tasks || !this.tasks.tasks) return null;
    return this.tasks.tasks.find(t => t.jiraId && t.jiraId.toLowerCase() === jiraId.toLowerCase()) || null;
  },

  findTaskByProject(project) {
    if (!project || !this.tasks?.tasks) return null;
    const normalized = project.toLowerCase();
    return this.tasks.tasks.find(t =>
      t.title && t.title.toLowerCase() === normalized
    ) || null;
  },

  ensureTaskForSession(session) {
    if (session.taskId) {
      if (this.getTaskById(session.taskId)) return session.taskId;
    }

    // Try matching by Jira ID first
    if (Array.isArray(session.tasksWorkedOn)) {
      for (const jiraId of session.tasksWorkedOn) {
        const task = this.findTaskByJiraId(jiraId);
        if (task) return task.id;
      }
    }

    // Try matching by project name
    if (session.project) {
      const task = this.findTaskByProject(session.project);
      if (task) {
        if (!task.jiraId && session.tasksWorkedOn?.length) {
          task.jiraId = session.tasksWorkedOn[0];
        }
        return task.id;
      }

      // No match — create new task
      const jiraId = session.tasksWorkedOn?.length ? session.tasksWorkedOn[0] : '';
      const newTask = {
        title: session.project,
        category: session.category || 'work',
        status: 'in_progress',
        jiraId,
        tags: [],
        description: ''
      };
      this.addTask(newTask);
      return newTask.id;
    }

    return null;
  },

  linkSessionToTask(date, sessionIndex, taskId) {
    const log = this.dailyLogs[date];
    if (!log || !Array.isArray(log.sessions)) return false;
    if (sessionIndex < 0 || sessionIndex >= log.sessions.length) return false;
    log.sessions[sessionIndex].taskId = taskId;
    return true;
  },

  async saveDailyLog(date, opts) {
    const log = this.dailyLogs[date];
    if (!log) return false;
    return this.saveToGitHub(`data/daily-logs/${date}.json`, log, `log: update ${date}`, opts);
  },

  async saveTasks(opts) {
    return this.saveToGitHub('data/tasks.json', this.tasks, 'update: tasks', opts);
  },

  async saveGoals() {
    return this.saveToGitHub('data/goals.json', this.goals, 'update: goals');
  }
};
