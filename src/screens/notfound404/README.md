# Trang 404 tone xanh lá

## Cài đặt
Đặt `NotFoundPage.tsx` và `NotFoundPage.css` cùng thư mục (ví dụ `src/pages/NotFoundPage/`).

Cần các package đang dùng trong dự án: `react-router-dom` và `lucide-react`.

Trong file khai báo Routes:

```tsx
import NotFoundPage from "./pages/NotFoundPage/NotFoundPage";

<Route path="*" element={<NotFoundPage />} />
```

**Lưu ý:** Nút "Về trang chủ" hiện dùng `navigate("/home")`. Nếu route trang chủ của dự án khác, đổi đúng đường dẫn này.
