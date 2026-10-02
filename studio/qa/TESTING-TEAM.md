# TESTING TEAM — FU-DEVER Game Studio
### Thành lập: 2026-10-02 · theo lệnh user "tuyển thêm thành viên testing lo chuyện hệ thống"
### Branch: `team/testing-system-2026-10` · Repo: fudever-club/windowkill-web

Testing Team mở rộng từ QA hiện có, chuyên trách **system testing**: những gì
test unit/static không bắt được — luồng end-to-end, backend thật, thiết bị thật,
save migration, offline/PWA, hiệu năng. Team không viết gameplay, chỉ phá game
một cách có hệ thống.

---

## 1. Cơ cấu (6 vai)

| # | Vai | Người/phạm vi | Mandate |
|---|---|---|---|
| 1 | **Test Lead** | Điều phối | Sở hữu test plan + quality gate; là người duy nhất được sign-off "QA pass" trên PR; quyết định block/waive; báo cáo chất lượng mỗi release. |
| 2 | **Automation Engineer** | `tests/*.test.js` | Viết/mở rộng test tự động (`node --test`, không dependency); giữ suite < 60s; test mới cho mọi bug từng lọt production (regression pin); không để test flaky — flaky = bug của test, fix hoặc xóa. |
| 3 | **Device/Browser Matrix Owner** | Ma trận thiết bị | Sở hữu ma trận: Chromium (CDP) · Firefox · Safari/WebKit · Android thật · iPhone thật · desktop 1440/1280 · mobile 390/360. Mỗi PR chạm UI/gameplay: chạy tối thiểu Chromium + 1 mobile viewport; mỗi release: full matrix. Ghi rõ cái nào là emulation, cái nào là máy thật — không bao giờ ghi "đã test thiết bị thật" khi chỉ là emulation. |
| 4 | **Backend/API Tester** | Fly.io + `server/` | Test backend thật (không mock): health, profile token lifecycle (tạo → nộp điểm → 401/403 → xóa), leaderboard, rate-limit, CORS từ origin thật (web + itch iframe), migration DB (`PRAGMA user_version`), volume persistence (restart máy không mất data). Giữ 1 checklist `studio/qa/BACKEND-CHECKLIST.md` chạy lại mỗi khi `server/` đổi. |
| 5 | **Performance Tester** | FPS/heap/load | Baseline mỗi release (headless): FPS median, heap trend (phát hiện rò), số resources + transfer lần đầu, DOMContentLoaded/load. Ngưỡng cảnh báo: FPS median < 50, heap tăng đơn điệu > 20%/phiên, transfer trang menu > 1.5MB. Không tuyên bố "mượt" khi chưa đo. |
| 6 | **Release Captain** | Cổng release | Chạy release checklist: CI xanh → QA sign-off → merge → verify production (byte-check file deploy) → itch.io push + verify → ghi release note. Là người duy nhất bấm merge/deploy khi đã đủ chữ ký. |

Quy tắc chung: **mọi phát hiện ghi "đã verify bằng gì"** (tool + môi trường + commit). Cấm các từ "có vẻ", "chắc là", "test qua loa".

---

## 2. System testing gắn vào vòng đời PR

```
branch → PR mở
  ├─ [AUTO] CI: node --test tests/*.test.js + server tests + asset check → ❌ đỏ = không review
  ├─ [AUTO] Automation Engineer: test mới cho logic đổi (nếu là bugfix: regression pin)
  ├─ [HUMAN] Device/Browser Matrix Owner: smoke luồng đổi trên Chromium + 1 mobile
  ├─ [HUMAN] Backend/API Tester: nếu PR chạm server/ hoặc js/api.js → chạy BACKEND-CHECKLIST
  ├─ [HUMAN] Performance Tester: nếu PR chạm game.js/render/audio → đo baseline so với release trước
  └─ [GATE] Test Lead sign-off "QA pass" (comment trên PR) → Release Captain mới được merge
```

**Không có chữ ký Test Lead = không merge.** Waive (bỏ qua 1 gate) chỉ Test Lead được
quyết, phải ghi lý do công khai trên PR.

## 3. Lịch regression định kỳ

| Tần suất | Việc | Ai |
|---|---|---|
| Mỗi PR | CI full suite + smoke luồng đổi | Auto + Matrix Owner |
| Mỗi release (merge main) | Full matrix browser/device + backend checklist + perf baseline | Cả team |
| Hàng tuần | Chạy lại toàn bộ SYSTEM-TEST-GAPS checklist, cập nhật trạng thái | Test Lead |
| Mỗi mùa (Season) | Save migration matrix: seed save từ mọi version cũ → load → assert không crash/mất data | Automation + Backend |

## 4. Định nghĩa "xong" của 1 bug

1. Tái hiện được (ghi steps + môi trường).
2. Fix trên branch, có regression test pin lại.
3. Suite xanh, luồng liên quan QA lại trên trình duyệt thật (hoặc ghi rõ chỉ emulation).
4. Ghi vào audit report: fix gì, verify bằng gì, còn rủi ro gì.

---
*File liên quan: `SYSTEM-TEST-GAPS.md` (checklist gap), `FULL-AUDIT-2026-10-02.md` (audit baseline),
`BACKEND-CHECKLIST.md` (tạo khi backend đổi — Backend/API Tester sở hữu).*
