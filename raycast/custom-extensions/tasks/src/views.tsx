import { List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { getData } from "./reminders";
import { EmptyView, ReminderItem } from "./components";
import {
  TaskReminder,
  activeTaskReminders,
  byDueDate,
  byTodayPriority,
  isLinearCandidate,
  isOverdue,
  isReminderVisibleToday,
  isToday,
} from "./task-model";
import { FREELANCE_TAGS, MATRIX_TAGS } from "./taxonomy";

export type ViewKind =
  | "today"
  | "personal"
  | "freelance"
  | "inbox"
  | "linear-candidates";

export function RemindersView({ kind }: { kind: ViewKind }) {
  const { data, isLoading, mutate } = useCachedPromise(getData);
  const reminders = activeTaskReminders(data?.reminders ?? []);
  const sections = buildSections(kind, reminders);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search tasks..."
      filtering={{ keepSectionOrder: true }}
    >
      {sections.map((section) => (
        <List.Section
          key={section.title}
          title={section.title}
          subtitle={`${section.reminders.length}`}
        >
          {section.reminders.map((reminder) => (
            <ReminderItem
              key={reminder.id}
              reminder={reminder}
              mutate={mutate}
            />
          ))}
        </List.Section>
      ))}
      {!isLoading && sections.length === 0 ? (
        <EmptyView title="No tasks" description={emptyDescription(kind)} />
      ) : null}
    </List>
  );
}

type Section = { title: string; reminders: TaskReminder[] };

function buildSections(kind: ViewKind, reminders: TaskReminder[]): Section[] {
  switch (kind) {
    case "today":
      return todaySections(reminders);
    case "personal":
      return matrixSections(
        reminders.filter((reminder) => reminder.tags.area === "#area_personal"),
      );
    case "freelance":
      return freelanceSections(
        reminders.filter(
          (reminder) => reminder.tags.area === "#area_freelance",
        ),
      );
    case "inbox":
      return inboxSections(reminders);
    case "linear-candidates":
      return [
        {
          title: "Needs Linear Migration",
          reminders: reminders.filter(isLinearCandidate).sort(byTodayPriority),
        },
      ].filter((section) => section.reminders.length);
  }
}

function todaySections(reminders: TaskReminder[]): Section[] {
  const visibleReminders = reminders.filter(isReminderVisibleToday);
  const sections: Section[] = [
    {
      title: "Overdue Deadlines",
      reminders: visibleReminders
        .filter((reminder) => reminder.dueDate && isOverdue(reminder.dueDate))
        .sort(byDueDate),
    },
    {
      title: "Due Today",
      reminders: visibleReminders
        .filter((reminder) => reminder.dueDate && isToday(reminder.dueDate))
        .sort(byDueDate),
    },
    {
      title: "Do Next",
      reminders: visibleReminders
        .filter(
          (reminder) =>
            reminder.tags.matrix === "#matrix_do" && !reminder.dueDate,
        )
        .sort(byTodayPriority),
    },
    {
      title: "Schedule / Plan",
      reminders: visibleReminders
        .filter(
          (reminder) =>
            reminder.tags.matrix === "#matrix_schedule" && !reminder.dueDate,
        )
        .sort(byTodayPriority),
    },
    {
      title: "Needs Triage",
      reminders: reminders
        .filter((reminder) => reminder.needsTriageReasons.length > 0)
        .sort(byTodayPriority),
    },
  ];

  return sections.filter((section) => section.reminders.length > 0);
}

function matrixSections(reminders: TaskReminder[]): Section[] {
  const sections = MATRIX_TAGS.map((definition) => ({
    title: definition.label,
    reminders: reminders
      .filter((reminder) => reminder.tags.matrix === definition.tag)
      .sort(byDueDate),
  }));

  sections.push({
    title: "No Matrix",
    reminders: reminders
      .filter((reminder) => !reminder.tags.matrix)
      .sort(byDueDate),
  });
  return sections.filter((section) => section.reminders.length > 0);
}

function freelanceSections(reminders: TaskReminder[]): Section[] {
  const sections: Section[] = [];

  for (const subtype of FREELANCE_TAGS) {
    const subtypeReminders = reminders.filter(
      (reminder) => reminder.tags.freelance === subtype.tag,
    );
    for (const section of matrixSections(subtypeReminders)) {
      sections.push({
        title: `${subtype.label} · ${section.title}`,
        reminders: section.reminders,
      });
    }
  }

  const uncategorized = reminders.filter(
    (reminder) => !reminder.tags.freelance,
  );
  if (uncategorized.length > 0) {
    sections.push({
      title: "No Freelance Subtype",
      reminders: uncategorized.sort(byDueDate),
    });
  }

  return sections;
}

function inboxSections(reminders: TaskReminder[]): Section[] {
  const missingArea = reminders.filter((reminder) => !reminder.tags.area);
  const missingMatrix = reminders.filter((reminder) => !reminder.tags.matrix);
  const work = reminders.filter(isLinearCandidate);
  const ambiguous = reminders.filter(
    (reminder) =>
      reminder.needsTriageReasons.length > 0 &&
      reminder.tags.area &&
      reminder.tags.matrix &&
      !isLinearCandidate(reminder),
  );

  return [
    { title: "Missing Area", reminders: missingArea.sort(byTodayPriority) },
    { title: "Missing Matrix", reminders: missingMatrix.sort(byTodayPriority) },
    {
      title: "Work Tasks Awaiting Linear",
      reminders: work.sort(byTodayPriority),
    },
    { title: "Needs Decision", reminders: ambiguous.sort(byTodayPriority) },
  ].filter((section) => section.reminders.length > 0);
}

function emptyDescription(kind: ViewKind): string {
  switch (kind) {
    case "today":
      return "No prioritized non-work reminders found.";
    case "personal":
      return "No active personal reminders found.";
    case "freelance":
      return "No active freelance reminders found.";
    case "inbox":
      return "No reminders need triage.";
    case "linear-candidates":
      return "No work reminders are marked for Linear migration.";
  }
}
