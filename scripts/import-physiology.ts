import { importAppleHealthProfile } from "../src/lib/apple-health-profile";

const defaultExportXml =
  "/Users/Y.T.p/Library/Mobile Documents/iCloud~com~altifondo~HealthFit/Documents/apple_health_export/export.xml";

async function main() {
  const exportXml = process.env.APPLE_HEALTH_EXPORT_XML?.trim() || defaultExportXml;
  const result = await importAppleHealthProfile(exportXml);

  console.log("Physiology profile import completed.");
  console.log(`Source: ${exportXml}`);
  console.log(
    `Baselines => RestingHR: ${result.profile.restingHrBaseline ?? "-"}, HRV: ${result.profile.hrvBaseline ?? "-"}, VO2max: ${result.profile.vo2MaxBaseline ?? "-"}, SleepHours: ${result.profile.sleepHoursBaseline ?? "-"}`
  );
  console.log(`Scanned records: ${result.summary.scannedRecords}`);
  console.log(
    `Metric counts => RestingHR: ${result.summary.metrics.restingHr.count}, HRV: ${result.summary.metrics.hrv.count}, VO2max: ${result.summary.metrics.vo2max.count}, Sleep days: ${result.summary.metrics.sleepHours.daysCount}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
