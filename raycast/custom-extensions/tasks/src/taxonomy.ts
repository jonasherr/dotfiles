import { Color, Icon, Image } from "@raycast/api";

export const TAG_PREFIX = "#";

export type TagCategory = "area" | "matrix" | "freelance" | "effort" | "status";
export type AreaTag = "#area_personal" | "#area_freelance" | "#area_work";
export type MatrixTag =
  | "#matrix_do"
  | "#matrix_schedule"
  | "#matrix_delegate"
  | "#matrix_eliminate";
export type FreelanceTag =
  | "#freelance_writing"
  | "#freelance_workshop"
  | "#freelance_talk"
  | "#freelance_admin";
export type EffortTag =
  | "#effort_quick"
  | "#effort_focus"
  | "#effort_deep"
  | "#effort_errand";
export type StatusTag = "#status_waiting" | "#status_someday";
export type TaskTag =
  | AreaTag
  | MatrixTag
  | FreelanceTag
  | EffortTag
  | StatusTag;

export type TagDefinition<T extends TaskTag = TaskTag> = {
  tag: T;
  label: string;
  category: TagCategory;
  description?: string;
  icon?: Image.ImageLike;
  color?: Color;
};

export const AREA_TAGS: TagDefinition<AreaTag>[] = [
  {
    tag: "#area_personal",
    label: "Personal",
    category: "area",
    icon: Icon.Person,
    color: Color.Green,
  },
  {
    tag: "#area_freelance",
    label: "Freelance",
    category: "area",
    icon: Icon.Building,
    color: Color.Purple,
  },
  {
    tag: "#area_work",
    label: "Work / Linear Candidate",
    category: "area",
    icon: Icon.Building,
    color: Color.Blue,
  },
];

export const MATRIX_TAGS: TagDefinition<MatrixTag>[] = [
  {
    tag: "#matrix_do",
    label: "Do",
    category: "matrix",
    description: "Urgent and important",
    color: Color.Red,
  },
  {
    tag: "#matrix_schedule",
    label: "Schedule",
    category: "matrix",
    description: "Important, not urgent",
    color: Color.Yellow,
  },
  {
    tag: "#matrix_delegate",
    label: "Delegate",
    category: "matrix",
    description: "Urgent, less important",
    color: Color.Orange,
  },
  {
    tag: "#matrix_eliminate",
    label: "Eliminate",
    category: "matrix",
    description: "Neither urgent nor important",
    color: Color.SecondaryText,
  },
];

export const FREELANCE_TAGS: TagDefinition<FreelanceTag>[] = [
  {
    tag: "#freelance_writing",
    label: "Writing",
    category: "freelance",
    icon: Icon.Text,
  },
  {
    tag: "#freelance_workshop",
    label: "Workshop",
    category: "freelance",
    icon: Icon.Hammer,
  },
  {
    tag: "#freelance_talk",
    label: "Talk",
    category: "freelance",
    icon: Icon.Microphone,
  },
  {
    tag: "#freelance_admin",
    label: "Admin",
    category: "freelance",
    icon: Icon.Document,
  },
];

export const EFFORT_TAGS: TagDefinition<EffortTag>[] = [
  { tag: "#effort_quick", label: "Quick", category: "effort", icon: Icon.Bolt },
  { tag: "#effort_focus", label: "Focus", category: "effort", icon: Icon.Eye },
  {
    tag: "#effort_deep",
    label: "Deep",
    category: "effort",
    icon: Icon.Hourglass,
  },
  {
    tag: "#effort_errand",
    label: "Errand",
    category: "effort",
    icon: Icon.Map,
  },
];

export const STATUS_TAGS: TagDefinition<StatusTag>[] = [
  {
    tag: "#status_waiting",
    label: "Waiting",
    category: "status",
    icon: Icon.Clock,
    color: Color.Orange,
  },
  {
    tag: "#status_someday",
    label: "Someday",
    category: "status",
    icon: Icon.Moon,
    color: Color.SecondaryText,
  },
];

export const ALL_TAGS = [
  ...AREA_TAGS,
  ...MATRIX_TAGS,
  ...FREELANCE_TAGS,
  ...EFFORT_TAGS,
  ...STATUS_TAGS,
];

export const TAGS_BY_CATEGORY: Record<TagCategory, TagDefinition[]> = {
  area: AREA_TAGS,
  matrix: MATRIX_TAGS,
  freelance: FREELANCE_TAGS,
  effort: EFFORT_TAGS,
  status: STATUS_TAGS,
};

export const TAG_DEFINITIONS = new Map<TaskTag, TagDefinition>(
  ALL_TAGS.map((definition) => [definition.tag, definition]),
);

export const TAG_CATEGORY_PREFIXES: Record<TagCategory, string> = {
  area: "#area_",
  matrix: "#matrix_",
  freelance: "#freelance_",
  effort: "#effort_",
  status: "#status_",
};

export const CORE_TAG_CATEGORIES: TagCategory[] = ["area", "matrix"];
