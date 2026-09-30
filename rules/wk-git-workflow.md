# WK Git Workflow — Quy trình nhánh cho FU-DEVER Game Studio

## Sơ đồ nhánh

```
main                        ← nhánh phát hành. KHÔNG push trực tiếp.
├── team/game-design        ← team Game Design phát triển
├── team/engineering        ← team Engineering phát triển
├── team/growth             ← team Growth phát triển
├── team/qa                 ← team QA phát triển
└── studio/ops              ← ops/studio (skills, rules, STUDIO.md)
```

Nhánh tính năng cá nhân: `feature/<team>/<slug-ngan>` (ví dụ `feature/engineering/stage-select-ui`),
tạo từ nhánh `team/<team>` tương ứng, merge ngược về `team/<team>` bằng PR.

## Luật sắt

1. **Cấm push trực tiếp lên `main`.** Mọi thay đổi vào `main` qua Pull Request.
2. **CI phải xanh** mới được merge PR vào `main` (workflow `.github/workflows/ci.yml`).
3. Nhánh `team/*` merge vào `main` cũng qua PR + CI xanh, do Lead team mở.
4. Trước khi mở PR: `git pull --rebase` nhánh đích, giải quyết conflict local, chạy test.

## Quy ước commit message

```
<Team>: <mô tả ngắn bằng tiếng Việt, thì hiện tại>
```

Ví dụ:

```
Gameplay: thêm quái Đom Đóm Vàng theo bestiary
Frontend: PWA installable + màn hình offline
QA: 38 tests mới + CI củng cố
Docs/Ops: cập nhật README và MCP survey
```

Team hợp lệ: `Gameplay`, `Frontend`, `Backend`, `QA`, `Docs/Ops`, `Growth`, `Design`.

## Quy trình PR vào main (checklist)

- [ ] Tiêu đề PR rõ ràng: `[team] tóm tắt thay đổi`
- [ ] Mô tả: đã làm gì, test nào chạy, link issue (nếu có)
- [ ] Không commit file binary lớn (xem rules/wk-code-conventions.md)
- [ ] Không có secret/token trong diff (CI có bước secret scan)
- [ ] CI xanh (syntax check, tests, audit, link check)
- [ ] Ít nhất 1 reviewer khác team approve (với PR liên team)

## Tạo nhánh team mới

```bash
git fetch origin
git checkout -b team/<ten-team> origin/main
git push -u origin team/<ten-team>
```

## Merge

Ưu tiên **squash merge** cho `feature/*` → `team/*`; **merge commit** cho `team/*` → `main`
để giữ lịch sử theo team. Không force-push lên nhánh đã có PR đang mở.
