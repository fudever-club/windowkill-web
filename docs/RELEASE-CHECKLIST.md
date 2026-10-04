# RELEASE CHECKLIST — WINDOWKILL

Checklist end-to-end cho một release: từ test → PR → merge → build portal →
butler push → verify. Đánh dấu từng bước khi xong. Mỗi bước có lệnh cụ thể —
copy-paste là chạy.

> Quy ước repo (không phá): branch → PR → CI xanh → merge, **cấm push thẳng main**.
> Vercel production do tool của CEO tự deploy — **Muse không đụng**.

## 0. Chuẩn bị (làm 1 lần mỗi clone)

```bash
git config core.hooksPath .githooks   # bật pre-commit hook: tự stamp sw.js VERSION
```

Không bật hook cũng không sao — CI sẽ bắt (bước 4) — nhưng bật thì khỏi nghĩ.

## 1. Sync main + tạo branch

```bash
git checkout main && git pull --ff-only
git checkout -b feat/release-<ten-ngan>
```

## 2. Chạy test suite

```bash
node --test tests/*.test.js          # client: phải pass hết (hiện ~432 pass)
node --test server/tests/*.test.js   # server (Fly.io backend)
bash -n scripts/*.sh .githooks/pre-commit   # syntax check script release
node scripts/bump-sw.js --check      # verify SW version (đáng lẽ hook đã lo)
```

Tất cả xanh mới đi tiếp. Test nào đỏ → fix trước, không "merge rồi tính sau".

## 3. Build thử gói portal

```bash
./scripts/build-portal.sh
# kỳ vọng cuối log: "BUILD PASS: đạt mọi yêu cầu verify portal"
```

Rớt ở đây (thiếu file / vượt 50MB / sw.js lọt vào zip) → fix rồi build lại.

## 4. Commit → push → mở PR

```bash
git add -A
git commit -m "release: <mô tả ngắn>"
# pre-commit hook tự stamp sw.js VERSION + stage lại nếu commit chạm site assets.
# (Không bao giờ sửa tay dòng VERSION trong sw.js nữa.)

git push -u origin feat/release-<ten-ngan>
```

Mở PR trên GitHub web UI (sandbox không có credential cho `gh`/git push —
dùng browser task). Tiêu đề PR rõ ràng, mô tả có gì đổi.

## 5. CI xanh

PR phải có tick xanh ở tất cả job, đặc biệt:

- `Run test suite` (node --test)
- `SW cache version check (auto-stamp)` — nếu đỏ với lỗi
  *"PR đổi site file(s) mà sw.js không được restamp"* → chạy local:
  ```bash
  node scripts/bump-sw.js
  git add sw.js && git commit --amend --no-edit && git push --force-with-lease
  ```

## 6. Merge vào main

Nhấn **Merge pull request** trên GitHub (giữ nguyên merge commit, không cần squash).
Xóa branch sau merge nếu GitHub hỏi.

## 7. Build gói portal chính thức (từ main mới nhất)

```bash
git checkout main && git pull --ff-only
./scripts/build-portal.sh
# ra: dist/windowkill-web-portal.zip + "BUILD PASS"
```

## 8. Push lên itch.io (auto-retry)

```bash
./scripts/itchio-push.sh quangnhat1504/windowkill:web
# tùy chọn version trace được về commit:
./scripts/itchio-push.sh quangnhat1504/windowkill:web dist/windowkill-web-portal.zip "$(git rev-parse --short HEAD)"
```

Script tự:

- retry tối đa **3 lần** nếu gặp lỗi mạng/proxy transient
  (`use of closed network connection`, timeout...) với backoff 5s → 15s;
- **dừng ngay, không retry** nếu lỗi auth/config (key sai, target sai...);
- sau push thành công, **verify trang itch.io trả HTTP 200** (curl, thử 5 lần)
  rồi mới in `SUCCESS`.

Kỳ vọng cuối log: `SUCCESS: push ... + verify https://quangnhat1504.itch.io/windowkill → HTTP 200.`

## 9. Verify tay (nhanh, 1 phút)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://quangnhat1504.itch.io/windowkill   # → 200
```

Mở trang itch.io trên browser: nút **Download** hiện, version/userversion đúng
bản vừa push. (Script đã verify 200, bước này là sanity check bằng mắt.)

## 10. Desktop .exe (chỉ khi release bản desktop)

Không build trong checklist này — xem `electron/README.md` mục checklist 8 bước,
**chạy trên máy Windows thật** trước khi phát hành (E2E: popup thật, focus,
CTA, version).

## 11. Web production (windowkill.fudever.com)

- **Không đụng**: Vercel tự deploy từ main bằng tool của CEO.
- Sau khi Vercel deploy xong, mở game và **F5 1–2 lần** (hoặc Clear site data):
  Service Worker dùng stale-while-revalidate nên lần tải đầu sau deploy vẫn có
  thể chạy JS cũ từ cache — **Ctrl+F5 không bypass SW**.
- Smoke test nhanh: vào game, qua ải 1, check không có lớp xám/đơ (regression cũ).

## 12. Ghi nhận release

- Ghi 1 dòng vào tracking/goal (release nào, itch.io userversion gì, link).
- Nếu có gì bất thường trong quá trình release → bổ sung vào mục
  Troubleshooting bên dưới để lần sau khỏi vấp lại.

---

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| `use of closed network connection` khi butler push | egress proxy sandbox rớt | Script **tự retry 3 lần**; vẫn rớt → đợi vài phút chạy lại (upload resumable) |
| CI `SW cache version check` đỏ | commit bypass pre-commit hook | `node scripts/bump-sw.js` → amend → push lại (bước 5) |
| Sau deploy web vẫn chạy bản cũ | SW cache (stale-while-revalidate) | F5 1–2 lần hoặc Clear site data; kiểm tra `sw.js` trên production có VERSION mới |
| `BUILD FAILED: verify portal` | zip vượt 50MB / thiếu file / sw.js lọt vào | đọc dòng `verify LỖI:` trong log build-portal.sh, fix rồi build lại |
| butler: `LỖI: không tìm thấy butler` | chưa cài | xem `dist/PORTAL-SETUP.md` mục cài đặt |
| Push báo `LỖI không transient` | key sai / target sai | kiểm tra `~/.config/windowkill/itchio.env`, không retry vô ích |

## Tài liệu liên quan

- `scripts/bump-sw.js` — cơ chế auto-stamp SW version (đọc header comment)
- `.githooks/pre-commit` — hook (wrapper gọi `bump-sw.js --hook`)
- `scripts/build-portal.sh` — build zip portal + verify
- `scripts/itchio-push.sh` — push itch.io + auto-retry + verify 200
- `dist/PORTAL-SETUP.md` — setup itch.io/butler lần đầu
- `electron/README.md` — checklist 8 bước E2E trên Windows thật
