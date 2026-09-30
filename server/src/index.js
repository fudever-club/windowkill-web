/* WINDOWKILL backend — production bootstrap. `npm start` runs this. */
"use strict";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";
import { createApp } from "./server.js";

mkdirSync(dirname(config.dbPath), { recursive: true });

const app = createApp();
const addr = await app.listen();
console.log(
  `[windowkill-backend] v${config.version} listening on http://${addr.address}:${addr.port} (db: ${config.dbPath})`
);

const shutdown = async () => {
  console.log("\n[windowkill-backend] shutting down…");
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
