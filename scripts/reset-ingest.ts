import { resetIngestData } from "../src/lib/db";
import { runIngest } from "../src/lib/ingest";

async function main() {
  resetIngestData();
  const result = await runIngest();
  console.log(
    `Reset+ingest done. queued=${result.filesQueued} ingested=${result.filesIngested} skipped=${result.filesSkipped} errors=${result.errors.length}`
  );
  if (result.errors.length) {
    console.log(result.errors.slice(0, 20));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
