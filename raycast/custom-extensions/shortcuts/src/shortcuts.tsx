import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
} from "@raycast/api";
import { exec } from "child_process";
import { useState } from "react";
import { AppData, Shortcut } from "./types";
import { apps } from "./data";

function getCategories(shortcuts: Shortcut[]): string[] {
  const categories = new Set(shortcuts.map((s) => s.category));
  return Array.from(categories).sort();
}

function ShortcutsList({ app }: { app: AppData }) {
  const [category, setCategory] = useState<string>("all");
  const categories = getCategories(app.shortcuts);

  const filteredShortcuts =
    category === "all"
      ? app.shortcuts
      : app.shortcuts.filter((s) => s.category === category);

  const groupedByCategory = filteredShortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, Shortcut[]>,
  );

  return (
    <List
      navigationTitle={app.name}
      searchBarPlaceholder="Search shortcuts..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by Category"
          storeValue
          onChange={setCategory}
        >
          <List.Dropdown.Item title="All Categories" value="all" />
          <List.Dropdown.Section>
            {categories.map((cat) => (
              <List.Dropdown.Item key={cat} title={cat} value={cat} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {Object.entries(groupedByCategory).map(([cat, shortcuts]) => (
        <List.Section
          key={cat}
          title={cat}
          subtitle={`${shortcuts.length} shortcuts`}
        >
          {shortcuts.map((shortcut, index) => (
            <List.Item
              key={`${cat}-${index}`}
              title={shortcut.command}
              subtitle={shortcut.key}
              accessories={[{ tag: shortcut.key }]}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <Action.CopyToClipboard
                      title="Copy Key"
                      content={shortcut.key}
                    />
                    <Action.CopyToClipboard
                      title="Copy Command"
                      content={shortcut.command}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                    />
                  </ActionPanel.Section>
                  {shortcut.executable && (
                    <ActionPanel.Section>
                      <Action
                        title="Execute"
                        icon={Icon.Terminal}
                        onAction={async () => {
                          exec(shortcut.executable!, (error) => {
                            if (error) {
                              showToast({
                                style: Toast.Style.Failure,
                                title: "Failed to execute",
                                message: error.message,
                              });
                            } else {
                              showToast({
                                style: Toast.Style.Success,
                                title: "Executed",
                                message: shortcut.command,
                              });
                            }
                          });
                        }}
                      />
                    </ActionPanel.Section>
                  )}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

export default function Command() {
  const [selectedApp, setSelectedApp] = useState<AppData | null>(null);

  if (selectedApp) {
    return <ShortcutsList app={selectedApp} />;
  }

  return (
    <List searchBarPlaceholder="Search apps...">
      {apps.map((app) => (
        <List.Item
          key={app.name}
          title={app.name}
          icon={app.icon}
          subtitle={`${app.shortcuts.length} shortcuts`}
          actions={
            <ActionPanel>
              <Action
                title="View Shortcuts"
                icon={Icon.List}
                onAction={() => setSelectedApp(app)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
