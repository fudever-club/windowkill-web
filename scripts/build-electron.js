/* =====================================================================
 * Build Electron Standalone App Stage (electron/app/)
 * ===================================================================== */
"use strict";

const path = require("path");
const { stageWebBundle } = require("./lib/stage-web");

function main() {
  const appDir = path.resolve(__dirname, "..", "electron", "app");
  stageWebBundle(appDir);
  console.log("staged Electron app into " + appDir);
}

if (require.main === module) main();
module.exports = { main };
