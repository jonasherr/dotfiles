"use strict";
"use client";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/search-notes.tsx
var search_notes_exports = {};
__export(search_notes_exports, {
  default: () => Command
});
module.exports = __toCommonJS(search_notes_exports);
var import_api2 = require("@raycast/api");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_react = require("react");
var import_util2 = require("util");

// src/utils.ts
var import_api = require("@raycast/api");

// src/config.ts
var KITTY_PATH = "/Applications/kitty.app/Contents/MacOS/kitty";
var NOTES_DIR = "/Users/jonas/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes";
var INBOX_DIR = `${NOTES_DIR}/inbox`;
var KITTY_LISTEN_ON = "/tmp/mykitty";

// src/utils.ts
var import_util = __toESM(require("util"));
var import_child_process = require("child_process");
var execAsync = import_util.default.promisify(import_child_process.exec);
async function openInNvim(notePath) {
  try {
    const pid = await getKittyPid();
    const command = `${KITTY_PATH} @ --to unix:${KITTY_LISTEN_ON}-${pid} launch --type tab --title Note nvim "${notePath}"`;
    const { stderr } = await execAsync(command);
    if (stderr) throw new Error(stderr);
    (0, import_api.showToast)(import_api.Toast.Style.Success, "Opened note in nvim within tmux session");
    (0, import_api.closeMainWindow)();
  } catch (error) {
    console.error(`Error opening file: ${error}`);
    (0, import_api.showToast)(import_api.Toast.Style.Failure, "Failed to open note in nvim");
  }
}
async function getKittyPid() {
  const { stdout } = await execAsync(`ps aux | grep '${KITTY_PATH}' | grep -v grep | awk '{print $2}'`);
  const pid = parseInt(stdout.trim());
  if (isNaN(pid)) {
    throw new Error("Could not get kitty pid");
  }
  return pid;
}

