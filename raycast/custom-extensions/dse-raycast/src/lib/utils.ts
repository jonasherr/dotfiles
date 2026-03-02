import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { getPreferenceValues } from "@raycast/api";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ensureClientWorkdir(customerName: string): string {
  const { workdir } = getPreferenceValues<{ workdir: string }>();
  const slug = slugify(customerName);
  const dir = join(workdir, slug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}
