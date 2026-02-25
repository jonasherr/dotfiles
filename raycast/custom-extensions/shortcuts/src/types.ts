export interface Shortcut {
  key: string;
  command: string;
  category: string;
  executable?: string;
}

export interface AppData {
  name: string;
  icon: string;
  shortcuts: Shortcut[];
}
