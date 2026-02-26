import TaskBackend from "./task-backend.js";

const HOST_NAME = "com.restart.apple_reminders";

class AppleRemindersBackend extends TaskBackend {
  constructor(config) {
    super(config);
    this.data = { items: [] };
  }

  async sync(resourceTypes) {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage(HOST_NAME, { action: "getReminders" }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(resp);
      });
    });

    if (response.success && response.items) {
      this.data = { items: response.items };
    } else {
      throw new Error("Failed to fetch reminders from native host");
    }
  }

  getTasks() {
    if (!this.data.items) return [];

    return this.data.items
      .filter((item) => !item.is_deleted && !item.checked)
      .map((item) => {
        let dueDate = null;
        let hasTime = false;

        if (item.due) {
          if (item.due.date.includes("T")) {
            dueDate = new Date(item.due.date);
            hasTime = true;
          } else {
            dueDate = new Date(item.due.date + "T23:59:59");
          }
        }

        return {
          ...item,
          label_names: [],
          due_date: dueDate,
          has_time: hasTime,
        };
      });
  }

  async addTask(content, due) {
    this.data.items.push({
      id: crypto.randomUUID(),
      content,
      checked: false,
      completed_at: null,
      due: due ? { date: due } : null,
      project_id: null,
      labels: [],
      child_order: this.data.items.length,
      is_deleted: false,
    });
  }

  async completeTask(taskId) {
    const task = this.data.items.find((item) => item.id === taskId);
    if (task) {
      task.checked = true;
      task.completed_at = new Date().toISOString();
    }
  }

  async uncompleteTask(taskId) {
    const task = this.data.items.find((item) => item.id === taskId);
    if (task) {
      task.checked = false;
      task.completed_at = null;
    }
  }

  async deleteTask(taskId) {
    const idx = this.data.items.findIndex((item) => item.id === taskId);
    if (idx !== -1) {
      this.data.items.splice(idx, 1);
    }
  }

  async editTaskName(taskId, newContent) {
    const task = this.data.items.find((item) => item.id === taskId);
    if (task) {
      task.content = newContent;
    }
  }

  clearLocalData() {}
}

export default AppleRemindersBackend;
