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

// src/folder-search.tsx
var folder_search_exports = {};
__export(folder_search_exports, {
  default: () => Command
});
module.exports = __toCommonJS(folder_search_exports);
var import_api2 = require("@raycast/api");
var import_react = require("react");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_util2 = require("util");
var import_child_process2 = require("child_process");

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

// src/folder-search.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function Command() {
  const [searchText, setSearchText] = (0, import_react.useState)("");
  const [folders, setFolders] = (0, import_react.useState)([]);
  const [isLoading, setIsLoading] = (0, import_react.useState)(true);
  const searchFolders = (0, import_react.useCallback)(async () => {
    setIsLoading(true);
    try {
      const allFolders = await getAllFolders(NOTES_DIR);
      const filteredFolders = allFolders.filter(
        (folder) => folder.name.toLowerCase().includes(searchText.toLowerCase())
      );
      setFolders(filteredFolders);
    } catch (error) {
      console.error("Error searching folders:", error);
      (0, import_api2.showToast)(import_api2.Toast.Style.Failure, "Failed to search folders");
    }
    setIsLoading(false);
  }, [searchText]);
  (0, import_react.useEffect)(() => {
    searchFolders();
  }, [searchFolders]);
  async function getAllFolders(dir) {
    const readdir = (0, import_util2.promisify)(import_fs.default.readdir);
    const entries = await readdir(dir, { withFileTypes: true });
    const folders2 = [];
    for (const entry of entries) {
      const fullPath = import_path.default.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.includes(".git") && !entry.name.includes(".obsidian")) {
        folders2.push({ name: entry.name, path: fullPath });
        folders2.push(...await getAllFolders(fullPath));
      }
    }
    return folders2;
  }
  function openInFinder(folderPath) {
    (0, import_child_process2.exec)(`open "${folderPath}"`, (error) => {
      if (error) {
        console.error(`Error opening folder: ${error}`);
        (0, import_api2.showToast)(import_api2.Toast.Style.Failure, "Failed to open folder in Finder");
      } else {
        (0, import_api2.showToast)(import_api2.Toast.Style.Success, "Opened folder in Finder");
      }
    });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.List, { isLoading, onSearchTextChange: setSearchText, searchBarPlaceholder: "Search folders...", throttle: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.List.Section, { title: "Folders", subtitle: folders.length + " folders", children: folders.map((folder) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_api2.List.Item,
    {
      title: folder.name,
      subtitle: folder.path,
      actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_api2.ActionPanel, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.Action, { title: "Open in nvim", onAction: () => openInNvim(folder.path) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.Action, { title: "Open in Finder", onAction: () => openInFinder(folder.path) })
      ] })
    },
    folder.path
  )) }) });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vUHJvamVjdHMvdG9vbHMvcmF5Y2FzdC9udmltLW1hcmtkb3duLW5vdGVzL3NyYy9mb2xkZXItc2VhcmNoLnRzeCIsICIuLi8uLi8uLi8uLi9Qcm9qZWN0cy90b29scy9yYXljYXN0L252aW0tbWFya2Rvd24tbm90ZXMvc3JjL3V0aWxzLnRzIiwgIi4uLy4uLy4uLy4uL1Byb2plY3RzL3Rvb2xzL3JheWNhc3QvbnZpbS1tYXJrZG93bi1ub3Rlcy9zcmMvY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJcInVzZSBjbGllbnRcIjtcblxuaW1wb3J0IHsgTGlzdCwgQWN0aW9uUGFuZWwsIEFjdGlvbiwgc2hvd1RvYXN0LCBUb2FzdCB9IGZyb20gXCJAcmF5Y2FzdC9hcGlcIjtcbmltcG9ydCB7IHVzZVN0YXRlLCB1c2VFZmZlY3QsIHVzZUNhbGxiYWNrIH0gZnJvbSBcInJlYWN0XCI7XG5pbXBvcnQgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSBcInV0aWxcIjtcbmltcG9ydCB7IGV4ZWMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0IHsgb3BlbkluTnZpbSB9IGZyb20gXCIuL3V0aWxzXCI7XG5pbXBvcnQgeyBOT1RFU19ESVIgfSBmcm9tIFwiLi9jb25maWdcIjtcblxuaW50ZXJmYWNlIEZvbGRlciB7XG4gIG5hbWU6IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBDb21tYW5kKCkge1xuICBjb25zdCBbc2VhcmNoVGV4dCwgc2V0U2VhcmNoVGV4dF0gPSB1c2VTdGF0ZShcIlwiKTtcbiAgY29uc3QgW2ZvbGRlcnMsIHNldEZvbGRlcnNdID0gdXNlU3RhdGU8Rm9sZGVyW10+KFtdKTtcbiAgY29uc3QgW2lzTG9hZGluZywgc2V0SXNMb2FkaW5nXSA9IHVzZVN0YXRlKHRydWUpO1xuXG4gIGNvbnN0IHNlYXJjaEZvbGRlcnMgPSB1c2VDYWxsYmFjayhhc3luYyAoKSA9PiB7XG4gICAgc2V0SXNMb2FkaW5nKHRydWUpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBhbGxGb2xkZXJzID0gYXdhaXQgZ2V0QWxsRm9sZGVycyhOT1RFU19ESVIpO1xuICAgICAgY29uc3QgZmlsdGVyZWRGb2xkZXJzID0gYWxsRm9sZGVycy5maWx0ZXIoKGZvbGRlcikgPT5cbiAgICAgICAgZm9sZGVyLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhzZWFyY2hUZXh0LnRvTG93ZXJDYXNlKCkpLFxuICAgICAgKTtcbiAgICAgIHNldEZvbGRlcnMoZmlsdGVyZWRGb2xkZXJzKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIHNlYXJjaGluZyBmb2xkZXJzOlwiLCBlcnJvcik7XG4gICAgICBzaG93VG9hc3QoVG9hc3QuU3R5bGUuRmFpbHVyZSwgXCJGYWlsZWQgdG8gc2VhcmNoIGZvbGRlcnNcIik7XG4gICAgfVxuICAgIHNldElzTG9hZGluZyhmYWxzZSk7XG4gIH0sIFtzZWFyY2hUZXh0XSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBzZWFyY2hGb2xkZXJzKCk7XG4gIH0sIFtzZWFyY2hGb2xkZXJzXSk7XG5cbiAgYXN5bmMgZnVuY3Rpb24gZ2V0QWxsRm9sZGVycyhkaXI6IHN0cmluZyk6IFByb21pc2U8Rm9sZGVyW10+IHtcbiAgICBjb25zdCByZWFkZGlyID0gcHJvbWlzaWZ5KGZzLnJlYWRkaXIpO1xuXG4gICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHJlYWRkaXIoZGlyLCB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSk7XG4gICAgY29uc3QgZm9sZGVyczogRm9sZGVyW10gPSBbXTtcblxuICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4oZGlyLCBlbnRyeS5uYW1lKTtcbiAgICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpICYmICFlbnRyeS5uYW1lLmluY2x1ZGVzKFwiLmdpdFwiKSAmJiAhZW50cnkubmFtZS5pbmNsdWRlcyhcIi5vYnNpZGlhblwiKSkge1xuICAgICAgICBmb2xkZXJzLnB1c2goeyBuYW1lOiBlbnRyeS5uYW1lLCBwYXRoOiBmdWxsUGF0aCB9KTtcbiAgICAgICAgZm9sZGVycy5wdXNoKC4uLihhd2FpdCBnZXRBbGxGb2xkZXJzKGZ1bGxQYXRoKSkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmb2xkZXJzO1xuICB9XG5cbiAgZnVuY3Rpb24gb3BlbkluRmluZGVyKGZvbGRlclBhdGg6IHN0cmluZykge1xuICAgIGV4ZWMoYG9wZW4gXCIke2ZvbGRlclBhdGh9XCJgLCAoZXJyb3IpID0+IHtcbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBvcGVuaW5nIGZvbGRlcjogJHtlcnJvcn1gKTtcbiAgICAgICAgc2hvd1RvYXN0KFRvYXN0LlN0eWxlLkZhaWx1cmUsIFwiRmFpbGVkIHRvIG9wZW4gZm9sZGVyIGluIEZpbmRlclwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNob3dUb2FzdChUb2FzdC5TdHlsZS5TdWNjZXNzLCBcIk9wZW5lZCBmb2xkZXIgaW4gRmluZGVyXCIpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICA8TGlzdCBpc0xvYWRpbmc9e2lzTG9hZGluZ30gb25TZWFyY2hUZXh0Q2hhbmdlPXtzZXRTZWFyY2hUZXh0fSBzZWFyY2hCYXJQbGFjZWhvbGRlcj1cIlNlYXJjaCBmb2xkZXJzLi4uXCIgdGhyb3R0bGU+XG4gICAgICA8TGlzdC5TZWN0aW9uIHRpdGxlPVwiRm9sZGVyc1wiIHN1YnRpdGxlPXtmb2xkZXJzLmxlbmd0aCArIFwiIGZvbGRlcnNcIn0+XG4gICAgICAgIHtmb2xkZXJzLm1hcCgoZm9sZGVyKSA9PiAoXG4gICAgICAgICAgPExpc3QuSXRlbVxuICAgICAgICAgICAga2V5PXtmb2xkZXIucGF0aH1cbiAgICAgICAgICAgIHRpdGxlPXtmb2xkZXIubmFtZX1cbiAgICAgICAgICAgIHN1YnRpdGxlPXtmb2xkZXIucGF0aH1cbiAgICAgICAgICAgIGFjdGlvbnM9e1xuICAgICAgICAgICAgICA8QWN0aW9uUGFuZWw+XG4gICAgICAgICAgICAgICAgPEFjdGlvbiB0aXRsZT1cIk9wZW4gaW4gbnZpbVwiIG9uQWN0aW9uPXsoKSA9PiBvcGVuSW5OdmltKGZvbGRlci5wYXRoKX0gLz5cbiAgICAgICAgICAgICAgICA8QWN0aW9uIHRpdGxlPVwiT3BlbiBpbiBGaW5kZXJcIiBvbkFjdGlvbj17KCkgPT4gb3BlbkluRmluZGVyKGZvbGRlci5wYXRoKX0gLz5cbiAgICAgICAgICAgICAgPC9BY3Rpb25QYW5lbD5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAvPlxuICAgICAgICApKX1cbiAgICAgIDwvTGlzdC5TZWN0aW9uPlxuICAgIDwvTGlzdD5cbiAgKTtcbn1cbiIsICJpbXBvcnQgeyBjbG9zZU1haW5XaW5kb3csIHNob3dUb2FzdCwgVG9hc3QgfSBmcm9tIFwiQHJheWNhc3QvYXBpXCI7XG5pbXBvcnQgeyBLSVRUWV9MSVNURU5fT04sIEtJVFRZX1BBVEggfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCB1dGlsIGZyb20gXCJ1dGlsXCI7XG5pbXBvcnQgeyBleGVjIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmNvbnN0IGV4ZWNBc3luYyA9IHV0aWwucHJvbWlzaWZ5KGV4ZWMpO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3BlbkluTnZpbShub3RlUGF0aDogc3RyaW5nKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGlkID0gYXdhaXQgZ2V0S2l0dHlQaWQoKTtcbiAgICBjb25zdCBjb21tYW5kID0gYCR7S0lUVFlfUEFUSH0gQCAtLXRvIHVuaXg6JHtLSVRUWV9MSVNURU5fT059LSR7cGlkfSBsYXVuY2ggLS10eXBlIHRhYiAtLXRpdGxlIE5vdGUgbnZpbSBcIiR7bm90ZVBhdGh9XCJgO1xuXG4gICAgY29uc3QgeyBzdGRlcnIgfSA9IGF3YWl0IGV4ZWNBc3luYyhjb21tYW5kKTtcblxuICAgIGlmIChzdGRlcnIpIHRocm93IG5ldyBFcnJvcihzdGRlcnIpO1xuXG4gICAgc2hvd1RvYXN0KFRvYXN0LlN0eWxlLlN1Y2Nlc3MsIFwiT3BlbmVkIG5vdGUgaW4gbnZpbSB3aXRoaW4gdG11eCBzZXNzaW9uXCIpO1xuICAgIGNsb3NlTWFpbldpbmRvdygpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIG9wZW5pbmcgZmlsZTogJHtlcnJvcn1gKTtcbiAgICBzaG93VG9hc3QoVG9hc3QuU3R5bGUuRmFpbHVyZSwgXCJGYWlsZWQgdG8gb3BlbiBub3RlIGluIG52aW1cIik7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0S2l0dHlQaWQoKSB7XG4gIGNvbnN0IHsgc3Rkb3V0IH0gPSBhd2FpdCBleGVjQXN5bmMoYHBzIGF1eCB8IGdyZXAgJyR7S0lUVFlfUEFUSH0nIHwgZ3JlcCAtdiBncmVwIHwgYXdrICd7cHJpbnQgJDJ9J2ApO1xuICBjb25zdCBwaWQgPSBwYXJzZUludChzdGRvdXQudHJpbSgpKTtcbiAgaWYgKGlzTmFOKHBpZCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZCBub3QgZ2V0IGtpdHR5IHBpZFwiKTtcbiAgfVxuICByZXR1cm4gcGlkO1xufVxuIiwgImV4cG9ydCBjb25zdCBLSVRUWV9QQVRIID0gXCIvQXBwbGljYXRpb25zL2tpdHR5LmFwcC9Db250ZW50cy9NYWNPUy9raXR0eVwiO1xuZXhwb3J0IGNvbnN0IE5PVEVTX0RJUiA9IFwiL1VzZXJzL2pvbmFzL0xpYnJhcnkvTW9iaWxlIERvY3VtZW50cy9pQ2xvdWR+bWR+b2JzaWRpYW4vRG9jdW1lbnRzL05vdGVzXCI7XG5leHBvcnQgY29uc3QgSU5CT1hfRElSID0gYCR7Tk9URVNfRElSfS9pbmJveGA7XG5leHBvcnQgY29uc3QgS0lUVFlfTElTVEVOX09OID0gXCIvdG1wL215a2l0dHlcIjtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBRUEsSUFBQUEsY0FBNEQ7QUFDNUQsbUJBQWlEO0FBQ2pELGdCQUFlO0FBQ2Ysa0JBQWlCO0FBQ2pCLElBQUFDLGVBQTBCO0FBQzFCLElBQUFDLHdCQUFxQjs7O0FDUHJCLGlCQUFrRDs7O0FDQTNDLElBQU0sYUFBYTtBQUNuQixJQUFNLFlBQVk7QUFDbEIsSUFBTSxZQUFZLEdBQUcsU0FBUztBQUM5QixJQUFNLGtCQUFrQjs7O0FERC9CLGtCQUFpQjtBQUNqQiwyQkFBcUI7QUFDckIsSUFBTSxZQUFZLFlBQUFDLFFBQUssVUFBVSx5QkFBSTtBQUVyQyxlQUFzQixXQUFXLFVBQWtCO0FBQ2pELE1BQUk7QUFDRixVQUFNLE1BQU0sTUFBTSxZQUFZO0FBQzlCLFVBQU0sVUFBVSxHQUFHLFVBQVUsZ0JBQWdCLGVBQWUsSUFBSSxHQUFHLHlDQUF5QyxRQUFRO0FBRXBILFVBQU0sRUFBRSxPQUFPLElBQUksTUFBTSxVQUFVLE9BQU87QUFFMUMsUUFBSSxPQUFRLE9BQU0sSUFBSSxNQUFNLE1BQU07QUFFbEMsOEJBQVUsaUJBQU0sTUFBTSxTQUFTLHlDQUF5QztBQUN4RSxvQ0FBZ0I7QUFBQSxFQUNsQixTQUFTLE9BQU87QUFDZCxZQUFRLE1BQU0sdUJBQXVCLEtBQUssRUFBRTtBQUM1Qyw4QkFBVSxpQkFBTSxNQUFNLFNBQVMsNkJBQTZCO0FBQUEsRUFDOUQ7QUFDRjtBQUVBLGVBQWUsY0FBYztBQUMzQixRQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sVUFBVSxrQkFBa0IsVUFBVSxxQ0FBcUM7QUFDcEcsUUFBTSxNQUFNLFNBQVMsT0FBTyxLQUFLLENBQUM7QUFDbEMsTUFBSSxNQUFNLEdBQUcsR0FBRztBQUNkLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzNDO0FBQ0EsU0FBTztBQUNUOzs7QUQrQ2M7QUE3REMsU0FBUixVQUEyQjtBQUNoQyxRQUFNLENBQUMsWUFBWSxhQUFhLFFBQUksdUJBQVMsRUFBRTtBQUMvQyxRQUFNLENBQUMsU0FBUyxVQUFVLFFBQUksdUJBQW1CLENBQUMsQ0FBQztBQUNuRCxRQUFNLENBQUMsV0FBVyxZQUFZLFFBQUksdUJBQVMsSUFBSTtBQUUvQyxRQUFNLG9CQUFnQiwwQkFBWSxZQUFZO0FBQzVDLGlCQUFhLElBQUk7QUFDakIsUUFBSTtBQUNGLFlBQU0sYUFBYSxNQUFNLGNBQWMsU0FBUztBQUNoRCxZQUFNLGtCQUFrQixXQUFXO0FBQUEsUUFBTyxDQUFDLFdBQ3pDLE9BQU8sS0FBSyxZQUFZLEVBQUUsU0FBUyxXQUFXLFlBQVksQ0FBQztBQUFBLE1BQzdEO0FBQ0EsaUJBQVcsZUFBZTtBQUFBLElBQzVCLFNBQVMsT0FBTztBQUNkLGNBQVEsTUFBTSw0QkFBNEIsS0FBSztBQUMvQyxpQ0FBVSxrQkFBTSxNQUFNLFNBQVMsMEJBQTBCO0FBQUEsSUFDM0Q7QUFDQSxpQkFBYSxLQUFLO0FBQUEsRUFDcEIsR0FBRyxDQUFDLFVBQVUsQ0FBQztBQUVmLDhCQUFVLE1BQU07QUFDZCxrQkFBYztBQUFBLEVBQ2hCLEdBQUcsQ0FBQyxhQUFhLENBQUM7QUFFbEIsaUJBQWUsY0FBYyxLQUFnQztBQUMzRCxVQUFNLGNBQVUsd0JBQVUsVUFBQUMsUUFBRyxPQUFPO0FBRXBDLFVBQU0sVUFBVSxNQUFNLFFBQVEsS0FBSyxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQzFELFVBQU1DLFdBQW9CLENBQUM7QUFFM0IsZUFBVyxTQUFTLFNBQVM7QUFDM0IsWUFBTSxXQUFXLFlBQUFDLFFBQUssS0FBSyxLQUFLLE1BQU0sSUFBSTtBQUMxQyxVQUFJLE1BQU0sWUFBWSxLQUFLLENBQUMsTUFBTSxLQUFLLFNBQVMsTUFBTSxLQUFLLENBQUMsTUFBTSxLQUFLLFNBQVMsV0FBVyxHQUFHO0FBQzVGLFFBQUFELFNBQVEsS0FBSyxFQUFFLE1BQU0sTUFBTSxNQUFNLE1BQU0sU0FBUyxDQUFDO0FBQ2pELFFBQUFBLFNBQVEsS0FBSyxHQUFJLE1BQU0sY0FBYyxRQUFRLENBQUU7QUFBQSxNQUNqRDtBQUFBLElBQ0Y7QUFFQSxXQUFPQTtBQUFBLEVBQ1Q7QUFFQSxXQUFTLGFBQWEsWUFBb0I7QUFDeEMsb0NBQUssU0FBUyxVQUFVLEtBQUssQ0FBQyxVQUFVO0FBQ3RDLFVBQUksT0FBTztBQUNULGdCQUFRLE1BQU0seUJBQXlCLEtBQUssRUFBRTtBQUM5QyxtQ0FBVSxrQkFBTSxNQUFNLFNBQVMsaUNBQWlDO0FBQUEsTUFDbEUsT0FBTztBQUNMLG1DQUFVLGtCQUFNLE1BQU0sU0FBUyx5QkFBeUI7QUFBQSxNQUMxRDtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFFQSxTQUNFLDRDQUFDLG9CQUFLLFdBQXNCLG9CQUFvQixlQUFlLHNCQUFxQixxQkFBb0IsVUFBUSxNQUM5RyxzREFBQyxpQkFBSyxTQUFMLEVBQWEsT0FBTSxXQUFVLFVBQVUsUUFBUSxTQUFTLFlBQ3RELGtCQUFRLElBQUksQ0FBQyxXQUNaO0FBQUEsSUFBQyxpQkFBSztBQUFBLElBQUw7QUFBQSxNQUVDLE9BQU8sT0FBTztBQUFBLE1BQ2QsVUFBVSxPQUFPO0FBQUEsTUFDakIsU0FDRSw2Q0FBQywyQkFDQztBQUFBLG9EQUFDLHNCQUFPLE9BQU0sZ0JBQWUsVUFBVSxNQUFNLFdBQVcsT0FBTyxJQUFJLEdBQUc7QUFBQSxRQUN0RSw0Q0FBQyxzQkFBTyxPQUFNLGtCQUFpQixVQUFVLE1BQU0sYUFBYSxPQUFPLElBQUksR0FBRztBQUFBLFNBQzVFO0FBQUE7QUFBQSxJQVBHLE9BQU87QUFBQSxFQVNkLENBQ0QsR0FDSCxHQUNGO0FBRUo7IiwKICAibmFtZXMiOiBbImltcG9ydF9hcGkiLCAiaW1wb3J0X3V0aWwiLCAiaW1wb3J0X2NoaWxkX3Byb2Nlc3MiLCAidXRpbCIsICJmcyIsICJmb2xkZXJzIiwgInBhdGgiXQp9Cg==
