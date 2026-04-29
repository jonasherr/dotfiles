import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  Image,
  Keyboard,
  List,
  Toast,
  showToast,
  useNavigation,
} from "@raycast/api";
import { MutatePromise } from "@raycast/utils";
import { format } from "date-fns";
import { useState } from "react";
import {
  Reminder,
  RemindersData,
  setDueDate,
  setTitleAndNotes,
  toggleCompletionStatus,
} from "./reminders";
import {
  TaskReminder,
  displayDueDate,
  getFriendlyTag,
  getTagColor,
  isLinearCandidate,
  replaceCategoryTag,
} from "./task-model";
import {
  AREA_TAGS,
  EFFORT_TAGS,
  FREELANCE_TAGS,
  MATRIX_TAGS,
  STATUS_TAGS,
  TagCategory,
  TaskTag,
} from "./taxonomy";

export type MutateReminders = MutatePromise<RemindersData | undefined>;

type ReminderItemProps = {
  reminder: TaskReminder;
  mutate: MutateReminders;
  showList?: boolean;
};

export function ReminderItem({
  reminder,
  mutate,
  showList = true,
}: ReminderItemProps) {
  const accessories: List.Item.Accessory[] = [];
  const keywords = [reminder.title, reminder.notes, ...reminder.allTags];

  if (reminder.dueDate) {
    accessories.push({
      icon: { source: Icon.Calendar, tintColor: Color.Blue },
      text: displayDueDate(reminder.dueDate),
      tooltip: reminder.dueDate,
    });
  }

  for (const category of [
    "area",
    "matrix",
    "freelance",
    "effort",
    "status",
  ] as TagCategory[]) {
    const tag = reminder.tags[category];
    const label = getFriendlyTag(tag);
    if (label) {
      accessories.push({ tag: { value: label, color: getTagColor(tag) } });
    }
  }

  if (reminder.isRecurring) {
    accessories.push({
      icon: Icon.Repeat,
      tooltip: reminder.recurrenceRule || "Repeating reminder",
    });
  }

  if (showList && reminder.list) {
    accessories.push({
      icon: { source: Icon.Dot, tintColor: reminder.list.color },
      tooltip: reminder.list.title,
    });
    keywords.push(reminder.list.title);
  }

  return (
    <List.Item
      icon={
        reminder.isCompleted
          ? { source: Icon.CheckCircle, tintColor: Color.Green }
          : Icon.Circle
      }
      title={reminder.title}
      subtitle={
        reminder.needsTriageReasons.length
          ? reminder.needsTriageReasons.join(" · ")
          : reminder.notes
      }
      accessories={accessories}
      keywords={keywords.filter(Boolean)}
      actions={<ReminderActions reminder={reminder} mutate={mutate} />}
    />
  );
}

