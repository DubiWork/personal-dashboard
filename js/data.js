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
  }
};
