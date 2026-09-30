# GTM Plan — WINDOWKILL Web Edition

> Chủ biên: Partnerships/Content Strategist, team Growth — FU-DEVER Game Studio
> Ngôn ngữ: tiếng Việt (thuật ngữ kỹ thuật giữ tiếng Anh). Voice: FU-DEVER Official Voice cho nội dung công khai, Internal Community Voice cho group nội bộ. Giọng văn tuân thủ skill `fu-dever-writer`.
> Cập nhật lần đầu: 01/10/2026

**Bối cảnh cố định (không sửa):**
- Game: WINDOWKILL Web Edition — twin-stick shooter chạy trong **popup trình duyệt**, cửa sổ popup chính là thanh máu: quái dùng `window.resizeTo()` thật để gặm nhỏ cửa sổ, đạn dùng `window.moveBy()` thật để đẩy cửa sổ bay.
- Gameplay: 6 loại quái (chaser, chewer, tank, dasher, splitter, mini) · boss mỗi 5 wave · 12 nâng cấp · XP/level/draft 3 nâng cấp · pickup tim / khiên / nuke · 3 độ khó (Chill / Thường / Khắc nghiệt) · profiles người chơi local · mobile 2 joystick · fallback "đấu trường ảo" khi trình duyệt chặn resize · backend Node + SQLite tùy chọn cho leaderboard online.
- Production: https://windowkill-web.vercel.app · GitHub: https://github.com/fudever-club/windowkill-web · Release v1.0.0 có bản `.exe` Windows portable.
- Brand: CÂU LẠC BỘ LẬP TRÌNH FU-DEVER / FU-DEVER Software Engineering Club — Đại học FPT Đà Nẵng, EST. 2018 · Royal Blue #0066CC · tagline "WORK HARD - PLAY HARD" · fanpage facebook.com/FPTUDever · email club.dever@gmail.com · website fudever.com.
- Fan-made lấy cảm hứng từ Windowkill (Steam) — mọi copy công khai PHẢI giữ disclaimer: **"Dự án fan-made, lấy cảm hứng từ Windowkill trên Steam — không liên quan đến nhà phát triển gốc."**
- Audience: sinh viên FPTU Đà Nẵng (K16–K21, ngành IT/SE/AI), thành viên CLB, sinh viên ngoài trường tò mò về game lạ.

---

## 1. Landing Page Copy

*(Official Voice — đăng trên website/fanpage trang giới thiệu game. Giữ nguyên disclaimer ở cuối mỗi phiên bản.)*

### Headline

> **WINDOWKILL Web Edition — Twin-stick shooter mà thanh máu chính là… cửa sổ trình duyệt của bạn.**

### Subheadline

> Quái không đánh vào nhân vật — chúng dùng `window.resizeTo()` thật để gặm nhỏ cửa sổ game của bạn. Đạn của bạn dùng `window.moveBy()` thật để đẩy cửa sổ bay khắp màn hình. Chạy ngay trên trình duyệt, không cài đặt, có bản `.exe` portable nếu thích chơi offline.

### 5 bullet giá trị (scan nhanh)

- 🎯 **Cửa sổ = thanh máu.** Cửa sổ càng bị gặm nhỏ, bạn càng gần thua. Quản lý kích thước popup là một phần của chiến thuật.
- 💥 **6 loại quái + boss mỗi 5 wave.** Từ chaser bám riết đến tank trâu bò và boss bắn đạn quạt — mỗi wave đòi cách đánh khác nhau.
- 🃏 **Draft 3 nâng cấp mỗi level.** 12 nâng cấp + pickup tim, khiên, nuke để lật kèo khi wave đông.
- 📱 **Chơi mọi nơi.** 3 độ khó (Chill / Thường / Khắc nghiệt), 2 joystick trên mobile, profiles người chơi lưu riêng, fallback "đấu trường ảo" tự bật khi trình duyệt chặn resize popup.
- 🛠️ **Open-source, chạy local được.** Code mở trên GitHub, leaderboard online qua backend Node + SQLite tùy chọn — thích tự host thì tự deploy.

