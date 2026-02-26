import TaskBackend from "./task-backend.js";

const HOST_NAME = "com.restart.apple_reminders";

function sendNative(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST_NAME, message, (resp) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!resp?.success) {
        reject(new Error(resp?.error ?? "Native host returned failure"));
        return;
      }
      resolve(resp);
    });
  });
}

class AppleRemindersBackend extends TaskBackend {
  constructor(config) {
    super(config);
    this.data = { items: [], lists: [] };
    // Track recently completed tasks so they stay visible after sync
    this.recentlyCompleted = new Map(); // id -> { task, completedAt }
  }

  async sync(resourceTypes) {
    const [remindersResp, listsResp] = await Promise.all([
      sendNative({ action: "getReminders" }),
      sendNative({ action: "getLists" }),
    ]);

    this.data = {
      items: remindersResp.items,
      lists: listsResp.lists,
    };
  }

  getTasks() {
    if (!this.data.items) return [];

    // Prune completions older than 5 minutes
    const now = Date.now();
    for (const [id, entry] of this.recentlyCompleted) {
      if (now - entry.completedAt > 5 * 60 * 1000) {
        this.recentlyCompleted.delete(id);
      }
    }

    // Merge recently completed tasks that are no longer in the API response
    const fetchedIds = new Set(this.data.items.map((item) => item.id));
    const completedItems = [];
    for (const [id, entry] of this.recentlyCompleted) {
      if (!fetchedIds.has(id)) {
        completedItems.push(entry.task);
      }
    }

    const allItems = [...this.data.items, ...completedItems];

    const mapped = allItems
      .filter((item) => !item.is_deleted)
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

    // Unchecked first (sorted by due date), then completed at the bottom
    return mapped.sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      if (a.due_date && b.due_date) return a.due_date.getTime() - b.due_date.getTime();
      if (a.due_date && !b.due_date) return -1;
      if (!a.due_date && b.due_date) return 1;
      return a.child_order - b.child_order;
    });
  }

  async addTask(content, due, listName) {
    const list = listName || this.data.lists?.[0] || "Reminders";
    await sendNative({
      action: "addReminder",
      list,
      title: content,
      dueDate: due || undefined,
    });
  }

  async completeTask(taskId) {
    const task = this.data.items.find((item) => item.id === taskId);
    if (!task) return;
    this.recentlyCompleted.set(taskId, {
      task: { ...task, checked: true, completed_at: new Date().toISOString() },
      completedAt: Date.now(),
    });
    await sendNative({
      action: "completeReminder",
      list: task.project_name,
      id: taskId,
    });
  }

  async uncompleteTask(taskId) {
    const task =
      this.data.items.find((item) => item.id === taskId) ??
      this.recentlyCompleted.get(taskId)?.task;
    this.recentlyCompleted.delete(taskId);
    if (!task) return;
    await sendNative({
      action: "uncompleteReminder",
      list: task.project_name,
      id: taskId,
    });
  }

  async deleteTask(taskId) {
    const task =
      this.data.items.find((item) => item.id === taskId) ??
      this.recentlyCompleted.get(taskId)?.task;
    this.recentlyCompleted.delete(taskId);
    if (!task) return;
    await sendNative({
      action: "deleteReminder",
      list: task.project_name,
      id: taskId,
    });
  }

  async editTaskName(taskId, newContent) {
    const task = this.data.items.find((item) => item.id === taskId);
    if (!task) return;
    await sendNative({
      action: "editReminder",
      list: task.project_name,
      id: taskId,
      title: newContent,
    });
  }

  clearLocalData() {}
}

export default AppleRemindersBackend;
