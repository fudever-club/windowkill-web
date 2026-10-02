# Sơ đồ tổ chức — FU-DEVER Game Studio

_Cập nhật 2026-10-02: thêm Chief Technical, tuyển Mobile Dev Team, Backend Engineer,
DevOps/Release Engineer. Quy mô ~20 → ~26._

- CEO: NHAT
- CHIEF TECHNICAL (mới): điều phối tổng thể kỹ thuật
  - KHỐI GAME DESIGN: thiết kế game, season, economy, art direction
  - KHỐI ENGINEERING:
    - Web Team (gameplay, engine, UI launcher)
    - Mobile Dev Team (mới, 3-4 người): mobile.js, touch, responsive, portrait/landscape
    - Backend Engineer (mới): Fly.io leaderboard, season endpoints, SQLite, auth token
    - DevOps/Release Engineer (mới): pipeline itch.io/Vercel/Fly, SW/cache version
  - KHỐI GROWTH: portal, marketing, cộng đồng, media
  - TESTING TEAM / QA (6 vai): Test Lead (sign-off gate), Automation, Device/Browser Matrix,
    Backend/API, Performance, Release Captain

## Quy tắc chung

- Mỗi team làm trên nhánh riêng, KHÔNG push thẳng main.
- Quality gate: Branch → PR → CI xanh → QA/Test Lead sign-off → CEO duyệt merge.
