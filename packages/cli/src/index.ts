#!/usr/bin/env node
import { createPersistentStores, rebuildProjections, resolveDatabasePath } from '@aigolet-next/persistence';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const dbPath = process.env.AIGOLET_DATA_DIR
    ? undefined
    : resolveDatabasePath();

  const stores = createPersistentStores(dbPath);
  try {
    const result = await rebuildProjections(stores.db, { dryRun });
    console.log(JSON.stringify(result, null, 2));
    if (dryRun) {
      console.log(`Dry run: would replay ${result.domainEventsReplayed} domain events`);
    } else {
      console.log(
        `Rebuilt projections: audit ${result.auditEventsBefore} → ${result.auditEventsAfter}, memory ${result.memoryRecordsBefore} → ${result.memoryRecordsAfter}`,
      );
    }
  } finally {
    stores.db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