### CTA

> ▶️ **Chơi ngay:** https://windowkill-web.vercel.app
> ⭐ **Star & fork:** https://github.com/fudever-club/windowkill-web
> 💻 **Tải bản .exe Windows (v1.0.0):** xem mục Releases trên GitHub
> 💬 Thấy bug? Report qua form ở mục 4 bên dưới hoặc inbox fanpage FPTUDever.

*Disclaimer: WINDOWKILL Web Edition là dự án fan-made của FU-DEVER, lấy cảm hứng từ Windowkill trên Steam — không liên quan đến nhà phát triển gốc. Game miễn phí, code open-source.*

---

## 2. SEO Keywords

### Từ khóa đề xuất (18)

| # | Từ khóa | Ghi chú |
|---|---------|---------|
| 1 | game popup trình duyệt | intent chính, tiếng Việt |
| 2 | game bắn súng trình duyệt không cần cài | intent chính, tiếng Việt |
| 3 | twin-stick shooter web | thuật ngữ gốc |
| 4 | game web chơi trên trình duyệt miễn phí | tiếng Việt, volume chung |
| 5 | browser game no download | tiếng Anh |
| 6 | popup window game | cơ chế đặc trưng |
| 7 | game cửa sổ trình duyệt là thanh máu | long-tail, đúng USP |
| 8 | windowkill fan game web | brand-adjacent, có disclaimer |
| 9 | game bắn quái 2D web | tiếng Việt |
| 10 | web game open source | dev audience |
| 11 | game html5 chơi ngay | tiếng Việt |
| 12 | twin stick shooter javascript | dev + player |
| 13 | game sinh viên FPT làm | local intent |
| 14 | FU-DEVER game | brand keyword |
| 15 | game mobile 2 joystick web | tính năng mobile |
| 16 | roguelike shooter browser | thể loại phụ |
| 17 | wave survival browser game | thể loại phụ |
| 18 | game .exe portable windows miễn phí | bản download |

### Title tag + meta description (trang chủ)

**Title tag (≤ 60 ký tự):**

```
WINDOWKILL Web Edition — Twin-stick shooter trong popup trình duyệt | FU-DEVER
```

**Meta description (≤ 160 ký tự):**

```
Chơi twin-stick shooter ngay trên trình duyệt: cửa sổ popup chính là thanh máu, quái gặm nhỏ cửa sổ thật. 6 loại quái, boss mỗi 5 wave, miễn phí, open-source. Không cần cài đặt.
```

*(148 ký tự — vừa khung hiển thị Google. Có disclaimer fan-made trong footer trang, không nhét vào meta.)*

---

## 3. Content Calendar — 2 tuần đầu sau launch

Quy ước: **Tuần 1** = 7 ngày đầu kể từ ngày mở public (ngày P). **Tuần 2** = 7 ngày tiếp theo. Không ghi ngày dương lịch cụ thể để tránh bịa lịch — team Growth điền ngày P khi chốt launch.

### 3.1. Fanpage — Official Voice (3–4 bài/tuần)

**Bài 1 — Launch post (Ngày P, Fanpage, Official Voice)**
- *Hook:* "Hôm nay FU-DEVER thả một con game mà thanh máu của bạn là… cửa sổ trình duyệt. Gặm hết cửa sổ là thua."
- *Body:*
  - WINDOWKILL Web Edition là gì, 2–3 câu: twin-stick shooter trong popup, quái `resizeTo()` gặm cửa sổ, đạn `moveBy()` đẩy cửa sổ bay.
  - 3 bullet nhanh: 6 loại quái + boss mỗi 5 wave · 12 nâng cấp, draft 3 mỗi level · chơi ngay không cài đặt.
  - Link chơi + GitHub + bản .exe.
  - Disclaimer fan-made (1 dòng).
- *CTA:* "Chơi thử 1 run rồi comment wave cao nhất của bạn bên dưới 👇"

