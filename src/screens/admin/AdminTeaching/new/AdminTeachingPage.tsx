import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useUserStore } from "../../../../zustand";
import "./AdminTeachingPage.css";
import "./AdminTeaching_Modal_Additions.css";
import { Link } from "react-router-dom";
import { icon512 } from "../../../../constants/info";

type Session = "day" | "night";
type AssignmentStatus = "active" | "inactive";
const DEFAULT_HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3] as const;
const formatHours = (hours: number) => String(hours).replace(".", ",") + " giờ";
type Teacher = { id: string; name: string };
type Child = { id: string; name: string; avatar: string; status: string };
type Assignment = {
  id: string;
  teacherId: string;
  childId: string;
  session: Session;
  defaultHours?: number;
  status: AssignmentStatus;
};

type DialogState =
  | { type: "add" }
  | { type: "edit"; assignment: Assignment }
  | null;

type ConfirmAction = { type: "stop" | "delete"; assignment: Assignment } | null;

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const displayName = (data: DocumentData, fallback: string) =>
  String(
    data.fullName ||
      data.displayName ||
      data.name ||
      data.shortName ||
      fallback,
  );

export default function AdminTeachingPage() {
  const { user } = useUserStore();
  const isAdmin = user?.role === "admin";
  const db = useMemo(() => getFirestore(), []);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [draftChildId, setDraftChildId] = useState("");
  const [draftSession, setDraftSession] = useState<Session>("day");
  const [draftDefaultHours, setDraftDefaultHours] = useState<number>(1);
  const [childSearch, setChildSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    const loadedSources = new Set<string>();
    const done = (source: string) => {
      loadedSources.add(source);
      if (loadedSources.size === 3) setLoading(false);
    };
    const fail = (scope: string, err: Error) => {
      console.error(`AdminTeaching ${scope}:`, err);
      setError(`Không tải được ${scope}: ${err.message}`);
      setLoading(false);
    };
    const unsubTeachers = onSnapshot(
      query(collection(db, "users"), 
      // where("role", "==", "teacher")
      where("role", "in", ["teacher", "admin"]),
    ),
      (snapshot) => {
        setTeachers(
          snapshot.docs
            .map((item) => ({
              id: item.id,
              name: displayName(item.data(), item.id),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "vi")),
        );
        done("teachers");
      },
      (err) => fail("danh sách giáo viên", err),
    );
    const unsubChildren = onSnapshot(
      collection(db, "children"),
      (snapshot) => {
        setChildren(
          snapshot.docs
            .map((item) => ({
              id: item.id,
              name: displayName(item.data(), item.id),
              avatar: String(item.data().avatar || ""),
              status: String(item.data().status || ""),
            }))
            .sort((a, b) => a.name.localeCompare(b.name, "vi")),
        );
        done("children");
      },
      (err) => fail("danh sách trẻ", err),
    );
    const unsubAssignments = onSnapshot(
      collection(db, "teachingAssignments"),
      (snapshot) => {
        setAssignments(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              teacherId: String(data.teacherId || ""),
              childId: String(data.childId || ""),
              session: data.session === "night" ? "night" : "day",
              defaultHours: DEFAULT_HOUR_OPTIONS.includes(
                Number(
                  data.defaultHours,
                ) as (typeof DEFAULT_HOUR_OPTIONS)[number],
              )
                ? Number(data.defaultHours)
                : undefined,
              status: data.status === "active" ? "active" : "inactive",
            };
          }),
        );
        done("assignments");
      },
      (err) => fail("phân công giảng dạy", err),
    );
    return () => {
      unsubTeachers();
      unsubChildren();
      unsubAssignments();
    };
  }, [db, isAdmin]);

  useEffect(() => {
    if (
      teachers.length &&
      !teachers.some((teacher) => teacher.id === teacherId)
    ) {
      setTeacherId(teachers[0].id);
    }
  }, [teachers, teacherId]);

  const childById = useMemo(
    () => new Map(children.map((child) => [child.id, child])),
    [children],
  );
  const teacherAssignments = useMemo(
    () => assignments.filter((a) => a.teacherId === teacherId),
    [assignments, teacherId],
  );
  const shownAssignments = useMemo(
    () =>
      teacherAssignments
        .filter((a) =>
          normalize(childById.get(a.childId)?.name || a.childId).includes(
            normalize(search.trim()),
          ),
        )
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "active" ? -1 : 1;
          return (childById.get(a.childId)?.name || "").localeCompare(
            childById.get(b.childId)?.name || "",
            "vi",
          );
        }),
    [teacherAssignments, childById, search],
  );
  const availableChildren = useMemo(() => {
    const assigned = new Set(teacherAssignments.map((a) => a.childId));
    return children.filter(
      (child) =>
        child.status === "studying" &&
        !assigned.has(child.id) &&
        normalize(child.name).includes(normalize(childSearch.trim())),
    );
  }, [children, teacherAssignments, childSearch]);
  const activeCount = teacherAssignments.filter(
    (a) => a.status === "active",
  ).length;
  const dayCount = teacherAssignments.filter(
    (a) => a.status === "active" && a.session === "day",
  ).length;
  const nightCount = teacherAssignments.filter(
    (a) => a.status === "active" && a.session === "night",
  ).length;

  const openAdd = () => {
    setDraftChildId("");
    setDraftSession("day");
    setDraftDefaultHours(1);
    setChildSearch("");
    setError("");
    setDialog({ type: "add" });
  };
  const openEdit = (assignment: Assignment) => {
    setDraftChildId(assignment.childId);
    setDraftSession(assignment.session);
    setDraftDefaultHours(assignment.defaultHours ?? 1);
    setError("");
    setDialog({ type: "edit", assignment });
  };

  const save = async () => {
    if (!isAdmin || !teacherId || busy || !dialog) return;
    if (dialog.type === "add" && !draftChildId) {
      setError("Vui lòng chọn trẻ cần phân công.");
      return;
    }
    if (
      !DEFAULT_HOUR_OPTIONS.includes(
        draftDefaultHours as (typeof DEFAULT_HOUR_OPTIONS)[number],
      )
    ) {
      setError("Số giờ mặc định không hợp lệ.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (dialog.type === "add") {
        const id = `${teacherId}_${draftChildId}`;
        // Không ghi đè document đã có, kể cả khi đang inactive.
        if (teacherAssignments.some((a) => a.childId === draftChildId)) {
          throw new Error(
            "Trẻ đã có phân công với giáo viên này. Hãy kích hoạt lại phân công cũ.",
          );
        }
        await setDoc(doc(db, "teachingAssignments", id), {
          id,
          teacherId,
          childId: draftChildId,
          session: draftSession,
          defaultHours: draftDefaultHours,
          status: "active",
          createAt: serverTimestamp(),
          updateAt: serverTimestamp(),
        });
        setNotice("Đã thêm trẻ vào danh sách giảng dạy.");
      } else {
        await updateDoc(doc(db, "teachingAssignments", dialog.assignment.id), {
          session: draftSession,
          defaultHours: draftDefaultHours,
          updateAt: serverTimestamp(),
        });
        setNotice("Đã cập nhật ca dạy và số giờ mặc định.");
      }
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu phân công.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (assignment: Assignment) => {
    if (!isAdmin || busy) return;
    const nextStatus: AssignmentStatus =
      assignment.status === "active" ? "inactive" : "active";
    if (nextStatus === "inactive") {
      setConfirmAction({ type: "stop", assignment });
      return;
    }
    await applyStatus(assignment, nextStatus);
  };

  const applyStatus = async (assignment: Assignment, nextStatus: AssignmentStatus) => {
    if (!isAdmin || busy) return;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "teachingAssignments", assignment.id), {
        status: nextStatus,
        updateAt: serverTimestamp(),
      });
      setNotice(
        nextStatus === "active"
          ? "Đã kích hoạt lại phân công."
          : "Đã ngừng phân công. Lịch sử điểm danh được giữ nguyên.",
      );
      setConfirmAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể cập nhật trạng thái.");
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  };

  // Chỉ xóa vĩnh viễn khi chưa tồn tại document điểm danh liên quan.
  const removeAssignment = (assignment: Assignment) => {
    if (!isAdmin || busy) return;
    setConfirmAction({ type: "delete", assignment });
  };

  const applyDelete = async (assignment: Assignment) => {
    if (!isAdmin || busy) return;
    const childName = childById.get(assignment.childId)?.name || assignment.childId;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const related = await getDocs(
        query(
          collection(db, "teachingAttendances"),
          where("teacherId", "==", assignment.teacherId),
          where("childId", "==", assignment.childId),
          limit(1),
        ),
      );
      if (!related.empty) {
        setError(
          `Không thể xóa phân công của ${childName} vì đã có dữ liệu điểm danh. ` +
            "Hãy dùng nút Ngừng dạy để giữ lịch sử.",
        );
        setConfirmAction(null);
        return;
      }
      await deleteDoc(doc(db, "teachingAssignments", assignment.id));
      setNotice(`Đã xóa phân công của ${childName}.`);
      setConfirmAction(null);
    } catch (err) {
      console.error("Lỗi xóa phân công:", err);
      setError(err instanceof Error ? err.message : "Không thể xóa phân công.");
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmPendingAction = async () => {
    if (!confirmAction || busy) return;
    const { type, assignment } = confirmAction;
    if (type === "stop") {
      await applyStatus(assignment, "inactive");
    } else {
      await applyDelete(assignment);
    }
  };

  if (!user)
    return (
      <main className="at-page">
        <p>Vui lòng đăng nhập.</p>
      </main>
    );
  if (!isAdmin)
    return (
      <main className="at-page">
        <p>Bạn không có quyền quản lý phân công giảng dạy.</p>
      </main>
    );

  return (
    <main className="at-page">
      <header className="at-header">
        <div>
          <span className="at-eyebrow">
            <Link
              to="/"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
              }}
            >
              <img
                style={{
                  height: "48px",
                  borderRadius: "100%",
                }}
                src={icon512}
                alt="Logo Hoa Ban Mai Edu"
              />
              <span className="hbm-ac-eyebrow">🌸 QUẢN LÝ GIẢNG DẠY</span>
            </Link>
          </span>
          <h1>Phân công trẻ cho giáo viên</h1>
          <p>Thêm, chỉnh sửa ca dạy và quản lý trẻ trực tiếp giảng dạy.</p>
        </div>
        <button
          className="at-primary"
          type="button"
          disabled={!teacherId || busy}
          onClick={openAdd}
        >
          ＋ Thêm trẻ
        </button>
      </header>

      {error && (
        <div className="at-alert" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="at-notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}

      <section className="at-filters">
        <label>
          Giáo viên trực tiếp dạy
          <select
            value={teacherId}
            onChange={(e) => {
              setTeacherId(e.target.value);
              setSearch("");
            }}
          >
            {teachers.length === 0 && (
              <option value="">Chưa có giáo viên</option>
            )}
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tìm trẻ đã phân công
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nhập tên trẻ..."
            type="search"
          />
        </label>
      </section>

      <section className="at-stats" aria-label="Thống kê phân công">
        <div>
          <span>Đang giảng dạy</span>
          <strong>{activeCount}</strong>
          <small>trẻ</small>
        </div>
        <div>
          <span>☀️ Trong giờ hành chính</span>
          <strong>{dayCount}</strong>
          <small>trẻ</small>
        </div>
        <div>
          <span>🌙 Ngoài giờ hành chính</span>
          <strong>{nightCount}</strong>
          <small>trẻ</small>
        </div>
      </section>

      <section className="at-panel">
        <div className="at-panel-heading">
          <h2>Danh sách trẻ được phân công</h2>
          <span>{shownAssignments.length} phân công</span>
        </div>
        {loading ? (
          <p className="at-empty">Đang tải dữ liệu...</p>
        ) : shownAssignments.length === 0 ? (
          <p className="at-empty">Chưa có phân công phù hợp.</p>
        ) : (
          <div className="at-table-wrap">
            <table className="at-table">
              <thead>
                <tr>
                  <th>Trẻ</th>
                  <th>Ca dạy</th>
                  <th>Giờ mặc định</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {shownAssignments.map((assignment) => {
                  const child = childById.get(assignment.childId);
                  return (
                    <tr key={assignment.id}>
                      <td data-label="Trẻ">
                        <div className="at-child">
                          {child?.avatar ? (
                            <img src={child.avatar} alt="" />
                          ) : (
                            <span className="at-avatar">🌼</span>
                          )}
                          <div>
                            <strong>{child?.name || assignment.childId}</strong>
                            <small>
                              {child?.status === "paused"
                                ? "Trẻ đang tạm dừng học"
                                : ""}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Ca dạy">
                        <span className={`at-session ${assignment.session}`}>
                          {assignment.session === "day"
                            ? "☀️ Ban ngày"
                            : "🌙 Buổi tối"}
                        </span>
                      </td>
                      <td data-label="Giờ mặc định">
                        <span className="at-hours">
                          {assignment.defaultHours == null
                            ? "Chưa thiết lập"
                            : formatHours(assignment.defaultHours)}
                        </span>
                      </td>
                      <td data-label="Trạng thái">
                        <span className={`at-status ${assignment.status}`}>
                          {assignment.status === "active"
                            ? "Đang dạy"
                            : "Đã ngừng"}
                        </span>
                      </td>
                      <td data-label="Thao tác">
                        <div className="at-actions">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openEdit(assignment)}
                          >
                            Chỉnh sửa
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={
                              assignment.status === "active"
                                ? "at-danger"
                                : "at-reactivate"
                            }
                            onClick={() => void changeStatus(assignment)}
                          >
                            {assignment.status === "active"
                              ? "Ngừng dạy"
                              : "Kích hoạt lại"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className="at-delete"
                            onClick={() => void removeAssignment(assignment)}
                          >
                            🗑 Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmAction && (
        <div
          className="at-overlay at-confirm-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setConfirmAction(null);
          }}
        >
          <section
            className="at-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="at-confirm-title"
            aria-describedby="at-confirm-description"
          >
            <div className={`at-confirm-icon ${confirmAction.type}`} aria-hidden="true">
              {confirmAction.type === "delete" ? "🗑️" : "⚠️"}
            </div>
            <h2 id="at-confirm-title">
              {confirmAction.type === "delete" ? "Xác nhận xóa phân công" : "Xác nhận ngừng dạy"}
            </h2>
            <p id="at-confirm-description">
              {confirmAction.type === "delete" ? "Bạn có chắc chắn muốn xóa vĩnh viễn phân công của" : "Bạn có chắc chắn muốn ngừng phân công của"}{" "}
              <strong>{childById.get(confirmAction.assignment.childId)?.name || confirmAction.assignment.childId}</strong>?
            </p>
            <div className="at-confirm-info">
              {confirmAction.type === "delete"
                ? "Nếu trẻ đã có dữ liệu điểm danh, hệ thống sẽ từ chối xóa."
                : "Dữ liệu điểm danh trước đây sẽ được giữ nguyên. Bạn có thể kích hoạt lại phân công sau này."}
            </div>
            <div className="at-confirm-actions">
              <button type="button" className="at-confirm-cancel" disabled={busy} onClick={() => setConfirmAction(null)}>
                Hủy
              </button>
              <button
                type="button"
                className={confirmAction.type === "delete" ? "at-confirm-delete" : "at-confirm-stop"}
                disabled={busy}
                onClick={() => void confirmPendingAction()}
              >
                {busy ? "Đang xử lý..." : confirmAction.type === "delete" ? "Xóa phân công" : "Ngừng dạy"}
              </button>
            </div>
          </section>
        </div>
      )}

      {dialog && (
        <div
          className="at-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setDialog(null);
          }}
        >
          <section
            className="at-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="at-dialog-title"
          >
            <h2 id="at-dialog-title">
              {dialog.type === "add"
                ? "🌷 Thêm trẻ trực tiếp dạy"
                : "🌷 Chỉnh sửa phân công"}
            </h2>
            {dialog.type === "add" ? (
              <>
                <label>
                  Tìm trẻ
                  <input
                    type="search"
                    value={childSearch}
                    onChange={(e) => setChildSearch(e.target.value)}
                    placeholder="Tìm theo tên trẻ..."
                  />
                </label>
                <label>
                  Chọn trẻ
                  <select
                    value={draftChildId}
                    onChange={(e) => setDraftChildId(e.target.value)}
                  >
                    <option value="">-- Chọn trẻ --</option>
                    {availableChildren.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                  </select>
                </label>
                {availableChildren.length === 0 && (
                  <small>
                    Không còn trẻ đang học chưa được phân công cho giáo viên
                    này.
                  </small>
                )}
              </>
            ) : (
              <p className="at-edit-name">
                {childById.get(dialog.assignment.childId)?.name ||
                  dialog.assignment.childId}
              </p>
            )}
            <label>
              Ca giảng dạy
              <select
                value={draftSession}
                onChange={(e) => setDraftSession(e.target.value as Session)}
              >
                <option value="day">☀️ Ban ngày (giờ hành chính)</option>
                <option value="night">
                  🌙 Buổi tối (ngoài giờ hành chính)
                </option>
              </select>
            </label>
            <label>
              Số giờ dạy mặc định (trẻ Bán trú thì chọn 1 giờ)
              <select
                value={draftDefaultHours}
                onChange={(e) => setDraftDefaultHours(Number(e.target.value))}
              >
                {DEFAULT_HOUR_OPTIONS.map((hours) => (
                  <option key={hours} value={hours}>
                    {formatHours(hours)}
                  </option>
                ))}
              </select>
            </label>
            {dialog.type === "edit" &&
              dialog.assignment.defaultHours == null && (
                <p className="at-help">
                  Phân công cũ chưa có số giờ mặc định. Hãy chọn lại mức giờ phù
                  hợp trước khi lưu.
                </p>
              )}
            <p className="at-help">
              Mỗi cặp giáo viên – trẻ có một phân công. Ngừng dạy sẽ giữ lại
              document để bảo toàn lịch sử.
            </p>
            <div className="at-dialog-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDialog(null)}
                style={{ background: "gray" }}
              >
                Hủy
              </button>
              <button
                className="at-primary"
                type="button"
                disabled={busy || (dialog.type === "add" && !draftChildId)}
                onClick={() => void save()}
              >
                {busy ? "Đang lưu..." : "Lưu phân công"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
