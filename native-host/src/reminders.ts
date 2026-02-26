import { execSync } from "child_process";

const REMINDERS = "/opt/homebrew/bin/reminders";

export interface AppleReminder {
  externalId: string;
  title: string;
  dueDate?: string;
  startDate?: string;
  isCompleted: boolean;
  list: string;
  priority: number;
  notes?: string;
}

export type NativeRequest =
  | { action: "getReminders" }
  | { action: "getLists" }
  | { action: "addReminder"; list: string; title: string; dueDate?: string; notes?: string }
  | { action: "completeReminder"; list: string; id: string }
  | { action: "uncompleteReminder"; list: string; id: string }
  | { action: "deleteReminder"; list: string; id: string }
  | { action: "editReminder"; list: string; id: string; title: string };

export type NativeResponse =
  | { success: true; items: object[] }
  | { success: true; lists: string[] }
  | { success: true }
  | { success: false; error: string };

export function getRemindersWithinDays(days: number): AppleReminder[] {
  let raw: string;
  try {
    raw = execSync(`${REMINDERS} show-all --include-completed -f json`, {
      timeout: 10000,
    }).toString();
  } catch {
    return [];
  }

  const all: AppleReminder[] = JSON.parse(raw);
  const now = Date.now();
  const cutoff = now + days * 24 * 60 * 60 * 1000;

  return all.filter((r) => {
    if (!r.dueDate) return false;
    const due = new Date(r.dueDate).getTime();
    if (r.isCompleted) return due >= now && due <= cutoff;
    return due <= cutoff;
  });
}

export function getLists(): string[] {
  try {
    const raw = execSync(`${REMINDERS} show-lists -f json`, {
      timeout: 10000,
    }).toString();
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addReminder(list: string, title: string, dueDate?: string, notes?: string): void {
  const args = [REMINDERS, "add", quote(list), quote(title)];
  if (dueDate) args.push("--due-date", quote(dueDate));
  if (notes) args.push("--notes", quote(notes));
  execSync(args.join(" "), { timeout: 10000 });
}

export function completeReminder(list: string, id: string): void {
  execSync(`${REMINDERS} complete ${quote(list)} ${quote(id)}`, { timeout: 10000 });
}

export function uncompleteReminder(list: string, id: string): void {
  execSync(`${REMINDERS} uncomplete ${quote(list)} ${quote(id)}`, { timeout: 10000 });
}

export function deleteReminder(list: string, id: string): void {
  try {
    execSync(`${REMINDERS} delete ${quote(list)} ${quote(id)}`, { timeout: 10000 });
  } catch {
    // Completed reminders can't be deleted directly; uncomplete first
    uncompleteReminder(list, id);
    execSync(`${REMINDERS} delete ${quote(list)} ${quote(id)}`, { timeout: 10000 });
  }
}

export function editReminder(list: string, id: string, title: string): void {
  execSync(`${REMINDERS} edit ${quote(list)} ${quote(id)} ${quote(title)}`, { timeout: 10000 });
}

function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
