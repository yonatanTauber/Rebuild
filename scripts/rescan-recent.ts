import { runIngest } from "../src/lib/ingest";

async function main() {
  const result = await runIngest({ onlyMissing: false, recentDays: 31 });
  console.log(
    `rescan done. queued=${result.filesQueued} ingested=${result.filesIngested} skipped=${result.filesSkipped} errors=${result.errors.length}`
  );
  if (result.errors.length > 0) {
    console.log(result.errors.slice(0, 30));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
