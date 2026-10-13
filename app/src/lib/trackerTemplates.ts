import type { IconName } from "trackstack-ui";
import type { AccentName, FieldDef, ViewType } from "./customTrackers.js";

/** A starter tracker, pre-filling TrackerBuilder's create form -- never
 * saved on its own. Picking one is just a faster starting point than a
 * blank form: every field it adds is as editable/removable as one typed
 * in by hand (see draftFromField's `locked` argument), so there's no
 * special "templated field" state to carry past this one prefill. */
export interface TrackerTemplate {
  key: string;
  label: string;
  description: string;
  name: string;
  icon: IconName;
  fields: FieldDef[];
  amountField?: string;
  amountMeaning?: string;
  summable?: boolean;
  categoryField?: string;
  labelField?: string;
  dateField?: string;
  view?: ViewType;
  accent?: AccentName;
}

export const TRACKER_TEMPLATES: TrackerTemplate[] = [
  {
    key: "workout",
    label: "Workout / exercise log",
    description: "Activity, duration, distance, notes — charted by total duration.",
    name: "Workouts",
    icon: "Dumbbell",
    fields: [
      { key: "activity", label: "Activity", type: "select", options: ["Run", "Bike", "Swim", "Strength", "Yoga", "Other"], required: true },
      { key: "duration", label: "Duration", type: "number", unit: "min", required: true },
      { key: "distance", label: "Distance", type: "number", unit: "km" },
      { key: "notes", label: "Notes", type: "long_text" },
      { key: "date", label: "Date", type: "date" },
    ],
    amountField: "duration",
    amountMeaning: "Total time",
    summable: true,
    categoryField: "activity",
    dateField: "date",
    view: "chart",
    accent: "orange",
  },
  {
    key: "reading",
    label: "Reading log",
    description: "Title, author, rating, status — a table of what you've read.",
    name: "Reading",
    icon: "BookOpen",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "author", label: "Author", type: "text" },
      { key: "rating", label: "Rating", type: "rating" },
      { key: "status", label: "Status", type: "select", options: ["Reading", "Finished", "Dropped"] },
      { key: "date", label: "Date", type: "date" },
    ],
    labelField: "title",
    categoryField: "status",
    dateField: "date",
    view: "table",
    accent: "violet",
  },
  {
    key: "habit",
    label: "Habit / streak tracker",
    description: "One check-in a day — done or not, with an optional note.",
    name: "Habit",
    icon: "Flame",
    fields: [
      { key: "done", label: "Done", type: "boolean" },
      { key: "notes", label: "Notes", type: "text" },
      { key: "date", label: "Date", type: "date" },
    ],
    dateField: "date",
    view: "list",
    accent: "green",
  },
];
