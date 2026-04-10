import express from 'express';
import cors from 'cors';
import { createRouter } from './routes.js';
import { scanAll } from './providers/index.js';

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || 'localhost';
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL || '300000', 10);

const app = express();

app.use(cors());
app.use(express.json());

const { router, db } = createRouter();
app.use('/api', router);

let scanTimer = null;
let isScanning = false;

async function runScheduledScan() {
  if (isScanning) return;
  isScanning = true;
  try {
    const result = await scanAll(db, { verbose: false });
    const providers = Object.entries(result)
      .filter(([, v]) => v.turns > 0 || v.sessions > 0)
      .map(([k]) => k);
    if (providers.length > 0) {
      console.log(`[auto-scan] Updated: ${providers.join(', ')}`);
    }
  } catch (err) {
    console.error(`[auto-scan] Error: ${err.message}`);
  } finally {
    isScanning = false;
  }
}

const server = app.listen(PORT, HOST, () => {
  console.log(`ModelMeter Dashboard API running at http://${HOST}:${PORT}`);
  console.log(`  GET  /api/data        - Dashboard data`);
  console.log(`  GET  /api/providers   - List providers`);
  console.log(`  POST /api/scan        - Scan all providers`);
  console.log(`  POST /api/scan/:id    - Scan specific provider`);
  console.log(`  POST /api/import      - Import JSONL/XLSX file`);
  console.log(`  GET  /api/export/csv/:type - Export CSV`);
  console.log(`  GET  /api/pricing     - Model pricing table`);
  console.log(`Auto-scan every ${SCAN_INTERVAL_MS / 1000}s`);

  // Run initial scan
  runScheduledScan();

  // Schedule periodic scans
  scanTimer = setInterval(runScheduledScan, SCAN_INTERVAL_MS);
});

function shutdown() {
  console.log('\nShutting down...');
  if (scanTimer) clearInterval(scanTimer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, db };
