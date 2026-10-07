# Nhà có Alex — FINAL 3

Bản cập nhật theo yêu cầu: mỗi truyện có **tác giả**, **thể loại chính** và **tình trạng** (Đang viết / Đã hoàn thành) trên danh sách, tủ truyện và trang đọc. Form quản trị cũng cho chọn tình trạng.

Các tính năng đã chốt:
- Chỉ Alex đăng truyện.
- Bình luận theo từng đoạn: chỉ icon 💬 + số lượng, không highlight.
- Chống copy ở mức trình duyệt (không thể chống tuyệt đối screenshot/OCR).
- Chế độ Sáng / Sepia / Đêm.
- Tăng/giảm cỡ chữ và lưu lựa chọn đọc.
- Tủ truyện.
- Giao diện đăng nhập Google / Discord / Facebook (cần cấu hình OAuth khi triển khai thật).
- Giao diện tối giản, ưu tiên đọc trên điện thoại.

## Demo
Giải nén và mở `index.html` bằng trình duyệt.

## Khi triển khai thật
Kết nối Supabase để có tài khoản thật, database, comment dùng chung và OAuth Google/Discord/Facebook. Không đặt service-role key trong frontend.
