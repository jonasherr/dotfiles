"use strict";
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

// src/new-note.tsx
var new_note_exports = {};
__export(new_note_exports, {
  default: () => command
});
module.exports = __toCommonJS(new_note_exports);
var import_api2 = require("@raycast/api");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
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
    const command2 = `${KITTY_PATH} @ --to unix:${KITTY_LISTEN_ON}-${pid} launch --type tab --title Note nvim "${notePath}"`;
    const { stderr } = await execAsync(command2);
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

// src/new-note.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function command() {
  const handleSubmit = async (values) => {
    try {
      const notePath = await createNewNote(values.name);
      await (0, import_api2.showToast)(import_api2.Toast.Style.Success, "Created new note", notePath);
      openInNvim(notePath);
    } catch (error) {
      console.error("Error in new note command:", error);
      await (0, import_api2.showToast)(import_api2.Toast.Style.Failure, "Failed to create new note");
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_api2.Form,
    {
      actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.ActionPanel, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.Action.SubmitForm, { title: "Submit", onSubmit: handleSubmit }) }),
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_api2.Form.TextField, { title: "Filename", id: "name" })
    }
  );
}
async function createNewNote(fileName) {
  const currentTime = /* @__PURE__ */ new Date();
  const filePath = import_path.default.join(INBOX_DIR, fileName);
  const template = `# New Note

Created on: ${currentTime.toLocaleString()}

`;
  const writeFile = (0, import_util2.promisify)(import_fs.default.writeFile);
  await writeFile(filePath, template, "utf8");
  return filePath;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vUHJvamVjdHMvdG9vbHMvcmF5Y2FzdC9udmltLW1hcmtkb3duLW5vdGVzL3NyYy9uZXctbm90ZS50c3giLCAiLi4vLi4vLi4vLi4vUHJvamVjdHMvdG9vbHMvcmF5Y2FzdC9udmltLW1hcmtkb3duLW5vdGVzL3NyYy91dGlscy50cyIsICIuLi8uLi8uLi8uLi9Qcm9qZWN0cy90b29scy9yYXljYXN0L252aW0tbWFya2Rvd24tbm90ZXMvc3JjL2NvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgQWN0aW9uLCBBY3Rpb25QYW5lbCwgRm9ybSwgc2hvd1RvYXN0LCBUb2FzdCB9IGZyb20gXCJAcmF5Y2FzdC9hcGlcIjtcbmltcG9ydCBmcyBmcm9tIFwiZnNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tIFwidXRpbFwiO1xuaW1wb3J0IHsgb3BlbkluTnZpbSB9IGZyb20gXCIuL3V0aWxzXCI7XG5pbXBvcnQgeyBJTkJPWF9ESVIgfSBmcm9tIFwiLi9jb25maWdcIjtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gY29tbWFuZCgpIHtcbiAgY29uc3QgaGFuZGxlU3VibWl0ID0gYXN5bmMgKHZhbHVlczogeyBuYW1lOiBzdHJpbmcgfSkgPT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBub3RlUGF0aCA9IGF3YWl0IGNyZWF0ZU5ld05vdGUodmFsdWVzLm5hbWUpO1xuICAgICAgYXdhaXQgc2hvd1RvYXN0KFRvYXN0LlN0eWxlLlN1Y2Nlc3MsIFwiQ3JlYXRlZCBuZXcgbm90ZVwiLCBub3RlUGF0aCk7XG5cbiAgICAgIG9wZW5Jbk52aW0obm90ZVBhdGgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgaW4gbmV3IG5vdGUgY29tbWFuZDpcIiwgZXJyb3IpO1xuICAgICAgYXdhaXQgc2hvd1RvYXN0KFRvYXN0LlN0eWxlLkZhaWx1cmUsIFwiRmFpbGVkIHRvIGNyZWF0ZSBuZXcgbm90ZVwiKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIChcbiAgICA8Rm9ybVxuICAgICAgYWN0aW9ucz17XG4gICAgICAgIDxBY3Rpb25QYW5lbD5cbiAgICAgICAgICA8QWN0aW9uLlN1Ym1pdEZvcm0gdGl0bGU9XCJTdWJtaXRcIiBvblN1Ym1pdD17aGFuZGxlU3VibWl0fSAvPlxuICAgICAgICA8L0FjdGlvblBhbmVsPlxuICAgICAgfVxuICAgID5cbiAgICAgIDxGb3JtLlRleHRGaWVsZCB0aXRsZT1cIkZpbGVuYW1lXCIgaWQ9XCJuYW1lXCIgLz5cbiAgICA8L0Zvcm0+XG4gICk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZU5ld05vdGUoZmlsZU5hbWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGN1cnJlbnRUaW1lID0gbmV3IERhdGUoKTtcbiAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oSU5CT1hfRElSLCBmaWxlTmFtZSk7XG5cbiAgY29uc3QgdGVtcGxhdGUgPSBgIyBOZXcgTm90ZVxcblxcbkNyZWF0ZWQgb246ICR7Y3VycmVudFRpbWUudG9Mb2NhbGVTdHJpbmcoKX1cXG5cXG5gO1xuXG4gIGNvbnN0IHdyaXRlRmlsZSA9IHByb21pc2lmeShmcy53cml0ZUZpbGUpO1xuICBhd2FpdCB3cml0ZUZpbGUoZmlsZVBhdGgsIHRlbXBsYXRlLCBcInV0ZjhcIik7XG5cbiAgcmV0dXJuIGZpbGVQYXRoO1xufVxuIiwgImltcG9ydCB7IGNsb3NlTWFpbldpbmRvdywgc2hvd1RvYXN0LCBUb2FzdCB9IGZyb20gXCJAcmF5Y2FzdC9hcGlcIjtcbmltcG9ydCB7IEtJVFRZX0xJU1RFTl9PTiwgS0lUVFlfUEFUSCB9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IHV0aWwgZnJvbSBcInV0aWxcIjtcbmltcG9ydCB7IGV4ZWMgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuY29uc3QgZXhlY0FzeW5jID0gdXRpbC5wcm9taXNpZnkoZXhlYyk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuSW5OdmltKG5vdGVQYXRoOiBzdHJpbmcpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwaWQgPSBhd2FpdCBnZXRLaXR0eVBpZCgpO1xuICAgIGNvbnN0IGNvbW1hbmQgPSBgJHtLSVRUWV9QQVRIfSBAIC0tdG8gdW5peDoke0tJVFRZX0xJU1RFTl9PTn0tJHtwaWR9IGxhdW5jaCAtLXR5cGUgdGFiIC0tdGl0bGUgTm90ZSBudmltIFwiJHtub3RlUGF0aH1cImA7XG5cbiAgICBjb25zdCB7IHN0ZGVyciB9ID0gYXdhaXQgZXhlY0FzeW5jKGNvbW1hbmQpO1xuXG4gICAgaWYgKHN0ZGVycikgdGhyb3cgbmV3IEVycm9yKHN0ZGVycik7XG5cbiAgICBzaG93VG9hc3QoVG9hc3QuU3R5bGUuU3VjY2VzcywgXCJPcGVuZWQgbm90ZSBpbiBudmltIHdpdGhpbiB0bXV4IHNlc3Npb25cIik7XG4gICAgY2xvc2VNYWluV2luZG93KCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgRXJyb3Igb3BlbmluZyBmaWxlOiAke2Vycm9yfWApO1xuICAgIHNob3dUb2FzdChUb2FzdC5TdHlsZS5GYWlsdXJlLCBcIkZhaWxlZCB0byBvcGVuIG5vdGUgaW4gbnZpbVwiKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRLaXR0eVBpZCgpIHtcbiAgY29uc3QgeyBzdGRvdXQgfSA9IGF3YWl0IGV4ZWNBc3luYyhgcHMgYXV4IHwgZ3JlcCAnJHtLSVRUWV9QQVRIfScgfCBncmVwIC12IGdyZXAgfCBhd2sgJ3twcmludCAkMn0nYCk7XG4gIGNvbnN0IHBpZCA9IHBhcnNlSW50KHN0ZG91dC50cmltKCkpO1xuICBpZiAoaXNOYU4ocGlkKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBnZXQga2l0dHkgcGlkXCIpO1xuICB9XG4gIHJldHVybiBwaWQ7XG59XG4iLCAiZXhwb3J0IGNvbnN0IEtJVFRZX1BBVEggPSBcIi9BcHBsaWNhdGlvbnMva2l0dHkuYXBwL0NvbnRlbnRzL01hY09TL2tpdHR5XCI7XG5leHBvcnQgY29uc3QgTk9URVNfRElSID0gXCIvVXNlcnMvam9uYXMvTGlicmFyeS9Nb2JpbGUgRG9jdW1lbnRzL2lDbG91ZH5tZH5vYnNpZGlhbi9Eb2N1bWVudHMvTm90ZXNcIjtcbmV4cG9ydCBjb25zdCBJTkJPWF9ESVIgPSBgJHtOT1RFU19ESVJ9L2luYm94YDtcbmV4cG9ydCBjb25zdCBLSVRUWV9MSVNURU5fT04gPSBcIi90bXAvbXlraXR0eVwiO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBQUFBLGNBQTREO0FBQzVELGdCQUFlO0FBQ2Ysa0JBQWlCO0FBQ2pCLElBQUFDLGVBQTBCOzs7QUNIMUIsaUJBQWtEOzs7QUNBM0MsSUFBTSxhQUFhO0FBQ25CLElBQU0sWUFBWTtBQUNsQixJQUFNLFlBQVksR0FBRyxTQUFTO0FBQzlCLElBQU0sa0JBQWtCOzs7QUREL0Isa0JBQWlCO0FBQ2pCLDJCQUFxQjtBQUNyQixJQUFNLFlBQVksWUFBQUMsUUFBSyxVQUFVLHlCQUFJO0FBRXJDLGVBQXNCLFdBQVcsVUFBa0I7QUFDakQsTUFBSTtBQUNGLFVBQU0sTUFBTSxNQUFNLFlBQVk7QUFDOUIsVUFBTUMsV0FBVSxHQUFHLFVBQVUsZ0JBQWdCLGVBQWUsSUFBSSxHQUFHLHlDQUF5QyxRQUFRO0FBRXBILFVBQU0sRUFBRSxPQUFPLElBQUksTUFBTSxVQUFVQSxRQUFPO0FBRTFDLFFBQUksT0FBUSxPQUFNLElBQUksTUFBTSxNQUFNO0FBRWxDLDhCQUFVLGlCQUFNLE1BQU0sU0FBUyx5Q0FBeUM7QUFDeEUsb0NBQWdCO0FBQUEsRUFDbEIsU0FBUyxPQUFPO0FBQ2QsWUFBUSxNQUFNLHVCQUF1QixLQUFLLEVBQUU7QUFDNUMsOEJBQVUsaUJBQU0sTUFBTSxTQUFTLDZCQUE2QjtBQUFBLEVBQzlEO0FBQ0Y7QUFFQSxlQUFlLGNBQWM7QUFDM0IsUUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNLFVBQVUsa0JBQWtCLFVBQVUscUNBQXFDO0FBQ3BHLFFBQU0sTUFBTSxTQUFTLE9BQU8sS0FBSyxDQUFDO0FBQ2xDLE1BQUksTUFBTSxHQUFHLEdBQUc7QUFDZCxVQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxFQUMzQztBQUNBLFNBQU87QUFDVDs7O0FETlU7QUFqQkssU0FBUixVQUEyQjtBQUNoQyxRQUFNLGVBQWUsT0FBTyxXQUE2QjtBQUN2RCxRQUFJO0FBQ0YsWUFBTSxXQUFXLE1BQU0sY0FBYyxPQUFPLElBQUk7QUFDaEQsZ0JBQU0sdUJBQVUsa0JBQU0sTUFBTSxTQUFTLG9CQUFvQixRQUFRO0FBRWpFLGlCQUFXLFFBQVE7QUFBQSxJQUNyQixTQUFTLE9BQU87QUFDZCxjQUFRLE1BQU0sOEJBQThCLEtBQUs7QUFDakQsZ0JBQU0sdUJBQVUsa0JBQU0sTUFBTSxTQUFTLDJCQUEyQjtBQUFBLElBQ2xFO0FBQUEsRUFDRjtBQUVBLFNBQ0U7QUFBQSxJQUFDO0FBQUE7QUFBQSxNQUNDLFNBQ0UsNENBQUMsMkJBQ0Msc0RBQUMsbUJBQU8sWUFBUCxFQUFrQixPQUFNLFVBQVMsVUFBVSxjQUFjLEdBQzVEO0FBQUEsTUFHRixzREFBQyxpQkFBSyxXQUFMLEVBQWUsT0FBTSxZQUFXLElBQUcsUUFBTztBQUFBO0FBQUEsRUFDN0M7QUFFSjtBQUVBLGVBQWUsY0FBYyxVQUFtQztBQUM5RCxRQUFNLGNBQWMsb0JBQUksS0FBSztBQUM3QixRQUFNLFdBQVcsWUFBQUMsUUFBSyxLQUFLLFdBQVcsUUFBUTtBQUU5QyxRQUFNLFdBQVc7QUFBQTtBQUFBLGNBQTZCLFlBQVksZUFBZSxDQUFDO0FBQUE7QUFBQTtBQUUxRSxRQUFNLGdCQUFZLHdCQUFVLFVBQUFDLFFBQUcsU0FBUztBQUN4QyxRQUFNLFVBQVUsVUFBVSxVQUFVLE1BQU07QUFFMUMsU0FBTztBQUNUOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfYXBpIiwgImltcG9ydF91dGlsIiwgInV0aWwiLCAiY29tbWFuZCIsICJwYXRoIiwgImZzIl0KfQo=
