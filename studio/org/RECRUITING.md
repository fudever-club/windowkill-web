# Tuyển dụng — FU-DEVER Game Studio

_Tuyển theo chỉ đạo CEO ngày 2026-10-02._

## Nguyên tắc chung

1. Làm trên nhánh riêng, không push thẳng main.
2. Quality gate: Branch → PR → CI xanh → QA/Test Lead sign-off → CEO duyệt.
3. Trung thực về môi trường test (emulation ghi emulation).
4. Không emoji trong DOM/UI. Giao tiếp tiếng Việt, báo cáo ngắn.

## 1. Mobile Dev Team (3-4 người)

Phạm vi: js/mobile.js, touch controls, responsive CSS, portrait/landscape, a11y mobile.
Tiêu chí: hiểu touch events/multi-touch/floating joystick; biết viewport, safe-area, DPR;
test được trên CDP emulation + ghi rõ giới hạn; không phá gameplay desktop.

## 2. Backend Engineer (1-2 người)

Phạm vi: server Fly.io (Node zero-dep + SQLite), API leaderboard, profile/token auth,
season endpoints, migration DB. Tiêu chí: endpoint REST sạch + validate input; hiểu token
auth one-time; migration forward-only; mọi endpoint mới phải có test + dọn test data.
Cấm commit secret/token vào repo.

## 3. DevOps/Release Engineer (1 người)

Phạm vi: pipeline release — build portal, push itch.io bằng butler CLI, phối hợp tool
Vercel của CEO (KHÔNG tự deploy Vercel), deploy Fly.io, bump SW/cache version mỗi release,
verify production sau deploy. Mỗi release ghi build ID + version + verify 200.
