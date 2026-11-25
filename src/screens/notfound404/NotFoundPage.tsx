import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Home, Leaf, SearchX } from "lucide-react";
import "./NotFoundPage.css";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <main className="hbm-404-page">
      <div className="hbm-404-glow hbm-404-glow-a" aria-hidden="true" />
      <div className="hbm-404-glow hbm-404-glow-b" aria-hidden="true" />

      <section className="hbm-404-panel" aria-labelledby="hbm-404-title">
        <div className="hbm-404-brand">
          <span className="hbm-404-brand-icon">
            <Leaf size={20} strokeWidth={2.5} />
          </span>
          <span>HỆ THỐNG QUẢN LÝ</span>
        </div>

        <div className="hbm-404-art" aria-hidden="true">
          <span className="hbm-404-orbit hbm-404-orbit-one" />
          <span className="hbm-404-orbit hbm-404-orbit-two" />
          <span className="hbm-404-numbers">
            4
            <span className="hbm-404-zero">
              <SearchX size={67} strokeWidth={1.7} />
            </span>
            4
          </span>
          <span className="hbm-404-dot hbm-404-dot-one" />
          <span className="hbm-404-dot hbm-404-dot-two" />
        </div>

        <div className="hbm-404-eyebrow">ĐƯỜNG DẪN KHÔNG TỒN TẠI</div>
        <h1 id="hbm-404-title">Rất tiếc, không tìm thấy trang!</h1>
        <p className="hbm-404-description">
          Trang bạn đang tìm kiếm có thể đã được di chuyển, đổi tên hoặc đường
          dẫn chưa chính xác. Bạn có thể quay lại hoặc trở về trang chủ để tiếp
          tục.
        </p>

        <div className="hbm-404-actions">
          <button
            className="hbm-404-home"
            type="button"
            onClick={() => navigate("/")}
          >
            <Home size={18} /> Về trang chủ <ArrowRight size={17} />
          </button>
          <button
            className="hbm-404-back"
            type="button"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={18} /> Quay lại
          </button>
        </div>

        <div className="hbm-404-footer">
          Mã lỗi 404 <span>•</span> Không tìm thấy nội dung yêu cầu
        </div>
      </section>
    </main>
  );
}
