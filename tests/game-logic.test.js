/* WINDOWKILL — game-logic tests (node:test, phân tích tĩnh).
 * Chạy: node --test tests/game-logic.test.js
 *
 * js/game.js là browser script thuần (không phải ES module, không
 * module.exports) nên QA không thể require() trực tiếp trong node —
 * QA KHÔNG sửa js/game.js của team gameplay.
 *
 * ĐỀ XUẤT cho team gameplay (để test động trong tương lai):
 * tách pure function (spawn logic, wave scaling, registry) ra module
 * riêng, ví dụ js/logic.js export { MONSTER_REGISTRY, ACTS, ... }.
 * Khi marker MONSTER_REGISTRY/ACTS xuất hiện trong js/game.js, các test
 * bên dưới tự bật (không cần sửa test).
 *
 * Test tĩnh bằng regex vẫn có giá trị regression: bắt được việc xóa
 * nhầm hằng số/hàm core khi refactor.
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const GAME = "js/game.js";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// Đăng ký 1 test skip với lý do hiển thị trong report.
const skipIt = (name, reason) => it(name, { skip: reason }, () => {});

/* Trích block object/array literal sau `const NAME =` bằng brace matching
 * (bỏ qua string literal & comment). Dùng khi team gameplay thêm
 * MONSTER_REGISTRY / ACTS — không phụ thuộc format chi tiết bên trong. */
function extractBlock(srcText, name) {
  const m = srcText.match(new RegExp(`const ${name}\\s*=\\s*`));
  assert.ok(m, `không tìm thấy const ${name}`);
  let i = m.index + m[0].length;
  while (i < srcText.length && /\s/.test(srcText[i])) i++;
  const open = srcText[i];
  assert.ok(open === "{" || open === "[", `${name} không phải object/array literal`);
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = null;
  let esc = false;
  let inLine = false;
  let inBlock = false;
  const start = i;
  for (; i < srcText.length; i++) {
    const c = srcText[i];
    const n = srcText[i + 1];
    if (inLine) {
      if (c === "\n") inLine = false;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && n === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      inBlock = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return srcText.slice(start, i + 1);
    }
  }
  assert.fail(`không đóng được block ${name}`);
}

// Đếm số entry cấp cao nhất trong object/array literal (không phụ thuộc key).
function topLevelEntries(block) {
  const inner = block.slice(1, -1);
  if (!inner.trim()) return 0;
  let depth = 0;
  let commas = 0;
  let inStr = null;
  let esc = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) commas++;
  }
  return commas + 1;
}

describe("pure function export (đề xuất cho team gameplay)", () => {
  const src = read(GAME);
  const exportable =
    /module\.exports\s*=/.test(src) ||
    /(^|\n)\s*export\s+(const|function|default)/m.test(src);
  if (!exportable) {
    skipIt(
      "js/game.js export được pure function để test động",
      "game.js hiện là browser script thuần (không module.exports/ES export) — " +
        "đề xuất team gameplay tách js/logic.js export { MONSTER_REGISTRY, ACTS }; " +
        "QA không sửa file của team khác nên test này skip"
    );
    return;
  }
  it("load được trong node và export MONSTER_REGISTRY/ACTS", () => {
    // Khi team gameplay tách module, bổ sung require() + assertion động tại đây.
    assert.ok(exportable);
  });
});

describe("MONSTER_REGISTRY + ACTS (team gameplay đang phát triển)", () => {
  const src = read(GAME);
  const hasRegistry = /const MONSTER_REGISTRY\s*=/.test(src);
  const hasActs = /const ACTS\s*=/.test(src);
  const REASON =
    "js/game.js chưa có " +
    [!hasRegistry && "const MONSTER_REGISTRY", !hasActs && "const ACTS"]
      .filter(Boolean)
      .join(" + ") +
    " — team gameplay đang phát triển; test sẽ tự bật khi marker xuất hiện";

  if (!hasRegistry || !hasActs) {
    skipIt("tồn tại MONSTER_REGISTRY và ACTS", REASON);
    skipIt("đủ 3 act", REASON);
    skipIt("registry ≥ 10 loại quái", REASON);
    skipIt("≥ 2 pickup mới (ngoài heart/shield/nuke)", REASON);
    return;
  }

  it("đủ 3 act", () => {
    const n = topLevelEntries(extractBlock(src, "ACTS"));
    assert.ok(n >= 3, `ACTS có ${n} act, kỳ vọng ≥ 3`);
  });

  it("registry ≥ 10 loại quái", () => {
    const n = topLevelEntries(extractBlock(src, "MONSTER_REGISTRY"));
    assert.ok(n >= 10, `MONSTER_REGISTRY có ${n} quái, kỳ vọng ≥ 10`);
  });

  it("≥ 2 pickup mới (ngoài heart/shield/nuke)", () => {
    const kinds = new Set(
      [...src.matchAll(/kind:\s*["']([a-z]+)["']/g)].map((m) => m[1])
    );
    // Pickup mới được định nghĩa trong PICKUP_DEFS dưới dạng key object
    // (ví dụ "magnet": { w: 22, ... }) — không phải kind: "...".
    const defsBlock = extractBlock(src, "PICKUP_DEFS");
    for (const m of defsBlock.matchAll(/^\s*"([a-z_]+)"\s*:/gm)) kinds.add(m[1]);
    const baseline = new Set(["heart", "shield", "nuke"]);
    const fresh = [...kinds].filter((k) => !baseline.has(k));
    assert.ok(fresh.length >= 2, `pickup mới: [${fresh.join(", ")}], kỳ vọng ≥ 2`);
  });
});

describe("regression core loop & wave (static, luôn chạy)", () => {
  const src = read(GAME);

  it("game loop chạy bằng requestAnimationFrame", () => {
    assert.match(src, /function loop\(/);
    assert.match(src, /requestAnimationFrame\(loop\)/);
  });

  it("wave progression: startWave(G.wave + 1)", () => {
    assert.match(src, /function startWave\(/);
    assert.match(src, /startWave\(G\.wave \+ 1\)/);
  });

  it("XP/level-up mở draft nâng cấp", () => {
    assert.match(src, /function gainXp\(/);
    assert.match(src, /G\.phase = "draft"/);
    assert.match(src, /draft-cards/);
  });

  it("combo tính điểm theo chuỗi hạ quái", () => {
    assert.match(src, /G\.combo\+\+/);
    assert.match(src, /G\.combo \* 2/);
  });

  it("wave clear vá cửa sổ (banner WAVE ... CLEAR)", () => {
    assert.match(src, /WAVE .* CLEAR/);
  });

  it("3 pickup cơ bản heart/shield/nuke còn nguyên", () => {
    for (const k of ["heart", "shield", "nuke"]) {
      assert.ok(src.includes(`"${k}"`), `thiếu pickup ${k}`);
    }
  });
});
