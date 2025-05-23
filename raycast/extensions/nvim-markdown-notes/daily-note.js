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

// src/daily-note.tsx
var daily_note_exports = {};
__export(daily_note_exports, {
  default: () => command
});
module.exports = __toCommonJS(daily_note_exports);
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

// src/daily-note.tsx
async function command() {
  try {
    const dailyNotePath = await createOrOpenDailyNote();
    console.log(dailyNotePath);
    openInNvim(dailyNotePath);
  } catch (error) {
    console.error("Error in daily note command:", error);
    await (0, import_api2.showToast)(import_api2.Toast.Style.Failure, "Failed to open daily note");
  }
}
async function createOrOpenDailyNote() {
  const today = /* @__PURE__ */ new Date();
  const fileName = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}.md`;
  const filePath = import_path.default.join(NOTES_DIR, fileName);
  try {
    const access = (0, import_util2.promisify)(import_fs.default.access);
    await access(filePath, import_fs.default.constants.F_OK);
    return filePath;
  } catch {
    const template = `# Daily Note - ${today.toDateString()}

## Tasks

- [ ] 

## Notes

`;
    const writeFile = (0, import_util2.promisify)(import_fs.default.writeFile);
    await writeFile(filePath, template, "utf8");
    await (0, import_api2.showToast)(import_api2.Toast.Style.Success, "Created new daily note");
    return filePath;
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vUHJvamVjdHMvdG9vbHMvcmF5Y2FzdC9udmltLW1hcmtkb3duLW5vdGVzL3NyYy9kYWlseS1ub3RlLnRzeCIsICIuLi8uLi8uLi8uLi9Qcm9qZWN0cy90b29scy9yYXljYXN0L252aW0tbWFya2Rvd24tbm90ZXMvc3JjL3V0aWxzLnRzIiwgIi4uLy4uLy4uLy4uL1Byb2plY3RzL3Rvb2xzL3JheWNhc3QvbnZpbS1tYXJrZG93bi1ub3Rlcy9zcmMvY29uZmlnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBzaG93VG9hc3QsIFRvYXN0IH0gZnJvbSBcIkByYXljYXN0L2FwaVwiO1xuaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gXCJ1dGlsXCI7XG5pbXBvcnQgeyBvcGVuSW5OdmltIH0gZnJvbSBcIi4vdXRpbHNcIjtcbmltcG9ydCB7IE5PVEVTX0RJUiB9IGZyb20gXCIuL2NvbmZpZ1wiO1xuXG5leHBvcnQgZGVmYXVsdCBhc3luYyBmdW5jdGlvbiBjb21tYW5kKCkge1xuICB0cnkge1xuICAgIGNvbnN0IGRhaWx5Tm90ZVBhdGggPSBhd2FpdCBjcmVhdGVPck9wZW5EYWlseU5vdGUoKTtcbiAgICBjb25zb2xlLmxvZyhkYWlseU5vdGVQYXRoKTtcbiAgICBvcGVuSW5OdmltKGRhaWx5Tm90ZVBhdGgpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBpbiBkYWlseSBub3RlIGNvbW1hbmQ6XCIsIGVycm9yKTtcbiAgICBhd2FpdCBzaG93VG9hc3QoVG9hc3QuU3R5bGUuRmFpbHVyZSwgXCJGYWlsZWQgdG8gb3BlbiBkYWlseSBub3RlXCIpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZU9yT3BlbkRhaWx5Tm90ZSgpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IGZpbGVOYW1lID0gYCR7dG9kYXkuZ2V0RnVsbFllYXIoKX0tJHtTdHJpbmcodG9kYXkuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsIFwiMFwiKX0tJHtTdHJpbmcodG9kYXkuZ2V0RGF0ZSgpKS5wYWRTdGFydCgyLCBcIjBcIil9Lm1kYDtcbiAgY29uc3QgZmlsZVBhdGggPSBwYXRoLmpvaW4oTk9URVNfRElSLCBmaWxlTmFtZSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBhY2Nlc3MgPSBwcm9taXNpZnkoZnMuYWNjZXNzKTtcbiAgICBhd2FpdCBhY2Nlc3MoZmlsZVBhdGgsIGZzLmNvbnN0YW50cy5GX09LKTtcbiAgICAvLyBGaWxlIGV4aXN0cywgcmV0dXJuIGl0cyBwYXRoXG4gICAgcmV0dXJuIGZpbGVQYXRoO1xuICB9IGNhdGNoIHtcbiAgICAvLyBGaWxlIGRvZXNuJ3QgZXhpc3QsIGNyZWF0ZSBpdFxuICAgIGNvbnN0IHRlbXBsYXRlID0gYCMgRGFpbHkgTm90ZSAtICR7dG9kYXkudG9EYXRlU3RyaW5nKCl9XFxuXFxuIyMgVGFza3NcXG5cXG4tIFsgXSBcXG5cXG4jIyBOb3Rlc1xcblxcbmA7XG4gICAgY29uc3Qgd3JpdGVGaWxlID0gcHJvbWlzaWZ5KGZzLndyaXRlRmlsZSk7XG4gICAgYXdhaXQgd3JpdGVGaWxlKGZpbGVQYXRoLCB0ZW1wbGF0ZSwgXCJ1dGY4XCIpO1xuICAgIGF3YWl0IHNob3dUb2FzdChUb2FzdC5TdHlsZS5TdWNjZXNzLCBcIkNyZWF0ZWQgbmV3IGRhaWx5IG5vdGVcIik7XG4gICAgcmV0dXJuIGZpbGVQYXRoO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgY2xvc2VNYWluV2luZG93LCBzaG93VG9hc3QsIFRvYXN0IH0gZnJvbSBcIkByYXljYXN0L2FwaVwiO1xuaW1wb3J0IHsgS0lUVFlfTElTVEVOX09OLCBLSVRUWV9QQVRIIH0gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQgdXRpbCBmcm9tIFwidXRpbFwiO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCI7XG5jb25zdCBleGVjQXN5bmMgPSB1dGlsLnByb21pc2lmeShleGVjKTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5Jbk52aW0obm90ZVBhdGg6IHN0cmluZykge1xuICB0cnkge1xuICAgIGNvbnN0IHBpZCA9IGF3YWl0IGdldEtpdHR5UGlkKCk7XG4gICAgY29uc3QgY29tbWFuZCA9IGAke0tJVFRZX1BBVEh9IEAgLS10byB1bml4OiR7S0lUVFlfTElTVEVOX09OfS0ke3BpZH0gbGF1bmNoIC0tdHlwZSB0YWIgLS10aXRsZSBOb3RlIG52aW0gXCIke25vdGVQYXRofVwiYDtcblxuICAgIGNvbnN0IHsgc3RkZXJyIH0gPSBhd2FpdCBleGVjQXN5bmMoY29tbWFuZCk7XG5cbiAgICBpZiAoc3RkZXJyKSB0aHJvdyBuZXcgRXJyb3Ioc3RkZXJyKTtcblxuICAgIHNob3dUb2FzdChUb2FzdC5TdHlsZS5TdWNjZXNzLCBcIk9wZW5lZCBub3RlIGluIG52aW0gd2l0aGluIHRtdXggc2Vzc2lvblwiKTtcbiAgICBjbG9zZU1haW5XaW5kb3coKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBFcnJvciBvcGVuaW5nIGZpbGU6ICR7ZXJyb3J9YCk7XG4gICAgc2hvd1RvYXN0KFRvYXN0LlN0eWxlLkZhaWx1cmUsIFwiRmFpbGVkIHRvIG9wZW4gbm90ZSBpbiBudmltXCIpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldEtpdHR5UGlkKCkge1xuICBjb25zdCB7IHN0ZG91dCB9ID0gYXdhaXQgZXhlY0FzeW5jKGBwcyBhdXggfCBncmVwICcke0tJVFRZX1BBVEh9JyB8IGdyZXAgLXYgZ3JlcCB8IGF3ayAne3ByaW50ICQyfSdgKTtcbiAgY29uc3QgcGlkID0gcGFyc2VJbnQoc3Rkb3V0LnRyaW0oKSk7XG4gIGlmIChpc05hTihwaWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGdldCBraXR0eSBwaWRcIik7XG4gIH1cbiAgcmV0dXJuIHBpZDtcbn1cbiIsICJleHBvcnQgY29uc3QgS0lUVFlfUEFUSCA9IFwiL0FwcGxpY2F0aW9ucy9raXR0eS5hcHAvQ29udGVudHMvTWFjT1Mva2l0dHlcIjtcbmV4cG9ydCBjb25zdCBOT1RFU19ESVIgPSBcIi9Vc2Vycy9qb25hcy9MaWJyYXJ5L01vYmlsZSBEb2N1bWVudHMvaUNsb3Vkfm1kfm9ic2lkaWFuL0RvY3VtZW50cy9Ob3Rlc1wiO1xuZXhwb3J0IGNvbnN0IElOQk9YX0RJUiA9IGAke05PVEVTX0RJUn0vaW5ib3hgO1xuZXhwb3J0IGNvbnN0IEtJVFRZX0xJU1RFTl9PTiA9IFwiL3RtcC9teWtpdHR5XCI7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFBQUEsY0FBaUM7QUFDakMsZ0JBQWU7QUFDZixrQkFBaUI7QUFDakIsSUFBQUMsZUFBMEI7OztBQ0gxQixpQkFBa0Q7OztBQ0EzQyxJQUFNLGFBQWE7QUFDbkIsSUFBTSxZQUFZO0FBQ2xCLElBQU0sWUFBWSxHQUFHLFNBQVM7QUFDOUIsSUFBTSxrQkFBa0I7OztBREQvQixrQkFBaUI7QUFDakIsMkJBQXFCO0FBQ3JCLElBQU0sWUFBWSxZQUFBQyxRQUFLLFVBQVUseUJBQUk7QUFFckMsZUFBc0IsV0FBVyxVQUFrQjtBQUNqRCxNQUFJO0FBQ0YsVUFBTSxNQUFNLE1BQU0sWUFBWTtBQUM5QixVQUFNQyxXQUFVLEdBQUcsVUFBVSxnQkFBZ0IsZUFBZSxJQUFJLEdBQUcseUNBQXlDLFFBQVE7QUFFcEgsVUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNLFVBQVVBLFFBQU87QUFFMUMsUUFBSSxPQUFRLE9BQU0sSUFBSSxNQUFNLE1BQU07QUFFbEMsOEJBQVUsaUJBQU0sTUFBTSxTQUFTLHlDQUF5QztBQUN4RSxvQ0FBZ0I7QUFBQSxFQUNsQixTQUFTLE9BQU87QUFDZCxZQUFRLE1BQU0sdUJBQXVCLEtBQUssRUFBRTtBQUM1Qyw4QkFBVSxpQkFBTSxNQUFNLFNBQVMsNkJBQTZCO0FBQUEsRUFDOUQ7QUFDRjtBQUVBLGVBQWUsY0FBYztBQUMzQixRQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sVUFBVSxrQkFBa0IsVUFBVSxxQ0FBcUM7QUFDcEcsUUFBTSxNQUFNLFNBQVMsT0FBTyxLQUFLLENBQUM7QUFDbEMsTUFBSSxNQUFNLEdBQUcsR0FBRztBQUNkLFVBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQzNDO0FBQ0EsU0FBTztBQUNUOzs7QUR2QkEsZUFBTyxVQUFpQztBQUN0QyxNQUFJO0FBQ0YsVUFBTSxnQkFBZ0IsTUFBTSxzQkFBc0I7QUFDbEQsWUFBUSxJQUFJLGFBQWE7QUFDekIsZUFBVyxhQUFhO0FBQUEsRUFDMUIsU0FBUyxPQUFPO0FBQ2QsWUFBUSxNQUFNLGdDQUFnQyxLQUFLO0FBQ25ELGNBQU0sdUJBQVUsa0JBQU0sTUFBTSxTQUFTLDJCQUEyQjtBQUFBLEVBQ2xFO0FBQ0Y7QUFFQSxlQUFlLHdCQUF5QztBQUN0RCxRQUFNLFFBQVEsb0JBQUksS0FBSztBQUN2QixRQUFNLFdBQVcsR0FBRyxNQUFNLFlBQVksQ0FBQyxJQUFJLE9BQU8sTUFBTSxTQUFTLElBQUksQ0FBQyxFQUFFLFNBQVMsR0FBRyxHQUFHLENBQUMsSUFBSSxPQUFPLE1BQU0sUUFBUSxDQUFDLEVBQUUsU0FBUyxHQUFHLEdBQUcsQ0FBQztBQUNwSSxRQUFNLFdBQVcsWUFBQUMsUUFBSyxLQUFLLFdBQVcsUUFBUTtBQUU5QyxNQUFJO0FBQ0YsVUFBTSxhQUFTLHdCQUFVLFVBQUFDLFFBQUcsTUFBTTtBQUNsQyxVQUFNLE9BQU8sVUFBVSxVQUFBQSxRQUFHLFVBQVUsSUFBSTtBQUV4QyxXQUFPO0FBQUEsRUFDVCxRQUFRO0FBRU4sVUFBTSxXQUFXLGtCQUFrQixNQUFNLGFBQWEsQ0FBQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFDdkQsVUFBTSxnQkFBWSx3QkFBVSxVQUFBQSxRQUFHLFNBQVM7QUFDeEMsVUFBTSxVQUFVLFVBQVUsVUFBVSxNQUFNO0FBQzFDLGNBQU0sdUJBQVUsa0JBQU0sTUFBTSxTQUFTLHdCQUF3QjtBQUM3RCxXQUFPO0FBQUEsRUFDVDtBQUNGOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfYXBpIiwgImltcG9ydF91dGlsIiwgInV0aWwiLCAiY29tbWFuZCIsICJwYXRoIiwgImZzIl0KfQo=
