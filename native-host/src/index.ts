import {
  getRemindersWithinDays,
  getLists,
  addReminder,
  completeReminder,
  uncompleteReminder,
  deleteReminder,
  editReminder,
  type NativeRequest,
  type NativeResponse,
} from "./reminders";

function sendMessage(msg: NativeResponse): void {
  const json = JSON.stringify(msg);
  const bytes = new TextEncoder().encode(json);
  const header = new Uint32Array([bytes.length]);
  const headerBytes = new Uint8Array(header.buffer);

  process.stdout.write(Buffer.from(headerBytes));
  process.stdout.write(Buffer.from(bytes));
}

async function readNativeMessage(): Promise<NativeRequest | null> {
  const reader = Bun.stdin.stream().getReader();

  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  while (totalLen < 4) {
    const { value, done } = await reader.read();
    if (done) return null;
    chunks.push(value);
    totalLen += value.length;
  }

  const headerBuf = new Uint8Array(4);
  let offset = 0;
  for (const chunk of chunks) {
    const needed = Math.min(chunk.length, 4 - offset);
    headerBuf.set(chunk.subarray(0, needed), offset);
    offset += needed;
  }

  const msgLen = new DataView(headerBuf.buffer).getUint32(0, true);
  if (msgLen === 0 || msgLen > 1024 * 1024) return null;

  const bodyChunks: Uint8Array[] = [];
  let bodyLen = 0;

  for (const chunk of chunks) {
    if (offset < chunk.length) {
      const leftover = chunk.subarray(offset);
      bodyChunks.push(leftover);
      bodyLen += leftover.length;
    }
    offset = chunk.length;
  }

  while (bodyLen < msgLen) {
    const { value, done } = await reader.read();
    if (done) break;
    bodyChunks.push(value);
    bodyLen += value.length;
  }

  const bodyBuf = new Uint8Array(msgLen);
  let bOffset = 0;
  for (const chunk of bodyChunks) {
    const needed = Math.min(chunk.length, msgLen - bOffset);
    bodyBuf.set(chunk.subarray(0, needed), bOffset);
    bOffset += needed;
  }

  const json = new TextDecoder().decode(bodyBuf);
  return JSON.parse(json);
}

function handleGetReminders(): NativeResponse {
  const reminders = getRemindersWithinDays(7);

  const items = reminders.map((r, i) => ({
    id: r.externalId,
    content: r.title,
    checked: r.isCompleted,
    completed_at: r.isCompleted ? (r.dueDate ?? null) : null,
    due: r.dueDate ? { date: r.dueDate } : null,
    project_id: null,
    project_name: r.list,
    labels: [],
    notes: r.notes ?? "",
    child_order: i,
    is_deleted: false,
  }));

  return { success: true, items };
}

function handleGetLists(): NativeResponse {
  return { success: true, lists: getLists() };
}

async function main() {
  const message = await readNativeMessage();
  if (!message) {
    sendMessage({ success: false, error: "No message received" });
    return;
  }

  try {
    switch (message.action) {
      case "getReminders":
        sendMessage(handleGetReminders());
        break;

      case "getLists":
        sendMessage(handleGetLists());
        break;

      case "addReminder":
        addReminder(message.list, message.title, message.dueDate, message.notes);
        sendMessage({ success: true });
        break;

      case "completeReminder":
        completeReminder(message.list, message.id);
        sendMessage({ success: true });
        break;

      case "uncompleteReminder":
        uncompleteReminder(message.list, message.id);
        sendMessage({ success: true });
        break;

      case "deleteReminder":
        deleteReminder(message.list, message.id);
        sendMessage({ success: true });
        break;

      case "editReminder":
        editReminder(message.list, message.id, message.title);
        sendMessage({ success: true });
        break;

      default:
        sendMessage({ success: false, error: `Unknown action: ${(message as any).action}` });
    }
  } catch (e: any) {
    sendMessage({ success: false, error: e.message ?? String(e) });
  }
}

main();