**Bài 2 — Gameplay clip (Ngày P+3, Fanpage, Official Voice)**
- *Hook:* "POV: bạn đang yên đang lành thì con chewer gặm mất nửa cửa sổ game."
- *Body:*
  - Clip 30–60s quay màn hình: wave đông, cửa sổ bị gặm nhỏ dần, người chơi dùng nuke lật kèo.
  - Caption giải thích cơ chế trong 2 câu cho người chưa biết.
- *CTA:* "Tag đứa bạn hay than game dễ để nó thử độ Khắc nghiệt 🎮"

**Bài 3 — Dev log (Ngày P+5, Fanpage, Official Voice)**
- *Hook:* "Vì sao team lại chọn làm game trong popup — thứ mà mọi trình duyệt đều cố chặn?"
- *Body:*
  - Kể ngắn quyết định kỹ thuật: popup = thanh máu là ý tưởng gốc từ Windowkill (Steam); thách thức lớn nhất là trình duyệt chặn `resizeTo` → giải pháp fallback "đấu trường ảo".
  - 1–2 câu về stack: HTML/CSS/JS thuần, Web Audio cho nhạc chiptune, backend Node + SQLite tùy chọn cho leaderboard.
  - Nhắc repo open-source, mời đọc code.
- *CTA:* "Dev nào tò mò implementation thì vào repo đọc file game.js ⭐"

**Bài 4 — FAQ (Ngày P+7, Fanpage, Official Voice)**
- *Hook:* "Tổng hợp 5 câu hỏi team nhận nhiều nhất sau 1 tuần mở game."
- *Body (dạng Q&A ngắn):*
  1. Trình duyệt chặn popup thì sao? → Game tự bật "đấu trường ảo", vẫn chơi bình thường.
  2. Có chơi trên điện thoại được không? → Có, 2 joystick cảm ứng.
  3. Game có liên quan gì đến Windowkill trên Steam? → Không. Đây là fan-made của CLB, lấy cảm hứng từ bản gốc.
  4. Mất mạng có chơi được không? → Có bản `.exe` Windows portable trong release v1.0.0.
  5. Muốn góp code / báo bug thì sao? → Link GitHub + form nhận bug (mục 4).
- *CTA:* "Còn câu hỏi nào khác thì để lại comment, team trả lời hết."

**Tuần 2 — Fanpage (3 bài, Official Voice)**

**Bài 5 — Mini leaderboard cộng đồng (Ngày P+10)**
- *Hook:* "Sau 10 ngày, wave cao nhất cộng đồng đang là wave __ — bạn có phá được không?"
- *Body:* Top 3 wave/score người chơi gửi về (che tên nếu cần) + nhắc 3 độ khó.
- *CTA:* "Chụp màn hình wave cao nhất gửi vào comment."

**Bài 6 — Behind the scenes: âm thanh (Ngày P+12)**
- *Hook:* "Nhạc chiptune trong game được code bằng tay, không dùng file mp3 nào."
- *Body:* 2–3 câu về Web Audio engine tự viết (file `js/audio.js` dùng chung cho menu + game), kèm clip ngắn bật/tắt nhạc trong settings.
- *CTA:* "Nghe thử rồi cho team biết track nào hợp vibe nhất 🎧"

**Bài 7 — Roadmap v1.1 (Ngày P+14)**
- *Hook:* "2 tuần, từng này bug đã fix — và đây là những gì team làm tiếp."
- *Body:* Liệt kê ngắn: bug đã fix từ feedback (không bịa số liệu — điền sau khi tổng hợp) → 3 mục roadmap v1.1 (ví dụ: thêm nâng cấp, cân bằng boss, leaderboard online mặc định).
- *CTA:* "Muốn tính năng gì vào v1.1 thì comment, team đọc hết."

### 3.2. Group nội bộ — Internal Community Voice (2–3 bài, KHÔNG hashtag, không ép slogan)

