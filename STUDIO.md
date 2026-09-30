# FU-DEVER GAME STUDIO — Sổ tay vận hành

> Studio phát triển game **WINDOWKILL Web Edition**, thành lập theo phê duyệt của CEO
> (Đặng Quang Nhật). Mục tiêu: đưa game ra thị trường, tiếp cận nhiều người dùng.

## 1. Sơ đồ tổ chức (18 người — 3 khối)

### Khối Game — Game Design (6)
| Vai trò | Nhiệm vụ |
|---|---|
| Lead Game Designer | Chốt design, hòa giải bản vẽ, giữ GAME-DESIGN-DOC |
| Systems Designer | Hệ thống: ải, wave, difficulty, meta, daily |
| Level Designer | Thiết kế ải, nhịp wave, boss encounter |
| Monster Designer | Quái mới (xem `docs/bestiary.md`) |
| UX Writer | Copy trong game, tutorial beat (giọng fu-dever-writer) |
| Game Feel Designer | Juice, hitstop, SFX, haptic |

Skill: `skills/wk-game-design/` · Nhánh: `team/game-design`

### Khối Kỹ thuật — Engineering (6)
| Vai trò | Nhiệm vụ |
|---|---|
| Lead Engineer | Kiến trúc, duyệt dependency, giữ CI xanh |
| Gameplay Programmer | `js/game.js`, quái, ải, boss |
| Frontend/Web Programmer | `index.html`, `game.html`, CSS, PWA, SEO |
| Backend Programmer | `server/` (Node + SQLite), leaderboard |
| QA Engineer | Test, checklist `docs/QA-CHECKLIST.md`, security review |
| DevOps/Release Engineer | CI/CD, Vercel deploy, Electron build, release |

Skill: `skills/wk-engineering/` · Nhánh: `team/engineering`

### Khối Tăng trưởng — Growth (6)
| Vai trò | Nhiệm vụ |
|---|---|
| Lead Growth/Marketing | GTM plan, launch checklist |
| Content Creator | Video showcase, social content |
| SEO Specialist | SEO/ASO, sitemap, OG |
| Community Manager | Fanpage `facebook.com/FPTUDever`, group nội bộ |
| Data Analyst | Analytics ẩn danh, feedback loop |
| Partnerships | Đối tác, CLB, cộng đồng |

Skill: `skills/wk-growth/` · Nhánh: `team/growth`

### Vai trò dùng chung
- **QA toàn studio**: skill `skills/wk-qa/` (mọi team đều đọc trước khi xin merge).
- **Studio Ops**: skills, rules, nhánh, tài liệu vận hành (chính file này).

## 2. Skills của từng team

| Skill | Dùng khi | Team |
|---|---|---|
| `skills/wk-game-design/` | Thiết kế quái, ải, boss, balance, tutorial, copy trong game | Game |
| `skills/wk-engineering/` | Viết code: bản đồ file, quy ước vanilla JS, test, perf, PWA/SEO | Engineering |
| `skills/wk-growth/` | Copy marketing, README, video showcase, GTM | Growth |
| `skills/wk-qa/` | QA browser thật, security review, release check | Tất cả |

Đọc SKILL.md của team mình **trước khi nhận việc**. Skill có frontmatter
`name`/`description` theo chuẩn (tham khảo `skills/fu-dever-writer` của
repo `fudever-club/fudever-communication`).

## 3. Rules (luật bắt buộc)

| File | Nội dung |
|---|---|
| `rules/wk-brand-rules.md` | Locked facts thương hiệu, màu, logo, disclaimer fan-made |
| `rules/wk-git-workflow.md` | Nhánh, PR, commit message, merge |
| `rules/wk-code-conventions.md` | Vanilla JS, data-driven config, localStorage `wk_*`, cấm binary lớn |
| `rules/wk-security-rules.md` | CSP, sanitize, Electron guards, cấm secret |

Vi phạm rules = PR bị từ chối.

## 4. Quy trình nhánh (tóm tắt)

```
main ── KHÔNG push trực tiếp, chỉ merge qua PR + CI xanh
├── team/game-design
├── team/engineering
├── team/growth
├── team/qa
└── studio/ops
```

Chi tiết: `rules/wk-git-workflow.md`.

## 5. Cách nhận việc (cho agent mới vào team)

1. Đọc `STUDIO.md` (file này) + skill của team mình + 4 file rules.
2. Đọc `ROADMAP.md` và doc liên quan (`studio/game-design/GAME-DESIGN-DOC.md`,
   `docs/QA-CHECKLIST.md`, `SECURITY.md`).
3. Tạo nhánh `feature/<team>/<slug>` từ `team/<team>`, làm việc, chạy test.
4. Mở PR về `team/<team>`; Lead team review rồi PR lên `main` (CI xanh).

## 6. Link nhanh

- Production: https://windowkill-web.vercel.app
- GitHub: https://github.com/fudever-club/windowkill-web
- Release: https://github.com/fudever-club/windowkill-web/releases/tag/v1.0.0
- Brand voice: repo `fudever-club/fudever-communication` → `skills/fu-dever-writer/`
