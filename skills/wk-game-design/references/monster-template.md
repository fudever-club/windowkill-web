# Template đề xuất quái mới — WINDOWKILL Web Edition

Điền đầy đủ mọi mục. Mọi ý tưởng quái mới phải tương tác được với cơ chế
**cửa sổ = máu** (gặm/nứt/băng viền, hất văng, đẩy cửa sổ...). Nếu không, ý tưởng
đó không hợp với game này.

## 1. Tên
- Tên tiếng Việt (ngắn, 2–4 từ):
- id kỹ thuật (snake_case, tiếng Anh):

## 2. Vai trò
- Vai trò chính trong đội hình quái:
- Debut: ải / wave (mỗi wave debut tối đa 1 loại quái mới):
- Banner debut: `QUÁI MỚI: <tên> — <1 dòng cách khắc chế>`

## 3. Hành vi (state machine)
- Các state + điều kiện chuyển (kẻ thù cũ không có state này? ghi khác biệt):
- Tốc độ (×spM), máu (công thức theo wave ×hpM), XP, gem:

## 4. Cách tấn công
- Tấn công TÀU (sát thương nào, tầm nào):
- Tấn công CỬA SỔ — trực tiếp hay gián tiếp? (gặm? nứt? băng? bảo kê chewer?):

## 5. Điểm yếu + cách khắc chế (BẮT BUỘC)
- Điểm yếu:
- Cách khắc chế cụ thể (nâng cấp nào / chiến thuật nào khắc chế cứng?):
- Cơ chế cửa sổ liên quan (hất viền? bắn viền đẩy?):

## 6. Tương tác với cửa sổ
- Quái làm gì với cửa sổ (`resizeTo` / `moveBy` / nứt / băng / khe hở...):
- Người chơi đáp trả bằng cửa sổ thế nào (ví dụ: bắn viền hất văng):

## 7. Readability
- Màu (theo bảng mục tiêu): Tím = đe dọa CỬA SỔ · Đỏ = sát thương TÀU · Vàng = tốc độ cao · Vàng kim = bonus · Cam = trâu · Xanh lá = hỗ trợ/sinh sản · Xanh dương = khống chế · Bạc = giáp phản xạ · Cyan = phân tách · Hồng = yếu đông
- Shape (theo hành vi): nhọn = lao vào tàu · vuông = bám/gặm cửa sổ · tròn = nổ/đẻ/tách · sao = buff/bonus · đa giác đều = trâu/giáp
- Telegraph mỗi đòn nguy hiểm (≥0.5s, 3 phase chuẩn bị vàng → sắp phát đỏ/tím → phát động, kèm âm thanh + text lần đầu):
- Vai trò không trùng 14 quái hiện có (kiểm tra bảng `docs/bestiary.md` §2):

## 8. Checklist trước khi trình Lead
- [ ] Tương tác với cửa sổ = máu (mục 6) — không phải quái "đánh tàu thuần"
- [ ] Có điểm yếu + cách khắc chế cụ thể (mục 5)
- [ ] Vai trò mới, không trùng 14 quái hiện có
- [ ] Telegraph ≥ 0.5s, đủ visual + âm thanh + text lần đầu
- [ ] Đúng bảng màu mục tiêu + shape hành vi; 0.5s hiện hình khi spawn
- [ ] Chỉ số theo công thức (máu ×hpM, tốc ×spM) — không hard-code