**Bài G1 — Rủ test game (Ngày P−1 hoặc P, Group nội bộ)**
- *Hook:* "Game lên production rồi, cần anh em vào phá thử trước khi public."
- *Body:*
  - Link production + nhắc bật cho phép popup.
  - Nhờ test 3 thứ: fallback đấu trường ảo (thử chặn popup rồi load lại), mobile 2 joystick, chuyển profile.
  - Bug thì quăng thẳng vào thread này, kèm trình duyệt + hệ điều hành.
- *CTA:* "Ai phá được bug đầu tiên thì team mời trà sữa."

**Bài G2 — Nhờ feedback bug có cấu trúc (Ngày P+4, Group nội bộ)**
- *Hook:* "Public được 4 ngày, gom feedback lại một chỗ cho dễ track."
- *Body:*
  - Template nhanh: Thiết bị / Trình duyệt / Độ khó / Wave gặp lỗi / Mô tả + ảnh hoặc clip.
  - Phân loại sẵn 3 nhãn để anh em tự gắn: `#bug` `#gameplay` `#content`.
  - Hứa: bug confirmed thì có tên trong credits bản vá.
- *CTA:* "Thấy gì lạ thì comment theo template, đừng để trôi."

**Bài G3 — Mini challenge điểm cao (Ngày P+9, Group nội bộ)**
- *Hook:* "Challenge nội bộ: độ Khắc nghiệt, ai lên wave cao nhất tuần này?"
- *Body:*
  - Luật gọn: chơi độ Khắc nghiệt, chụp màn hình wave + score, deadline cuối tuần.
  - Giải thưởng: do team Growth chốt (gợi ý: voucher trà sữa / credit contributor trong README).
  - Nhắc đây cũng là đợt stress-test boss wave 5/10/15.
- *CTA:* "Chốt kèo thì thả ảnh vào thread này."

---

## 4. Vòng lặp feedback

### 4.1. Kênh thu thập

| Kênh | Dùng cho | Người trực |
|------|----------|------------|
| Thread feedback ghim trong Group nội bộ | Bug + góp ý gameplay từ thành viên CLB | 1 mod group, check 2 lần/ngày |
| Comment + inbox fanpage FPTUDever | Feedback người chơi ngoài CLB | 1 bạn team Growth trực fanpage (ca sáng/chiều) |
| GitHub Issues (repo `fudever-club/windowkill-web`) | Bug kỹ thuật có log, đề xuất tính năng | Engineering triage mỗi 48h |
| Form nhận bug (Google Form, link trong game + fanpage) | Người chơi không dùng Facebook/GitHub | Tự động gom về sheet, Growth tổng hợp cuối tuần |

### 4.2. Template câu hỏi (dùng chung cho form + thread)

```
1. Thiết bị + trình duyệt (VD: laptop Win 11 + Chrome 126 / iPhone + Safari):
2. Độ khó đang chơi (Chill / Thường / Khắc nghiệt):
3. Bạn gặp ở wave mấy / màn hình nào:
4. Mô tả điều xảy ra (càng cụ thể càng tốt):
5. Có tái hiện được không? Các bước tái hiện:
6. Ảnh chụp / clip (nếu có):
7. Mức độ ảnh hưởng (chọn 1): không chơi được / chơi được nhưng khó chịu / góp ý cân bằng / ý tưởng tính năng mới
```

### 4.3. Phân loại

- **Bug** (không chơi được, crash, lỗi hiển thị, resize/move sai): gắn nhãn `bug` + mức độ (critical/major/minor) → chuyển **Engineering**.
- **Gameplay** (quái quá trâu/yếu, nâng cấp mất cân bằng, độ khó): gắn nhãn `gameplay` → chuyển **Design** (cân bằng số) + Engineering (nếu cần sửa code).
- **Content** (text sai chính tả, thiếu disclaimer, âm thanh, hình ảnh): gắn nhãn `content` → chuyển **Content/Design**.
- Mọi ticket đều có người nhận (assignee) và hạn xử lý: critical 24h, còn lại 7 ngày.

### 4.4. Chuyển cho team Design / Engineering

