# NSXEdu — Chấm công AI + GPS (chỉ ghi nhận có mặt)

## Cài đặt
Chép `AttendancePage.tsx`, `attendanceAdapter.ts`, `attendance.css` vào `src/attendance/`. Sử dụng dependencies đã có: React, Firebase, lucide-react.

```tsx
<AttendancePage auth={auth} db={db} functions={functions} logoSrc="/images/logo-hbm.png" />
```

## Ảnh cơ sở
Đặt ảnh thật tại:
- `public/images/attendance/cs1.jpg` — CS1, 36 Đặng Dung, Liên Chiểu, Đà Nẵng
- `public/images/attendance/cs2.jpg` — CS2, 05 Đặng Thai Mai, Đà Nẵng

Khi chưa có ảnh, thẻ hiển thị nền minh họa thay vì ảnh bị lỗi. Hai thẻ chia đôi chiều rộng, nhấn để chọn.

## Luồng chấm công
- Chọn cơ sở, ca sáng/chiều, nhấn Chấm công.
- GPS được lấy và `startFaceAttendance` xác thực quyền cơ sở/vùng GPS **trước** khi mở camera.
- Camera trước tự động chụp, `finishFaceAttendance` đối chiếu AI và lưu bằng chứng R2.
- Chỉ `checkIn` (có mặt), không hiển thị hoặc gọi `checkOut`.
- Dữ liệu Firestore vẫn theo schema `faceAttendance`; bản này không xóa bản ghi giờ ra cũ, chỉ không hiển thị.

## Lưu ý
Dịch vụ AI `/verify` cần được triển khai thật. Camera khung tròn không phải kiểm tra chống giả mạo. Nếu Firestore rules không cho phép đọc `faceAttendance`, cần có API backend đọc lịch sử phù hợp. Cần bật App Check nếu Functions đang `enforceAppCheck: true`.
