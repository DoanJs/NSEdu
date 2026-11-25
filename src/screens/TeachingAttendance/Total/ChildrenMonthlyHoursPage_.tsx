import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useUserStore } from "../../../zustand";
import "./ChildrenMonthlyHoursPage.css";

type Child = { id: string; name: string; status: string };
type Assignment = {
  id: string;
  childId: string;
  teacherId: string;
  status: string;
  defaultHours: number;
};
type Attendance = {
  childId: string;
  teacherId: string;
  entries: Record<string, { hours?: number | null; attendanceType?: string }>;
};
type Substitute = {
  childId: string;
  status: string;
  date: string;
  recipients?: {
    teacherId: string;
    hours: number | null;
    attendanceType?: string;
  }[];
};
type Teacher = { id: string; name: string };
const fmt = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
const validHours = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

export default function ChildrenMonthlyHoursPage() {
  const { user } = useUserStore();
  const isAdmin = user?.role === "admin";
  const db = useMemo(() => getFirestore(), []);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [children, setChildren] = useState<Child[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitute[]>([]);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin || !user?.id) return;
    setLoaded({});
    setError("");
    const onError = (name: string) => (err: Error) =>
      setError(`Không tải được ${name}: ${err.message}`);
    const ready = (name: string) =>
      setLoaded((prev) => ({ ...prev, [name]: true }));
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const next =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const unsubs = [
      onSnapshot(
        collection(db, "children"),
        (snap) => {
          setChildren(
            snap.docs.map((d) => ({
              id: d.id,
              name: String(
                d.data().fullName ||
                  d.data().shortName ||
                  d.data().name ||
                  d.id,
              ),
              status: String(d.data().status || ""),
            })),
          );
          ready("children");
        },
        onError("trẻ"),
      ),
      onSnapshot(
        collection(db, "users"),
        (snap) => {
          setTeachers(
            snap.docs.map((d) => ({
              id: d.id,
              name: String(
                d.data().fullName ||
                  d.data().displayName ||
                  d.data().name ||
                  d.id,
              ),
            })),
          );
          ready("teachers");
        },
        onError("giáo viên"),
      ),
      onSnapshot(
        query(
          collection(db, "teachingAssignments"),
          where("status", "==", "active"),
        ),
        (snap) => {
          setAssignments(
            snap.docs.map((d) => ({
              id: d.id,
              childId: String(d.data().childId || ""),
              teacherId: String(d.data().teacherId || ""),
              status: String(d.data().status || ""),
              defaultHours: Number(d.data().defaultHours ?? 1),
            })),
          );
          ready("assignments");
        },
        onError("phân công"),
      ),
      onSnapshot(
        query(
          collection(db, "teachingAttendances"),
          where("year", "==", year),
          where("month", "==", month),
        ),
        (snap) => {
          setAttendances(
            snap.docs.map((d) => ({
              childId: String(d.data().childId || ""),
              teacherId: String(d.data().teacherId || ""),
              entries: d.data().entries || {},
            })),
          );
          ready("attendances");
        },
        onError("điểm danh"),
      ),
      onSnapshot(
        query(
          collection(db, "teachingSubstitutions"),
          where("date", ">=", first),
          where("date", "<", next),
        ),
        (snap) => {
          setSubstitutions(
            snap.docs.map((d) => ({
              childId: String(d.data().childId || ""),
              status: String(d.data().status || ""),
              date: String(d.data().date || ""),
              recipients: d.data().recipients || [],
            })),
          );
          ready("substitutions");
        },
        onError("dạy thay (kiểm tra Firestore Rules/Index)"),
      ),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [db, isAdmin, user?.id, month, year]);

  const workingDays = useMemo(
    () =>
      Array.from(
        { length: new Date(year, month, 0).getDate() },
        (_, i) => i + 1,
      ).filter((day) => new Date(year, month - 1, day).getDay() !== 0).length,
    [year, month],
  );
  const rows = useMemo(() => {
    const teacherNames = new Map(teachers.map((t) => [t.id, t.name]));
    const byChild = new Map<
      string,
      {
        id: string;
        name: string;
        teacherIds: Set<string>;
        required: number;
        actual: number;
        boarding: number;
      }
    >();
    for (const child of children) {
      if (child.status === "studying")
        byChild.set(child.id, {
          id: child.id,
          name: child.name,
          teacherIds: new Set(),
          required: 0,
          actual: 0,
          boarding: 0,
        });
    }
    const validAssignmentKeys = new Set<string>();
    for (const a of assignments) {
      const row = byChild.get(a.childId);
      if (!row) continue;
      const key = `${a.teacherId}_${a.childId}`;
      if (validAssignmentKeys.has(key)) continue;
      validAssignmentKeys.add(key);
      row.teacherIds.add(a.teacherId);
      row.required +=
        (Number.isFinite(a.defaultHours) && a.defaultHours > 0
          ? a.defaultHours
          : 1) * workingDays;
    }
    for (const a of attendances) {
      if (!validAssignmentKeys.has(`${a.teacherId}_${a.childId}`)) continue;
      const row = byChild.get(a.childId);
      if (!row) continue;
      for (const [date, entry] of Object.entries(a.entries || {})) {
        if (!date.startsWith(`${year}-${String(month).padStart(2, "0")}-`))
          continue;
        if (entry?.attendanceType === "boarding") row.boarding++;
        else row.actual += validHours(entry?.hours);
      }
    }
    // Giờ nhờ dạy thay không nằm trong giờ tự dạy của giáo viên gốc.
    // Cộng theo trẻ đúng một lần cho mỗi người nhận thay.
    for (const sub of substitutions) {
      if (sub.status !== "active") continue;
      const row = byChild.get(sub.childId);
      if (!row) continue;
      for (const recipient of sub.recipients || []) {
        if (recipient.attendanceType === "boarding") row.boarding++;
        else row.actual += validHours(recipient.hours);
      }
    }

    return Array.from(byChild.values())
      .filter(
        (r) =>
          r.teacherIds.size > 0 &&
          normalize(r.name).includes(normalize(search.trim())),
      )
      .map((r) => ({
        ...r,
        teacherLabel: Array.from(r.teacherIds)
          .map((id) => teacherNames.get(id) || id)
          .sort((a, b) => a.localeCompare(b, "vi"))
          .join(", "),
        difference: r.actual - r.required,
        percent: r.required > 0 ? (r.actual / r.required) * 100 : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [
    teachers,
    children,
    assignments,
    attendances,
    substitutions,
    workingDays,
    year,
    month,
    search,
  ]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, r) => ({
          required: sum.required + r.required,
          actual: sum.actual + r.actual,
          boarding: sum.boarding + r.boarding,
        }),
        { required: 0, actual: 0, boarding: 0 },
      ),
    [rows],
  );
  const isLoading = ![
    "children",
    "teachers",
    "assignments",
    "attendances",
    "substitutions",
  ].every((k) => loaded[k]);

  if (!user) return <main className="cmh-page">Vui lòng đăng nhập.</main>;
  if (!isAdmin)
    return (
      <main className="cmh-page">
        Bạn không có quyền xem tổng hợp giờ học của trẻ.
      </main>
    );
  return (
    <main className="cmh-page">
      <header className="cmh-header">
        <div>
          <Link to="/">← Trang chủ</Link>
          <h1>🌷 Tổng hợp giờ học của trẻ</h1>
          <p>
            Mỗi trẻ một dòng · Gộp giờ của tất cả giáo viên · BT thống kê riêng
          </p>
        </div>
      </header>
      <section className="cmh-filters">
        <label>
          Tháng{" "}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Năm{" "}
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) =>
              setYear(Number(e.target.value) || new Date().getFullYear())
            }
          />
        </label>
        <label>
          Tìm trẻ{" "}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nhập tên trẻ..."
          />
        </label>
        <span className="cmh-days">
          {workingDays} ngày yêu cầu (không tính CN)
        </span>
      </section>
      {error && (
        <p className="cmh-error" role="alert">
          {error}
        </p>
      )}
      <section className="cmh-summary">
        <div>
          <span>Số trẻ</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Đã học</span>
          <strong>{fmt(totals.actual)} giờ</strong>
        </div>
        <div>
          <span>Yêu cầu</span>
          <strong>{fmt(totals.required)} giờ</strong>
        </div>
        <div>
          <span>Bán trú</span>
          <strong>{totals.boarding} BT</strong>
        </div>
      </section>
      {isLoading ? (
        <p>Đang tải dữ liệu tổng hợp...</p>
      ) : (
        <div className="cmh-table-wrap">
          <table className="cmh-table">
            <thead>
              <tr>
                <th>Trẻ</th>
                <th>Giáo viên phụ trách</th>
                <th>Đã học</th>
                <th>Yêu cầu</th>
                <th>Chênh lệch</th>
                <th>Tiến độ</th>
                <th>Bán trú</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Trẻ">
                    <strong>{r.name}</strong>
                  </td>
                  <td data-label="Giáo viên">{r.teacherLabel}</td>
                  <td data-label="Đã học">
                    <strong>{fmt(r.actual)} giờ</strong>
                  </td>
                  <td data-label="Yêu cầu">{fmt(r.required)} giờ</td>
                  <td data-label="Chênh lệch">
                    <span
                      className={
                        r.difference < 0 ? "cmh-negative" : "cmh-positive"
                      }
                    >
                      {r.difference < 0
                        ? `Thiếu ${fmt(-r.difference)}`
                        : r.difference > 0
                          ? `Dư ${fmt(r.difference)}`
                          : "Đủ"}{" "}
                      giờ
                    </span>
                  </td>
                  <td data-label="Tiến độ">
                    <div className="cmh-progress">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, r.percent))}%`,
                        }}
                      />
                    </div>
                    <small>{fmt(r.percent)}%</small>
                  </td>
                  <td data-label="Bán trú">{r.boarding} BT</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="cmh-empty">Không có trẻ phù hợp.</p>
          )}
        </div>
      )}
      <p className="cmh-note">
        Giờ yêu cầu = tổng số giờ mặc định của các phân công đang hoạt động × số
        ngày trong tháng trừ Chủ nhật. Giờ đã học = điểm danh tự dạy + giờ nhờ
        dạy thay (không tính trùng). BT không quy đổi thành giờ. Trang chỉ đọc,
        không chỉnh sửa dữ liệu.
      </p>
    </main>
  );
}
