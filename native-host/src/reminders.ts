import { execSync } from "child_process";

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

export function getRemindersWithinDays(days: number): AppleReminder[] {
  let raw: string;
  try {
    raw = execSync("/opt/homebrew/bin/reminders show-all -f json", {
      timeout: 10000,
    }).toString();
  } catch {
    return [];
  }

  const all: AppleReminder[] = JSON.parse(raw);
  const now = Date.now();
  const cutoff = now + days * 24 * 60 * 60 * 1000;

  return all.filter((r) => {
    if (r.isCompleted) return false;
    if (!r.dueDate) return false;
    const due = new Date(r.dueDate).getTime();
    return due >= now && due <= cutoff;
  });
}
