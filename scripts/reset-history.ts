import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const dbFiles = ["rebuild.db", "rebuild.db-shm", "rebuild.db-wal"];
const importDir = path.join(dataDir, "import");
const smashrunDir = path.join(dataDir, "smashrun-export");

function removeFile(filepath: string) {
  if (!fs.existsSync(filepath)) return false;
  fs.unlinkSync(filepath);
  return true;
}

function emptyDirectory(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}

function ensureDirectory(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  console.log("Resetting local history...");

  let deletedDb = 0;
  for (const filename of dbFiles) {
    const removed = removeFile(path.join(dataDir, filename));
    if (removed) deletedDb += 1;
  }

  emptyDirectory(importDir);
  emptyDirectory(smashrunDir);

  ensureDirectory(importDir);
  ensureDirectory(smashrunDir);

  console.log(`Removed ${deletedDb} database files and cleared import/smashrun folders.`);
  console.log("You can now drop the new Smashrun TCX files into data/smashrun-export and rerun ingestion.");
}

main();