- Engineering nhận qua GitHub Issues (bug kỹ thuật) hoặc sheet tổng hợp (bug từ form/fanpage do Growth tạo issue hộ, ghi rõ nguồn).
- Design nhận qua thread riêng: bảng cân bằng (số liệu quái/nâng cấp theo wave) — Growth tổng hợp feedback gameplay thành đề xuất cụ thể ("tank wave 8 quá trâu ở độ Thường") thay vì chuyển nguyên văn cảm tính.
- Họp triage 30 phút mỗi thứ 2: Growth trình bày top feedback tuần, 2 team chốt scope bản vá.

### 4.5. Đóng vòng (trả lời người chơi)

- Mỗi reporter nhận phản hồi trong **72h**: đã ghi nhận / đang sửa / đã fix ở bản nào / từ chối kèm lý do (VD: ngoài scope v1.x).
- Bug đã fix: tag tên reporter trong bài "changelog bản vá" trên fanpage + ghi credits trong README nếu reporter đồng ý.
- Cuối mỗi 2 tuần: 1 bài tổng kết feedback (dạng bài 7 trong calendar) — người chơi thấy ý kiến của mình đi đến đâu thì lần sau mới tiếp tục góp ý.

---

## 5. Launch Checklist

Đánh dấu `[x]` khi xong. Owner mặc định: Growth phối hợp Engineering.

### Kỹ thuật
- [ ] Production https://windowkill-web.vercel.app load ổn định (test 3 trình duyệt: Chrome, Edge, Firefox + 1 mobile browser)
- [ ] Fallback "đấu trường ảo" tự kích hoạt khi trình duyệt chặn `resizeTo`/`moveBy` — đã test case chặn popup
- [ ] Test mobile: 2 joystick cảm ứng responsive, không vỡ layout ở màn hình nhỏ
- [ ] 3 độ khó chơi end-to-end được: vào game → qua wave 5 (gặp boss) → lên level → draft nâng cấp → game over → lưu profile
- [ ] CSP + security headers trên Vercel không chặn script/audio của game
- [ ] Bản `.exe` Windows portable v1.0.0 đính kèm đúng release, quét virus cơ bản trước khi public link
- [ ] Backend leaderboard (Node + SQLite) — nếu bật ở launch: deploy xong, test ghi/đọc điểm; nếu chưa: ghi rõ "sắp ra mắt" trong game, không để nút chết

### Nội dung
- [ ] README repo đầy đủ: giới thiệu, cách chạy local, cách deploy, credits, **disclaimer fan-made**
- [ ] Landing copy (mục 1) đã đăng lên website/fanpage, link production + GitHub + release đều sống
- [ ] Showcase video 30–60s (quay màn hình gameplay thật, có đoạn cửa sổ bị gặm + nuke) — dùng cho bài 2
- [ ] Title tag + meta description (mục 2) đã gắn vào trang chủ
- [ ] Disclaimer fan-made xuất hiện ở: footer web game, mô tả repo, mọi bài fanpage công khai

### Vận hành
- [ ] Người trực fanpage đã phân ca (sáng/chiều), có sẵn câu trả lời mẫu cho 5 FAQ (mục 3.1 bài 4)
- [ ] Form nhận bug đã mở, link đặt trong game (màn hình pause/game over) + bài ghim fanpage
- [ ] Thread feedback trong group nội bộ đã tạo + template (mục 4.2) đã ghim
- [ ] Backup plan nếu Vercel down: trang trạng thái/thông báo trên fanpage + link dự phòng (bản `.exe` / mirror deploy) sẵn sàng đăng trong 30 phút
- [ ] Backup plan nếu GitHub down: file release `.exe` có bản lưu cục bộ tại team, không phụ thuộc duy nhất vào Releases page
- [ ] Lịch đăng 2 tuần (mục 3) đã chốt ngày P và phân người viết/quay/dựng từng bài

---

*Hết GTM-PLAN.md — team Growth chịu trách nhiệm cập nhật sau mỗi đợt launch/review 2 tuần.*
