/* =====================================================================
 * Build Mobile Standalone Web Stage (mobile/www/)
 * ===================================================================== */
"use strict";

const path = require("path");
const { stageWebBundle } = require("./lib/stage-web");

function main() {
  const wwwDir = path.resolve(__dirname, "..", "mobile", "www");
  stageWebBundle(wwwDir);
  console.log("staged Mobile web bundle into " + wwwDir);
}

if (require.main === module) main();
module.exports = { main };
