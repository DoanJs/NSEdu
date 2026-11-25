import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  AlertCircle,
  CalendarDays,
  ClipboardCheck,
  LoaderCircle,
  MessageSquareText,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../firebase.config";
import { useUserStore } from "../../../zustand";
import "./TeacherEvaluationPage.css";

export type TeacherEvaluation = {
  id: string;
  teacherId: string;
  year: number;
  month: number;
  totalScore: number;
  maxScore?: number;
  classification: string;
  leadershipComment?: string;
  status?: "draft" | "published";
};

const formatMonth = (month: number) => String(month).padStart(2, "0");

export default function TeacherEvaluationPage() {
  const { user } = useUserStore();
  const teacherId = user?.id ?? "";

  const [evaluations, setEvaluations] = useState<TeacherEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");

  useEffect(() => {
    if (!teacherId) {
      setEvaluations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setEvaluations([]);

    const evaluationsQuery = query(
      collection(db, "teacherEvaluations"),
      where("teacherId", "==", teacherId),
    );

    const unsubscribe = onSnapshot(
      evaluationsQuery,
      (snapshot) => {
        const items: TeacherEvaluation[] = snapshot.docs.map((document) => {
          const data = document.data();
          return {
            ...data,
            id: document.id,
          } as TeacherEvaluation;
        });
        setEvaluations(items);
        setError("");
        setLoading(false);
      },
      (firestoreError) => {
        console.error(
          "Không tải được phiếu đánh giá giáo viên:",
          firestoreError,
        );
        setEvaluations([]);
        setError(
          "Không thể tải phiếu đánh giá. Vui lòng kiểm tra kết nối hoặc quyền truy cập Firestore.",
        );
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [teacherId]);

  const publishedEvaluations = useMemo(
    () =>
      evaluations.filter(
        (e) => e.teacherId === teacherId && e.status !== "draft",
      ),
    [evaluations, teacherId],
  );

  const availableYears = useMemo(
    () =>
      Array.from(new Set(publishedEvaluations.map((e) => e.year))).sort(
        (a, b) => b - a,
      ),
    [publishedEvaluations],
  );

  const visibleEvaluations = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase("vi");
    return publishedEvaluations
      .filter((e) => selectedYear === "all" || String(e.year) === selectedYear)
      .filter(
        (e) =>
          !term ||
          `tháng ${e.month} ${formatMonth(e.month)}/${e.year} ${e.classification ?? ""} ${e.leadershipComment ?? ""}`
            .toLocaleLowerCase("vi")
            .includes(term),
      )
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }, [publishedEvaluations, keyword, selectedYear]);

  return (
    <main className="tev-page">
      <header className="tev-page-head">
        <div>
          <div className="tev-eyebrow">
            <ClipboardCheck size={17} /> HỒ SƠ ĐÁNH GIÁ
          </div>
          <h1>Đánh giá giáo viên</h1>
          <p>
            Theo dõi kết quả xếp loại và nhận xét của Ban lãnh đạo theo từng
            tháng.
          </p>
        </div>
      </header>

      <section className="tev-filter-panel" aria-label="Bộ lọc phiếu đánh giá">
        <label className="tev-search-box">
          <Search size={18} aria-hidden="true" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm tháng, xếp loại, nhận xét..."
            aria-label="Tìm phiếu đánh giá"
          />
        </label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          aria-label="Lọc theo năm"
        >
          <option value="all">Tất cả năm</option>
          {availableYears.map((year) => (
            <option key={year} value={String(year)}>
              Năm {year}
            </option>
          ))}
        </select>
        <div className="tev-count">
          <CalendarDays size={16} /> {visibleEvaluations.length} phiếu đánh giá
        </div>
      </section>

      {loading ? (
        <div className="tev-empty" role="status">
          <LoaderCircle size={34} />
          <strong>Đang tải phiếu đánh giá...</strong>
        </div>
      ) : error ? (
        <div className="tev-empty" role="alert">
          <AlertCircle size={36} />
          <strong>Không tải được dữ liệu</strong>
          <span>{error}</span>
        </div>
      ) : !teacherId ? (
        <div className="tev-empty">
          <AlertCircle size={36} />
          <strong>Chưa xác định được giáo viên</strong>
          <span>Vui lòng đăng nhập lại để xem phiếu đánh giá.</span>
        </div>
      ) : visibleEvaluations.length === 0 ? (
        <div className="tev-empty">
          <ClipboardCheck size={36} />
          <strong>Chưa có phiếu đánh giá phù hợp</strong>
          <span>Phiếu đã công bố sẽ xuất hiện tại đây.</span>
        </div>
      ) : (
        <section className="tev-grid" aria-label="Danh sách phiếu đánh giá">
          {visibleEvaluations.map((item) => (
            <article className="tev-card" key={item.id}>
              <div className="tev-card-top">
                <span className="tev-card-icon">
                  <CalendarDays size={21} />
                </span>
                <div className="tev-card-month">
                  <span>PHIẾU ĐÁNH GIÁ</span>
                  <h2>Tháng {formatMonth(item.month)}</h2>
                  <small>Năm {item.year}</small>
                </div>
              </div>
              <div className="tev-result">
                <span>
                  <Star size={14} /> Xếp loại
                </span>
                <strong className="tev-classification">
                  {item.classification || "Chưa xếp loại"}
                </strong>
                <div className="tev-score">
                  <b>{Number(item.totalScore ?? 0).toLocaleString("vi-VN")}</b>
                  {item.maxScore != null && (
                    <span>
                      {" "}
                      / {Number(item.maxScore).toLocaleString("vi-VN")}
                    </span>
                  )}{" "}
                  <small>điểm</small>
                </div>
              </div>
              <div className="tev-comment">
                <div className="tev-comment-title">
                  <MessageSquareText size={15} /> Nhận xét Ban lãnh đạo
                </div>
                <p>{item.leadershipComment?.trim() || "Chưa có nhận xét."}</p>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