// src/search-notes.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function Command() {
  const [searchText, setSearchText] = (0, import_react.useState)("");
  const [notes, setNotes] = (0, import_react.useState)([]);
  const [selectedNote, setSelectedNote] = (0, import_react.useState)(null);
  const searchNotes = (0, import_react.useCallback)(async () => {
    try {
      const allNotes = await getAllNotes(NOTES_DIR);
      const filteredNotes = allNotes.filter(
        (note) => note.title.toLowerCase().includes(searchText.toLowerCase()) || note.content.toLowerCase().includes(searchText.toLowerCase())
      );
      const sortedNotes = filteredNotes.sort((a, b) => {
        const aInTitle = a.title.toLowerCase().includes(searchText.toLowerCase());
        const bInTitle = b.title.toLowerCase().includes(searchText.toLowerCase());
        if (aInTitle && !bInTitle) return -1;
        if (!aInTitle && bInTitle) return 1;
        return 0;
      });
      setNotes(sortedNotes);
      if (sortedNotes.length > 0 && !selectedNote) {
        setSelectedNote(sortedNotes[0]);
      }
    } catch (error) {
      console.error("Error searching notes:", error);
      (0, import_api2.showToast)(import_api2.Toast.Style.Failure, "Failed to search notes");
    }
  }, [searchText, selectedNote]);
  (0, import_react.useEffect)(() => {
    searchNotes();
  }, [searchNotes]);
  async function getAllNotes(dir) {
    const readdir = (0, import_util2.promisify)(import_fs.default.readdir);
    const entries = await readdir(dir, { withFileTypes: true });
    const notes2 = [];
    for (const entry of entries) {
      const fullPath = import_path.default.join(dir, entry.name);
      if (entry.isDirectory()) {
        notes2.push(...await getAllNotes(fullPath));
      } else if (entry.isFile() && import_path.default.extname(entry.name) === ".md") {
        const readFile = (0, import_util2.promisify)(import_fs.default.readFile);
        const content = await readFile(fullPath, "utf-8");
        const title = import_path.default.basename(entry.name, ".md");
        notes2.push({ title, content, path: fullPath });
      }
    }
    return notes2;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_api2.List,
    {
      isLoading: notes.length === 0,
      onSearchTextChange: setSearchText,
      searchBarPlaceholder: "Search notes...",
      throttle: true,
      selectedItemId: selectedNote?.path,
      onSelectionChange: (id) => {
        const note = notes.find((n) => n.path === id);
        if (note) {
          setSelectedNote(note);
        }
      },
      isShowingDetail: true,
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.List.Section, { title: "Notes", subtitle: notes.length + " notes", children: notes.map((note) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_api2.List.Item,
        {
          id: note.path,
          title: note.title,
          subtitle: note.content.slice(0, 100),
          actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.ActionPanel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.Action, { title: "Open in nvim", onAction: () => openInNvim(note.path) }) }),
          detail: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            import_api2.List.Item.Detail,
            {
              markdown: note.content,
              metadata: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_api2.List.Item.Detail.Metadata, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.List.Item.Detail.Metadata.Label, { title: "Title", text: note.title }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.List.Item.Detail.Metadata.Separator, {}),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.List.Item.Detail.Metadata.Label, { title: "Path", text: note.path })
              ] })
            }
          )
        },
        note.path
      )) })
    }
  );
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vUHJvamVjdHMvdG9vbHMvcmF5Y2FzdC9udmltLW1hcmtkb3duLW5vdGVzL3NyYy9zZWFyY2gtbm90ZXMudHN4IiwgIi4uLy4uLy4uLy4uL1Byb2plY3RzL3Rvb2xzL3JheWNhc3QvbnZpbS1tYXJrZG93bi1ub3Rlcy9zcmMvdXRpbHMudHMiLCAiLi4vLi4vLi4vLi4vUHJvamVjdHMvdG9vbHMvcmF5Y2FzdC9udmltLW1hcmtkb3duLW5vdGVzL3NyYy9jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIlwidXNlIGNsaWVudFwiO1xuXG5pbXBvcnQgeyBBY3Rpb24sIEFjdGlvblBhbmVsLCBMaXN0LCBzaG93VG9hc3QsIFRvYXN0IH0gZnJvbSBcIkByYXljYXN0L2FwaVwiO1xuaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHVzZUNhbGxiYWNrLCB1c2VFZmZlY3QsIHVzZVN0YXRlIH0gZnJvbSBcInJlYWN0XCI7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tIFwidXRpbFwiO1xuaW1wb3J0IHsgb3BlbkluTnZpbSB9IGZyb20gXCIuL3V0aWxzXCI7XG5pbXBvcnQgeyBOT1RFU19ESVIgfSBmcm9tIFwiLi9jb25maWdcIjtcblxuaW50ZXJmYWNlIE5vdGUge1xuICB0aXRsZTogc3RyaW5nO1xuICBjb250ZW50OiBzdHJpbmc7XG4gIHBhdGg6IHN0cmluZztcbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gQ29tbWFuZCgpIHtcbiAgY29uc3QgW3NlYXJjaFRleHQsIHNldFNlYXJjaFRleHRdID0gdXNlU3RhdGUoXCJcIik7XG4gIGNvbnN0IFtub3Rlcywgc2V0Tm90ZXNdID0gdXNlU3RhdGU8Tm90ZVtdPihbXSk7XG4gIGNvbnN0IFtzZWxlY3RlZE5vdGUsIHNldFNlbGVjdGVkTm90ZV0gPSB1c2VTdGF0ZTxOb3RlIHwgbnVsbD4obnVsbCk7XG5cbiAgY29uc3Qgc2VhcmNoTm90ZXMgPSB1c2VDYWxsYmFjayhhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFsbE5vdGVzID0gYXdhaXQgZ2V0QWxsTm90ZXMoTk9URVNfRElSKTtcbiAgICAgIGNvbnN0IGZpbHRlcmVkTm90ZXMgPSBhbGxOb3Rlcy5maWx0ZXIoXG4gICAgICAgIChub3RlKSA9PlxuICAgICAgICAgIG5vdGUudGl0bGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhzZWFyY2hUZXh0LnRvTG93ZXJDYXNlKCkpIHx8XG4gICAgICAgICAgbm90ZS5jb250ZW50LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoc2VhcmNoVGV4dC50b0xvd2VyQ2FzZSgpKSxcbiAgICAgICk7XG5cbiAgICAgIC8vIFNvcnQgbm90ZXM6IHRpdGxlIG1hdGNoZXMgZmlyc3QsIHRoZW4gY29udGVudCBtYXRjaGVzXG4gICAgICBjb25zdCBzb3J0ZWROb3RlcyA9IGZpbHRlcmVkTm90ZXMuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBjb25zdCBhSW5UaXRsZSA9IGEudGl0bGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhzZWFyY2hUZXh0LnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICBjb25zdCBiSW5UaXRsZSA9IGIudGl0bGUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhzZWFyY2hUZXh0LnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICBpZiAoYUluVGl0bGUgJiYgIWJJblRpdGxlKSByZXR1cm4gLTE7XG4gICAgICAgIGlmICghYUluVGl0bGUgJiYgYkluVGl0bGUpIHJldHVybiAxO1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuXG4gICAgICBzZXROb3Rlcyhzb3J0ZWROb3Rlcyk7XG4gICAgICBpZiAoc29ydGVkTm90ZXMubGVuZ3RoID4gMCAmJiAhc2VsZWN0ZWROb3RlKSB7XG4gICAgICAgIHNldFNlbGVjdGVkTm90ZShzb3J0ZWROb3Rlc1swXSk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBzZWFyY2hpbmcgbm90ZXM6XCIsIGVycm9yKTtcbiAgICAgIHNob3dUb2FzdChUb2FzdC5TdHlsZS5GYWlsdXJlLCBcIkZhaWxlZCB0byBzZWFyY2ggbm90ZXNcIik7XG4gICAgfVxuICB9LCBbc2VhcmNoVGV4dCwgc2VsZWN0ZWROb3RlXSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBzZWFyY2hOb3RlcygpO1xuICB9LCBbc2VhcmNoTm90ZXNdKTtcblxuICBhc3luYyBmdW5jdGlvbiBnZXRBbGxOb3RlcyhkaXI6IHN0cmluZyk6IFByb21pc2U8Tm90ZVtdPiB7XG4gICAgY29uc3QgcmVhZGRpciA9IHByb21pc2lmeShmcy5yZWFkZGlyKTtcbiAgICBjb25zdCBlbnRyaWVzID0gYXdhaXQgcmVhZGRpcihkaXIsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcbiAgICBjb25zdCBub3RlczogTm90ZVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5qb2luKGRpciwgZW50cnkubmFtZSk7XG4gICAgICBpZiAoZW50cnkuaXNEaXJlY3RvcnkoKSkge1xuICAgICAgICBub3Rlcy5wdXNoKC4uLihhd2FpdCBnZXRBbGxOb3RlcyhmdWxsUGF0aCkpKTtcbiAgICAgIH0gZWxzZSBpZiAoZW50cnkuaXNGaWxlKCkgJiYgcGF0aC5leHRuYW1lKGVudHJ5Lm5hbWUpID09PSBcIi5tZFwiKSB7XG4gICAgICAgIGNvbnN0IHJlYWRGaWxlID0gcHJvbWlzaWZ5KGZzLnJlYWRGaWxlKTtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHJlYWRGaWxlKGZ1bGxQYXRoLCBcInV0Zi04XCIpO1xuICAgICAgICBjb25zdCB0aXRsZSA9IHBhdGguYmFzZW5hbWUoZW50cnkubmFtZSwgXCIubWRcIik7XG4gICAgICAgIG5vdGVzLnB1c2goeyB0aXRsZSwgY29udGVudCwgcGF0aDogZnVsbFBhdGggfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG5vdGVzO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICA8TGlzdFxuICAgICAgaXNMb2FkaW5nPXtub3Rlcy5sZW5ndGggPT09IDB9XG4gICAgICBvblNlYXJjaFRleHRDaGFuZ2U9e3NldFNlYXJjaFRleHR9XG4gICAgICBzZWFyY2hCYXJQbGFjZWhvbGRlcj1cIlNlYXJjaCBub3Rlcy4uLlwiXG4gICAgICB0aHJvdHRsZVxuICAgICAgc2VsZWN0ZWRJdGVtSWQ9e3NlbGVjdGVkTm90ZT8ucGF0aH1cbiAgICAgIG9uU2VsZWN0aW9uQ2hhbmdlPXsoaWQpID0+IHtcbiAgICAgICAgY29uc3Qgbm90ZSA9IG5vdGVzLmZpbmQoKG4pID0+IG4ucGF0aCA9PT0gaWQpO1xuICAgICAgICBpZiAobm90ZSkge1xuICAgICAgICAgIHNldFNlbGVjdGVkTm90ZShub3RlKTtcbiAgICAgICAgfVxuICAgICAgfX1cbiAgICAgIGlzU2hvd2luZ0RldGFpbFxuICAgID5cbiAgICAgIDxMaXN0LlNlY3Rpb24gdGl0bGU9XCJOb3Rlc1wiIHN1YnRpdGxlPXtub3Rlcy5sZW5ndGggKyBcIiBub3Rlc1wifT5cbiAgICAgICAge25vdGVzLm1hcCgobm90ZSkgPT4gKFxuICAgICAgICAgIDxMaXN0Lkl0ZW1cbiAgICAgICAgICAgIGtleT17bm90ZS5wYXRofVxuICAgICAgICAgICAgaWQ9e25vdGUucGF0aH1cbiAgICAgICAgICAgIHRpdGxlPXtub3RlLnRpdGxlfVxuICAgICAgICAgICAgc3VidGl0bGU9e25vdGUuY29udGVudC5zbGljZSgwLCAxMDApfVxuICAgICAgICAgICAgYWN0aW9ucz17XG4gICAgICAgICAgICAgIDxBY3Rpb25QYW5lbD5cbiAgICAgICAgICAgICAgICA8QWN0aW9uIHRpdGxlPVwiT3BlbiBpbiBudmltXCIgb25BY3Rpb249eygpID0+IG9wZW5Jbk52aW0obm90ZS5wYXRoKX0gLz5cbiAgICAgICAgICAgICAgPC9BY3Rpb25QYW5lbD5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRldGFpbD17XG4gICAgICAgICAgICAgIDxMaXN0Lkl0ZW0uRGV0YWlsXG4gICAgICAgICAgICAgICAgbWFya2Rvd249e25vdGUuY29udGVudH1cbiAgICAgICAgICAgICAgICBtZXRhZGF0YT17XG4gICAgICAgICAgICAgICAgICA8TGlzdC5JdGVtLkRldGFpbC5NZXRhZGF0YT5cbiAgICAgICAgICAgICAgICAgICAgPExpc3QuSXRlbS5EZXRhaWwuTWV0YWRhdGEuTGFiZWwgdGl0bGU9XCJUaXRsZVwiIHRleHQ9e25vdGUudGl0bGV9IC8+XG4gICAgICAgICAgICAgICAgICAgIDxMaXN0Lkl0ZW0uRGV0YWlsLk1ldGFkYXRhLlNlcGFyYXRvciAvPlxuICAgICAgICAgICAgICAgICAgICA8TGlzdC5JdGVtLkRldGFpbC5NZXRhZGF0YS5MYWJlbCB0aXRsZT1cIlBhdGhcIiB0ZXh0PXtub3RlLnBhdGh9IC8+XG4gICAgICAgICAgICAgICAgICA8L0xpc3QuSXRlbS5EZXRhaWwuTWV0YWRhdGE+XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgfVxuICAgICAgICAgIC8+XG4gICAgICAgICkpfVxuICAgICAgPC9MaXN0LlNlY3Rpb24+XG4gICAgPC9MaXN0PlxuICApO1xufVxuIiwgImltcG9ydCB7IGNsb3NlTWFpbldpbmRvdywgc2hvd1RvYXN0LCBUb2FzdCB9IGZyb20gXCJAcmF5Y2FzdC9hcGlcIjtcbmltcG9ydCB7IEtJVFRZX0xJU1RFTl9PTiwgS0lUVFlfUEFUSCB9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IHV0aWwgZnJvbSBcInV0aWxcIjtcbmltcG9ydCB7IGV4ZWMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuY29uc3QgZXhlY0FzeW5jID0gdXRpbC5wcm9taXNpZnkoZXhlYyk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuSW5OdmltKG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwaWQgPSBhd2FpdCBnZXRLaXR0eVBpZCgpO1xuICAgIGNvbnN0IGNvbW1hbmQgPSBgJHtLSVRUWV9QQVRIfSBAIC0tdG8gdW5peDoke0tJVFRZX0xJU1RFTl9PTn0tJHtwaWR9IGxhdW5jaCAtLXR5cGUgdGFiIC0tdGl0bGUgTm90ZSBudmltIFwiJHtub3RlUGF0aH1cImA7XG5cbiAgICBjb25zdCB7IHN0ZGVyciB9ID0gYXdhaXQgZXhlY0FzeW5jKGNvbW1hbmQpO1xuXG4gICAgaWYgKHN0ZGVycikgdGhyb3cgbmV3IEVycm9yKHN0ZGVycik7XG5cbiAgICBzaG93VG9hc3QoVG9hc3QuU3R5bGUuU3VjY2VzcywgXCJPcGVuZWQgbm90ZSBpbiBudmltIHdpdGhpbiB0bXV4IHNlc3Npb25cIik7XG4gICAgY2xvc2VNYWluV2luZG93KCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgRXJyb3Igb3BlbmluZyBmaWxlOiAke2Vycm9yfWApO1xuICAgIHNob3dUb2FzdChUb2FzdC5TdHlsZS5GYWlsdXJlLCBcIkZhaWxlZCB0byBvcGVuIG5vdGUgaW4gbnZpbVwiKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRLaXR0eVBpZCgpIHtcbiAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNBc3luYyhgcHMgYXV4IHwgZ3JlcCAnJHtLSVRUWV9QQVRIfScgfCBncmVwIC12IGdyZXAgfCBhd2sgJ3twcmludCAkMn0nYCk7XG4gIGNvbnN0IHBpZCA9IHBhcnNlSW50KHN0ZG91dC50cmltKCkpO1xuICBpZiAoaXNOYU4ocGlkKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBnZXQga2l0dHkgcGlkXCIpO1xuICB9XG4gIHJldHVybiBwaWQ7XG59XG4iLCAiZXhwb3J0IGNvbnN0IEtJVFRZX1BBVEggPSBcIi9BcHBsaWNhdGlvbnMva2l0dHkuYXBwL0NvbnRlbnRzL01hY09TL2tpdHR5XCI7XG5leHBvcnQgY29uc3QgTk9URVNfRElSID0gXCIvVXNlcnMvam9uYXMvTGlicmFyeS9Nb2JpbGUgRG9jdW1lbnRzL2lDbG91ZH5tZH5vYnNpZGlhbi9Eb2N1bWVudHMvTm90ZXNcIjtcbmV4cG9ydCBjb25zdCBJTkJPWF9ESVIgPSBgJHtOT1RFU19ESVJ9L2luYm94YDtcbmV4cG9ydCBjb25zdCBLSVRUWV9MSVNURU5fT04gPSBcIi90bXAvbXlraXR0eVwiO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFFQSxJQUFBQSxjQUE0RDtBQUM1RCxnQkFBZTtBQUNmLGtCQUFpQjtBQUNqQixtQkFBaUQ7QUFDakQsSUFBQUMsZUFBMEI7OztBQ04xQixpQkFBa0Q7OztBQ0EzQyxJQUFNLGFBQWE7QUFDbkIsSUFBTSxZQUFZO0FBQ2xCLElBQU0sWUFBWSxHQUFHLFNBQVM7QUFDOUIsSUFBTSxrQkFBa0I7OztBREQvQixrQkFBaUI7QUFDakIsMkJBQXFCO0FBQ3JCLElBQU0sWUFBWSxZQUFBQyxRQUFLLFVBQVUseUJBQUk7QUFFckMsZUFBc0IsV0FBVyxVQUFrQjtBQUNqRCxNQUFJO0FBQ0YsVUFBTSxNQUFNLE1BQU0sWUFBWTtBQUM5QixVQUFNLFVBQVUsR0FBRyxVQUFVLGdCQUFnQixlQUFlLElBQUksR0FBRyx5Q0FBeUMsUUFBUTtBQUVwSCxVQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sVUFBVSxPQUFPO0FBRTFDLFFBQUksT0FBUSxPQUFNLElBQUksTUFBTSxNQUFNO0FBRWxDLDhCQUFVLGlCQUFNLE1BQU0sU0FBUyx5Q0FBeUM7QUFDeEUsb0NBQWdCO0FBQUEsRUFDbEIsU0FBUyxPQUFPO0FBQ2QsWUFBUSxNQUFNLHVCQUF1QixLQUFLLEVBQUU7QUFDNUMsOEJBQVUsaUJBQU0sTUFBTSxTQUFTLDZCQUE2QjtBQUFBLEVBQzlEO0FBQ0Y7QUFFQSxlQUFlLGNBQWM7QUFDM0IsUUFBTSxFQUFFLE9B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QzVDLFlBQUksTUFBTTtBQUNSLDBCQUFnQixJQUFJO0FBQUEsUUFDdEI7QUFBQSxNQUNGO0FBQUEsTUFDQSxpQkFBZTtBQUFBLE1BRWYsc0RBQUMsaUJBQUssU0FBTCxFQUFhLE9BQU0sU0FBUSxVQUFVLE1BQU0sU0FBUyxVQUNsRCxnQkFBTSxJQUFJLENBQUMsU0FDVjtBQUFBLFFBQUMsaUJBQUs7QUFBQSxRQUFMO0FBQUEsVUFFQyxJQUFJLEtBQUs7QUFBQSxVQUNULE9BQU8sS0FBSztBQUFBLFVBQ1osVUFBVSxLQUFLLFFBQVEsTUFBTSxHQUFHLEdBQUc7QUFBQSxVQUNuQyxTQUNFLDRDQUFDLDJCQUNDLHNEQUFDLHNCQUFPLE9BQU0sZ0JBQWUsVUFBVSxNQUFNLFdBQVcsS0FBSyxJQUFJLEdBQUcsR0FDdEU7QUFBQSxVQUVGLFFBQ0U7QUFBQSxZQUFDLGlCQUFLLEtBQUs7QUFBQSxZQUFWO0FBQUEsY0FDQyxVQUFVLEtBQUs7QUFBQSxjQUNmLFVBQ0UsNkNBQUMsaUJBQUssS0FBSyxPQUFPLFVBQWpCLEVBQ0M7QUFBQSw0REFBQyxpQkFBSyxLQUFLLE9BQU8sU0FBUyxPQUExQixFQUFnQyxPQUFNLFNBQVEsTUFBTSxLQUFLLE9BQU87QUFBQSxnQkFDakUsNENBQUMsaUJBQUssS0FBSyxPQUFPLFNBQVMsV0FBMUIsRUFBb0M7QUFBQSxnQkFDckMsNENBQUMsaUJBQUssS0FBSyxPQUFPLFNBQVMsT0FBMUIsRUFBZ0MsT0FBTSxRQUFPLE1BQU0sS0FBSyxNQUFNO0FBQUEsaUJBQ2pFO0FBQUE7QUFBQSxVQUVKO0FBQUE7QUFBQSxRQW5CRyxLQUFLO0FBQUEsTUFxQlosQ0FDRCxHQUNIO0FBQUE7QUFBQSxFQUNGO0FBRUo7IiwKICAibmFtZXMiOiBbImltcG9ydF9hcGkiLCAiaW1wb3J0X3V0aWwiLCAidXRpbCIsICJmcyIsICJub3RlcyIsICJwYXRoIl0KfQo=
