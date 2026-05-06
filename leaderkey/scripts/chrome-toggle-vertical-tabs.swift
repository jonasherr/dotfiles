#!/usr/bin/env swift

import AppKit
import ApplicationServices

let trusted = AXIsProcessTrustedWithOptions([
  kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
] as CFDictionary)

if !trusted {
  fputs("Accessibility permission is required for the app that runs this script. Enable Raycast, LeaderKey, or your terminal in System Settings > Privacy & Security > Accessibility.\n", stderr)
  exit(2)
}

let targetLabels = Set([
  "Expand tabs",
  "Collapse tabs",
  "Expand Tabs",
  "Collapse Tabs",
  "Expand Tab Strip",
  "Collapse Tab Strip",
  "Show Tabs Vertically",
  "Show Tabs Horizontally",
])

func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else {
    return ""
  }
  return value as? String ?? ""
}

func children(of element: AXUIElement) -> [AXUIElement] {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value) == .success else {
    return []
  }
  return value as? [AXUIElement] ?? []
}

func labelMatches(_ label: String) -> Bool {
  if targetLabels.contains(label) { return true }

  let lowercased = label.lowercased()
  return lowercased.contains("expand tabs")
    || lowercased.contains("collapse tabs")
    || lowercased.contains("show tabs vertically")
    || lowercased.contains("show tabs horizontally")
}

func isMatchingButton(_ element: AXUIElement) -> Bool {
  let role = stringAttribute(element, kAXRoleAttribute as String)
  guard role == (kAXButtonRole as String) else { return false }

  let labels = [
    stringAttribute(element, kAXTitleAttribute as String),
    stringAttribute(element, kAXDescriptionAttribute as String),
    stringAttribute(element, kAXHelpAttribute as String),
  ]

  return labels.contains(where: labelMatches)
}

func findButton(in element: AXUIElement, depth: Int = 0) -> AXUIElement? {
  if depth > 14 { return nil }

  if isMatchingButton(element) {
    return element
  }

  for child in children(of: element) {
    if let found = findButton(in: child, depth: depth + 1) {
      return found
    }
  }

  return nil
}

func focusedWindow(in appElement: AXUIElement) -> AXUIElement? {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &value) == .success else {
    return nil
  }
  return value as! AXUIElement?
}

func windows(in appElement: AXUIElement) -> [AXUIElement] {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &value) == .success else {
    return []
  }
  return value as? [AXUIElement] ?? []
}

func isUsableWindow(_ window: AXUIElement) -> Bool {
  let title = stringAttribute(window, kAXTitleAttribute as String)
  return title != "Picture in Picture"
    && !title.contains("Video playing in picture-in-picture mode")
}

let workspace = NSWorkspace.shared

if NSRunningApplication.runningApplications(withBundleIdentifier: "com.google.Chrome").isEmpty {
  workspace.openApplication(at: URL(fileURLWithPath: "/Applications/Google Chrome.app"), configuration: NSWorkspace.OpenConfiguration()) { _, _ in }
  Thread.sleep(forTimeInterval: 0.4)
}

guard let chromeApp = NSRunningApplication.runningApplications(withBundleIdentifier: "com.google.Chrome").first else {
  fputs("Chrome is not running\n", stderr)
  exit(1)
}

chromeApp.activate()
Thread.sleep(forTimeInterval: 0.08)

let appElement = AXUIElementCreateApplication(chromeApp.processIdentifier)
var candidateWindows: [AXUIElement] = []

if let focused = focusedWindow(in: appElement), isUsableWindow(focused) {
  candidateWindows.append(focused)
}

candidateWindows.append(contentsOf: windows(in: appElement).filter(isUsableWindow))

for window in candidateWindows {
  if let button = findButton(in: window) {
    let result = AXUIElementPerformAction(button, kAXPressAction as CFString)
    if result == .success {
      exit(0)
    }

    fputs("Found Chrome vertical tabs button, but AXPress failed: \(result.rawValue)\n", stderr)
    exit(1)
  }
}

fputs("Chrome vertical tabs toggle button not found in Accessibility tree\n", stderr)
exit(1)
