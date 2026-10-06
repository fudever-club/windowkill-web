/* ---------------- BOSS PERSONALITY: phụ kiện hài vẽ trên boss ----------------
 * CHỈ visual — không đổi hitbox (r), không đổi sát thương. */
function drawBossFlair(c, bs, r) {
  const t = bs.t || 0;
  if (bs.persona === "gnome") {
    // hàm nhai chomp-chomp: răng trên/dưới đóng mở
    const jaw = Math.abs(Math.sin(t * 5)) * r * 0.35;
    c.fillStyle = "#fff";
    c.fillRect(-r * 0.6, -r * 0.6, r * 1.2, jaw * 0.5);
    c.fillRect(-r * 0.6, r * 0.6 - jaw * 0.5, r * 1.2, jaw * 0.5);
  } else if (bs.persona === "deadline") {
    // tờ giấy deadline đội trên đầu
    c.save(); c.rotate(Math.sin(t * 2) * 0.2);
    c.fillStyle = "#fff"; c.fillRect(-14, -r - 30, 28, 38);
    c.fillStyle = "#8b2fc9";
    for (let i = 0; i < 3; i++) c.fillRect(-10, -r - 22 + i * 10, 20, 3);
    c.restore();
  } else if (bs.persona === "dj") {
    // equalizer + viền đổi màu theo beat
    const beat = 0.5 + 0.5 * Math.sin(t * 8);
    const hues = ["#ff5d5d", "#ffd166", "#4dd8a7", "#7df9ff", "#b26bff"];
    c.strokeStyle = hues[Math.floor(t * 4) % hues.length]; c.lineWidth = 4 + beat * 4;
    c.strokeRect(-r - 6, -r - 6, (r + 6) * 2, (r + 6) * 2);
    c.fillStyle = "#ffd166";
    for (let i = -2; i <= 2; i++) {
      const h = 8 + beat * 26 * (0.6 + 0.4 * Math.sin(t * 8 + i));
      c.fillRect(i * 16 - 5, -r - 14 - h, 10, h);
    }
  } else if (bs.persona === "sniffly") {
    // mũi đỏ hắt xì + khăn giấy
    c.fillStyle = "#ff8a8a";
    c.beginPath(); c.arc(0, -r * 0.55, 8 + Math.sin(t * 6) * 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#fff"; c.fillRect(-22, r * 0.55, 44, 10);
  } else if (bs.persona === "corechill") {
    // tách cà phê chill
    c.fillStyle = "#fff"; c.fillRect(r * 0.5, -r * 0.2, 22, 26);
    c.strokeStyle = "#fff"; c.lineWidth = 4;
    c.beginPath(); c.arc(r * 0.5 + 26, -r * 0.2 + 13, 8, -1.2, 1.2); c.stroke();
    c.fillStyle = "#6b3f1d"; c.fillRect(r * 0.5 + 3, -r * 0.2 + 3, 16, 8);
  } else if (bs.persona === "teaser") {
    // vương miện cà khịa + kính râm
    c.fillStyle = "#ffd166";
    c.beginPath();
    c.moveTo(-26, -r - 8); c.lineTo(-26, -r - 30); c.lineTo(-13, -r - 16);
    c.lineTo(0, -r - 34); c.lineTo(13, -r - 16); c.lineTo(26, -r - 30); c.lineTo(26, -r - 8);
    c.closePath(); c.fill();
    c.fillStyle = "#111";
    c.fillRect(-20, -14, 16, 10); c.fillRect(4, -14, 16, 10);
  }
}
