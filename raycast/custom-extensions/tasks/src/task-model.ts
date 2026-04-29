import { compareAsc, format, formatISO, isBefore, isSameDay } from "date-fns";
import { Reminder } from "./reminders";
import {
  AreaTag,
  CORE_TAG_CATEGORIES,
  MatrixTag,
  TAG_CATEGORY_PREFIXES,
  TAG_DEFINITIONS,
  TagCategory,
  TaskTag,
} from "./taxonomy";

export type TaskReminder = Reminder & {
  tags: Partial<Record<TagCategory, TaskTag>>;
  allTags: TaskTag[];
  needsTriageReasons: string[];
};

const TAG_PATTERN = /#[A-Za-z0-9_]+/g;

export function extractTags(
  reminder: Pick<Reminder, "title" | "notes">,
): TaskTag[] {
  const text = `${reminder.title}\n${reminder.notes ?? ""}`;
  const matches = text.match(TAG_PATTERN) ?? [];
  const tags: TaskTag[] = [];
  for (const match of matches) {
    if (TAG_DEFINITIONS.has(match as TaskTag)) {
      tags.push(match as TaskTag);
    }
  }
  return Array.from(new Set<TaskTag>(tags));
}

export function getTagsByCategory(
  tags: TaskTag[],
): Partial<Record<TagCategory, TaskTag>> {
  const byCategory: Partial<Record<TagCategory, TaskTag>> = {};
  for (const tag of tags) {
    const definition = TAG_DEFINITIONS.get(tag);
    if (definition && !byCategory[definition.category]) {
      byCategory[definition.category] = tag;
    }
  }
  return byCategory;
}

export function toTaskReminder(reminder: Reminder): TaskReminder {
  const allTags = extractTags(reminder);
  const tags = getTagsByCategory(allTags);
  const needsTriageReasons: string[] = [];

  for (const category of CORE_TAG_CATEGORIES) {
    if (!tags[category]) {
      needsTriageReasons.push(`Missing ${category} tag`);
    }
  }

  if (tags.area === "#area_work" && !reminder.isRecurring) {
    needsTriageReasons.push("Work task should migrate to Linear");
  }

  if (tags.area === "#area_freelance" && !tags.freelance) {
    needsTriageReasons.push("Missing freelance subtype");
  }

  if (tags.matrix === "#matrix_eliminate") {
    needsTriageReasons.push("Eliminate/defer decision needed");
  }

  return { ...reminder, allTags, tags, needsTriageReasons };
}

const IGNORED_LIST_TITLES = new Set(["Einkauf"]);

export function isIgnoredReminder(reminder: Reminder): boolean {
  return reminder.list?.title
    ? IGNORED_LIST_TITLES.has(reminder.list.title)
    : false;
}

export function activeTaskReminders(reminders: Reminder[]): TaskReminder[] {
  return reminders
    .filter((reminder) => !reminder.isCompleted && !isIgnoredReminder(reminder))
    .map(toTaskReminder);
}

export function isFullDay(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function getDateString(date: string): string {
  return isFullDay(date)
    ? date
    : formatISO(new Date(date), { representation: "date" });
}

export function isOverdue(date: string): boolean {
  const today = formatISO(new Date(), { representation: "date" });
  return isBefore(
    isFullDay(date) ? date : new Date(date),
    isFullDay(date) ? today : new Date(),
  );
}

export function isToday(date: string): boolean {
  return isSameDay(
    isFullDay(date) ? new Date(`${date}T00:00:00`) : new Date(date),
    new Date(),
  );
}

export function displayDueDate(date: string): string {
  if (isToday(date)) return "Today";
  return format(
    isFullDay(date) ? new Date(`${date}T00:00:00`) : new Date(date),
    "EEE, MMM d",
  );
}

export function byDueDate(a: Reminder, b: Reminder): number {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return compareAsc(new Date(a.dueDate), new Date(b.dueDate));
}

export function byCreationDate(a: Reminder, b: Reminder): number {
  const aDate =
    typeof a.creationDate === "number"
      ? a.creationDate
      : new Date(a.creationDate ?? 0).getTime();
  const bDate =
    typeof b.creationDate === "number"
      ? b.creationDate
      : new Date(b.creationDate ?? 0).getTime();
  return aDate - bDate;
}

export function byTodayPriority(a: TaskReminder, b: TaskReminder): number {
  return (
    todayRank(a) - todayRank(b) ||
    byDueDate(a, b) ||
    byCreationDate(a, b) ||
    a.title.localeCompare(b.title)
  );
}

function todayRank(reminder: TaskReminder): number {
  if (reminder.dueDate && isOverdue(reminder.dueDate)) return 0;
  if (reminder.dueDate && isToday(reminder.dueDate)) return 1;
  if (reminder.tags.matrix === "#matrix_do") return 2;
  if (reminder.tags.matrix === "#matrix_schedule" && !reminder.dueDate)
    return 3;
  if (reminder.needsTriageReasons.length > 0) return 4;
  return 5;
}

export function getFriendlyTag(tag?: TaskTag): string | undefined {
  return tag ? (TAG_DEFINITIONS.get(tag)?.label ?? tag) : undefined;
}

export function getTagColor(tag?: TaskTag) {
  return tag ? TAG_DEFINITIONS.get(tag)?.color : undefined;
}

export function replaceCategoryTag(
  reminder: Reminder,
  category: TagCategory,
  tag: TaskTag | null,
): string {
  const prefix = TAG_CATEGORY_PREFIXES[category];
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`(^|\\s)${escapedPrefix}[A-Za-z0-9_]+`, "g");
  const notesWithoutCategory = (reminder.notes ?? "")
    .replace(tagPattern, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (!tag) return notesWithoutCategory;
  return [notesWithoutCategory, tag].filter(Boolean).join("\n");
}

export function withoutLinearMigrated(reminder: TaskReminder): boolean {
  return !/linear\.app\//i.test(reminder.notes ?? "");
}

export function isLinearCandidate(reminder: TaskReminder): boolean {
  return (
    reminder.tags.area === "#area_work" &&
    !reminder.isRecurring &&
    withoutLinearMigrated(reminder)
  );
}

export function isRecurringWork(reminder: TaskReminder): boolean {
  return reminder.tags.area === "#area_work" && reminder.isRecurring;
}

export function isNonWork(reminder: TaskReminder): boolean {
  return reminder.tags.area !== "#area_work";
}

export function isReminderVisibleToday(reminder: TaskReminder): boolean {
  return isNonWork(reminder) || isRecurringWork(reminder);
}

export function areaValue(reminder: TaskReminder): AreaTag | undefined {
  return reminder.tags.area as AreaTag | undefined;
}

export function matrixValue(reminder: TaskReminder): MatrixTag | undefined {
  return reminder.tags.matrix as MatrixTag | undefined;
}
