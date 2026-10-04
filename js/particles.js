/* WINDOWKILL — particle batching (perf batch 2, item "particle batching").
 *
 * Bài toán: wave cao ~600 hạt, vòng vẽ cũ mỗi hạt = 1 fillStyle + 1 globalAlpha
 * + 1 fillRect (~1800 canvas ops/frame). Gom hạt theo bucket (color + alpha lượng
 * tử hóa 8 nấc) → mỗi bucket 1 Path2D chứa mọi rect → 1 fillStyle + 1 globalAlpha
 * + 1 fill(). Số draw call giảm từ ~600 xuống ~số bucket (thực tế < 150).
 *
 * Visual: màu giữ nguyên theo bucket; alpha lượng tử hóa về nấc 1/8 gần nhất
 * (sai số ≤ 1/16 < 1/8 nấc — mắt thường không phân biệt); hạt đã tắt hẳn
 * (alpha → 0) hoặc kích thước không hợp lệ được bỏ qua (vòng cũ vẽ chúng
 * cũng vô hình: fillRect với globalAlpha = 0 hay NaN đều là no-op).
 *
 * KHÔNG đổi số lượng/hành vi hạt — chỉ đổi cách vẽ. Không đụng nhạc.
 */
(function () {
  "use strict";

  var ALPHA_STEPS = 8; // số nấc lượng tử hóa alpha

  // Trả về nấc alpha 1..8 của hạt, hoặc -1 nếu hạt vô hình (bỏ qua khi vẽ).
  function alphaBucket(p) {
    var a = 1 - p.t / p.life;
    if (!(a > 0)) return -1; // hết hạn / NaN → vòng cũ globalAlpha = 0 → vô hình
    if (a > 1) a = 1;
    var b = Math.round(a * ALPHA_STEPS); // 0..8
    return b > 0 ? b : -1; // alpha < 1/16 làm tròn về 0 → vô hình, bỏ
  }

  // Gom hạt theo màu; mỗi màu giữ tối đa 8 Path2D (1 cho mỗi nấc alpha).
  // Trả về mảng các bucket { c, paths } — paths[1..8] là Path2D hoặc undefined.
  // (key theo màu thay vì chuỗi "màu|alpha": tránh nối chuỗi 600 lần/frame.)
  function bucketize(parts) {
    var byColor = new Map();
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      // sz undefined/NaN/<=0 (vd: hạt giấy boss w10 không có sz): vòng cũ
      // fillRect(NaN, …) cũng là no-op → bỏ qua cho gọn bucket.
      // (path.rect với NaN theo spec cũng là no-op, không throw.)
      if (!(p.sz > 0)) continue;
      var ab = alphaBucket(p);
      if (ab < 0) continue;
      var b = byColor.get(p.c);
      if (!b) { b = { c: p.c, paths: [] }; byColor.set(p.c, b); out.push(b); }
      var path = b.paths[ab];
      if (!path) { path = new Path2D(); b.paths[ab] = path; }
      path.rect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
    return out;
  }

  // Đếm số bucket thực sự có hạt (số draw call fill() sẽ gọi).
  function bucketCount(buckets) {
    var n = 0;
    for (var i = 0; i < buckets.length; i++) {
      var paths = buckets[i].paths;
      for (var ab = 1; ab <= ALPHA_STEPS; ab++) if (paths[ab]) n++;
    }
    return n;
  }

  // Vẽ toàn bộ hạt theo bucket. Không restore globalAlpha — caller làm,
  // giống vòng vẽ cũ (game.js set ctx.globalAlpha = 1 ngay sau khi vẽ hạt).
  function draw(ctx, parts) {
    if (!parts || parts.length === 0) return;
    var buckets = bucketize(parts);
    for (var i = 0; i < buckets.length; i++) {
      var b = buckets[i];
      ctx.fillStyle = b.c;
      var paths = b.paths;
      for (var ab = 1; ab <= ALPHA_STEPS; ab++) {
        var path = paths[ab];
        if (!path) continue;
        ctx.globalAlpha = ab / ALPHA_STEPS;
        ctx.fill(path);
      }
    }
  }

  window.WKParticles = {
    ALPHA_STEPS: ALPHA_STEPS,
    alphaBucket: alphaBucket,
    bucketize: bucketize,
    bucketCount: bucketCount,
    draw: draw,
  };
})();
