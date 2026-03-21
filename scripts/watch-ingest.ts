import { runIngest } from "../src/lib/ingest";

const intervalMs = 10 * 60 * 1000;

async function tick() {
  const result = await runIngest();
  const status = result.errors.length ? `with ${result.errors.length} errors` : "success";
  console.log(
    `[${new Date().toISOString()}] ingest ${status}. queued=${result.filesQueued} ingested=${result.filesIngested} skipped=${result.filesSkipped}`
  );
}

console.log("Rebuild ingest watcher started. interval=10m");
void tick();
setInterval(() => {
  void tick();
}, intervalMs);