function ReminderActions({
  reminder,
  mutate,
}: {
  reminder: TaskReminder;
  mutate: MutateReminders;
}) {
  async function toggleComplete() {
    await mutate(toggleCompletionStatus(reminder.id), {
      optimisticUpdate(data) {
        if (!data) return data;
        return {
          ...data,
          reminders: data.reminders.map((item) =>
            item.id === reminder.id
              ? { ...item, isCompleted: !item.isCompleted }
              : item,
          ),
        };
      },
    });
    await showToast({
      style: Toast.Style.Success,
      title: reminder.isCompleted
        ? "Marked as incomplete"
        : "Completed reminder",
      message: reminder.title,
    });
  }

  async function updateNotes(notes: string, toastTitle: string) {
    await mutate(
      setTitleAndNotes({
        reminderId: reminder.id,
        title: reminder.title,
        notes,
      }),
      {
        optimisticUpdate(data) {
          if (!data) return data;
          return {
            ...data,
            reminders: data.reminders.map((item) =>
              item.id === reminder.id ? { ...item, notes } : item,
            ),
          };
        },
      },
    );
    await showToast({
      style: Toast.Style.Success,
      title: toastTitle,
      message: reminder.title,
    });
  }

  async function applyCategoryTag(category: TagCategory, tag: TaskTag | null) {
    await updateNotes(
      replaceCategoryTag(reminder, category, tag),
      tag ? `Set ${category} tag` : `Cleared ${category} tag`,
    );
  }

  async function applyDueDate(date: Date | null) {
    const dueDate = date
      ? Action.PickDate.isFullDay(date)
        ? format(date, "yyyy-MM-dd")
        : date.toISOString()
      : null;
    await mutate(setDueDate({ reminderId: reminder.id, dueDate }), {
      optimisticUpdate(data) {
        if (!data) return data;
        return {
          ...data,
          reminders: data.reminders.map((item) =>
            item.id === reminder.id ? { ...item, dueDate } : item,
          ),
        };
      },
    });
    await showToast({
      style: Toast.Style.Success,
      title: dueDate ? "Updated due date" : "Cleared due date",
    });
  }

  return (
    <ActionPanel title={reminder.title}>
      <ActionPanel.Section>
        <Action
          title={
            reminder.isCompleted ? "Mark as Incomplete" : "Complete Reminder"
          }
          icon={
            reminder.isCompleted
              ? Icon.Circle
              : { source: Icon.Checkmark, tintColor: Color.Green }
          }
          onAction={toggleComplete}
        />
        <Action.Open
          title="Open in Reminders"
          target={reminder.openUrl}
          icon={{ fileIcon: "/System/Applications/Reminders.app" }}
          application="com.apple.reminders"
        />
        <Action.Push
          title="Edit Title and Notes"
          icon={Icon.Pencil}
          shortcut={Keyboard.Shortcut.Common.Edit}
          target={<EditReminderForm reminder={reminder} mutate={mutate} />}
        />
      </ActionPanel.Section>

      <ActionPanel.Section>
        <TagSubmenu
          title="Set Area"
          category="area"
          tags={AREA_TAGS}
          selectedTag={reminder.tags.area}
          onChange={applyCategoryTag}
        />
        <TagSubmenu
          title="Set Matrix"
          category="matrix"
          tags={MATRIX_TAGS}
          selectedTag={reminder.tags.matrix}
          onChange={applyCategoryTag}
        />
        <TagSubmenu
          title="Set Freelance Subtype"
          category="freelance"
          tags={FREELANCE_TAGS}
          selectedTag={reminder.tags.freelance}
          onChange={applyCategoryTag}
        />
        <TagSubmenu
          title="Set Effort"
          category="effort"
          tags={EFFORT_TAGS}
          selectedTag={reminder.tags.effort}
          onChange={applyCategoryTag}
        />
        <TagSubmenu
          title="Set Status"
          category="status"
          tags={STATUS_TAGS}
          selectedTag={reminder.tags.status}
          onChange={applyCategoryTag}
        />
        <Action
          title="Mark as Work"
          icon={Icon.Building}
          onAction={() => applyCategoryTag("area", "#area_work")}
        />
        {isLinearCandidate(reminder) ? (
          <Action.CopyToClipboard
            title="Copy Linear Candidate Summary"
            icon={Icon.Clipboard}
            content={`Title: ${reminder.title}\nNotes: ${reminder.notes}\nReminder URL: ${reminder.openUrl}`}
          />
        ) : null}
        <Action.PickDate
          title="Set Due Date"
          icon={Icon.Calendar}
          shortcut={{ modifiers: ["cmd"], key: "d" }}
          onChange={applyDueDate}
        />
        {reminder.dueDate ? (
          <Action
            title="Clear Due Date"
            icon={Icon.XMarkCircle}
            onAction={() => applyDueDate(null)}
          />
        ) : null}
      </ActionPanel.Section>

      <ActionPanel.Section>
        <Action.CopyToClipboard title="Copy Title" content={reminder.title} />
        <Action.CopyToClipboard title="Copy Notes" content={reminder.notes} />
        <Action.CopyToClipboard
          title="Copy Reminder URL"
          content={reminder.openUrl}
        />
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={() => mutate()}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

type TagSubmenuProps = {
  title: string;
  category: TagCategory;
  tags: {
    tag: TaskTag;
    label: string;
    icon?: Image.ImageLike;
    description?: string;
  }[];
  selectedTag?: TaskTag;
  onChange: (category: TagCategory, tag: TaskTag | null) => void;
};

function TagSubmenu({
  title,
  category,
  tags,
  selectedTag,
  onChange,
}: TagSubmenuProps) {
  return (
    <ActionPanel.Submenu title={title} icon={Icon.Tag}>
      <Action
        title="Clear"
        icon={Icon.XMarkCircle}
        onAction={() => onChange(category, null)}
      />
      {tags.map((definition) => (
        <Action
          key={definition.tag}
          title={definition.label}
          icon={
            definition.icon ??
            (selectedTag === definition.tag ? Icon.CheckCircle : Icon.Tag)
          }
          autoFocus={selectedTag === definition.tag}
          onAction={() => onChange(category, definition.tag)}
        />
      ))}
    </ActionPanel.Submenu>
  );
}

function EditReminderForm({
  reminder,
  mutate,
}: {
  reminder: Reminder;
  mutate: MutateReminders;
}) {
  const { pop } = useNavigation();
  const [title, setTitle] = useState(reminder.title);
  const [notes, setNotes] = useState(reminder.notes ?? "");

  async function submit() {
    if (!title.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Title is required",
      });
      return;
    }

    await mutate(
      setTitleAndNotes({ reminderId: reminder.id, title: title.trim(), notes }),
      {
        optimisticUpdate(data) {
          if (!data) return data;
          return {
            ...data,
            reminders: data.reminders.map((item) =>
              item.id === reminder.id
                ? { ...item, title: title.trim(), notes }
                : item,
            ),
          };
        },
      },
    );
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Reminder"
            icon={Icon.Pencil}
            onSubmit={submit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        value={title}
        onChange={setTitle}
      />
      <Form.TextArea
        id="notes"
        title="Notes"
        value={notes}
        onChange={setNotes}
      />
    </Form>
  );
}

export function EmptyView({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <List.EmptyView
      title={title}
      description={description}
      icon={Icon.CheckCircle}
    />
  );
}
