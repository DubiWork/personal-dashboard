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

    // Merge localStorage overrides (browser edits) on top of fetched data
    const localTasks = this._loadLocal('tasks');
    if (localTasks && localTasks.tasks) {
      // Use local version for tasks that were modified in browser
      const fetchedMap = new Map(tasks.tasks.map(t => [t.id, t]));
      for (const lt of localTasks.tasks) {
        const fetched = fetchedMap.get(lt.id);
        if (!fetched || (lt.updatedAt && fetched.updatedAt && lt.updatedAt > fetched.updatedAt)) {
          fetchedMap.set(lt.id, lt);
        }
      }
      tasks.tasks = Array.from(fetchedMap.values());
    }

    this.tasks = tasks;
    this.goals = goals;
    this.config = config;
  },

  // localStorage helpers for browser-side persistence
  _saveLocal(key, data) {
    try { localStorage.setItem(`dash_${key}`, JSON.stringify(data)); } catch {}
  },

  _loadLocal(key) {
    try {
      const raw = localStorage.getItem(`dash_${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  _persistTasks() {
    this._saveLocal('tasks', this.tasks);
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

  async loadAllDailyLogs() {
    try {
      const dates = await fetch('data/daily-logs/index.json').then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      });
      if (Array.isArray(dates)) {
        await Promise.all(dates.map(d => this.loadDailyLog(d)));
      }
    } catch {
      // No index — fall back to nothing
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
    this._persistTasks();
  },

  updateTask(id, updates) {
    const task = this.tasks.tasks.find(t => t.id === id);
    if (task) {
      Object.assign(task, updates, { updatedAt: new Date().toISOString() });
      this._persistTasks();
    }
  },

  deleteTask(id) {
    this.tasks.tasks = this.tasks.tasks.filter(t => t.id !== id);
    this._persistTasks();
  },

  async saveToGitHub(path, content, message, { silent = true } = {}) {
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
      (t.project && t.project.toLowerCase() === normalized) ||
      (t.title && t.title.toLowerCase() === normalized)
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
      const summary = session.summary && session.summary !== 'Session activity'
        ? session.summary.substring(0, 60)
        : session.project;
      const newTask = {
        title: summary,
        project: session.project,
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
  },

  // Returns rich stats for a task from all loaded daily logs
  getTaskSessionStats(taskId) {
    let totalMinutes = 0;
    let sessionCount = 0;
    let lastSummary = '';
    let lastTimestamp = '';
    const accomplishments = [];
    const nextSteps = [];
    const dates = [];

    for (const log of Object.values(this.dailyLogs)) {
      if (!Array.isArray(log.sessions)) continue;
      for (const s of log.sessions) {
        if (s.taskId !== taskId) continue;
        sessionCount++;
        totalMinutes += s.duration || 0;
        if (log.date && !dates.includes(log.date)) dates.push(log.date);
        const ts = (log.date || '') + (s.timestamp || '');
        if (ts >= lastTimestamp) {
          lastTimestamp = ts;
          lastSummary = s.summary || '';
        }
        if (Array.isArray(s.accomplishments)) {
          for (const a of s.accomplishments) {
            if (a && !accomplishments.includes(a)) accomplishments.push(a);
          }
        }
        if (Array.isArray(s.nextSteps)) {
          for (const n of s.nextSteps) {
            if (n && !nextSteps.includes(n)) nextSteps.push(n);
          }
        }
      }
    }

    dates.sort();
    return { totalMinutes, sessionCount, lastSummary, accomplishments, nextSteps, dates };
  }
};
