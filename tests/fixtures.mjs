import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const project = path.dirname(
  path.dirname(fileURLToPath(import.meta.url)),
);
let privateDirectory = project;
try {
  privateDirectory = JSON.parse(
    readFileSync(path.join(project, "local.settings.json"), "utf8"),
  ).privateDirectory;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
export const fixturePath = (name) => path.join(privateDirectory, "tests", name);
export const privateFile = (name) => path.join(privateDirectory, name);
