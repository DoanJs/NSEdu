import { User } from "firebase/auth";
import {
  collection,
  doc,
  Firestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { exportTeacherEvaluationWord } from "../exportTeacherEvaluationWord";
import "./TeacherEvaluation.css";
import { Link } from "react-router-dom";
import { icon512 } from "../../../constants/info";

type Role = "teacher" | "manager" | "admin";
type Status = "draft" | "submitted" | "returned" | "approved" | "unlocked";
type Criterion = {
  id: string;
  group: string;
  section: string;
  label: string;
  max: number;
};
type Score = { self?: number; manager?: number; deduction?: number };
const sections: {
  group: string;
  section: string;
  max: number;
  labels: string[];
}[] = [
  {
    group: "I",
    section: "Nội quy và chuyên cần",
    max: 2,
    labels: [
      "Đảm bảo thời gian làm việc đúng quy định (đến – về đúng giờ), chuyên cần",
      "Báo nghỉ đúng quy định (trước 2 ngày; phát sinh báo ngay)",
      "Kiểm tra trẻ đầu – cuối giờ",
      "Ứng xử phù hợp, tôn trọng và yêu thương học sinh (không đánh, mắng hoặc tái phạm lỗi)",
      "Ứng xử phù hợp, lắng nghe và tôn trọng đồng nghiệp và phụ huynh",
      "Quản lý học sinh tốt, đảm bảo an toàn",
      "Ứng xử phù hợp, tôn trọng đồng nghiệp và phụ huynh",
      "Chấp hành phân công của cấp trên: xác nhận tiếp nhận thông tin và thực hiện nhiệm vụ",
      "Đảm bảo quyền lợi, uy tín và xây dựng hình ảnh trung tâm",
      "Đồng phục theo quy định",
      "Không sử dụng điện thoại cá nhân trong giờ làm việc (trừ quay video và liên lạc khẩn cấp)",
      "Vệ sinh trung tâm: dọn rác các tầng, vứt rác cuối ngày và tổng vệ sinh thứ 7",
    ],
  },
  {
    group: "II",
    section: "1. Làm kế hoạch",
    max: 3.5,
    labels: [
      "Kế hoạch giáo dục cá nhân đúng tiến độ: thời gian, biểu mẫu, tên file lưu",
      "Mục tiêu đảm bảo tiêu chí SMART",
      "Mục tiêu sát mức độ hiện tại của trẻ (gần – cần)",
      "Chỉnh sửa theo góp ý và hướng dẫn",
      "Đổi mới, sáng tạo phù hợp với trẻ",
    ],
  },
  {
    group: "II",
    section: "2. Nhận xét, đánh giá kế hoạch",
    max: 3.5,
    labels: [
      "Đánh giá kế hoạch can thiệp cá nhân đúng tiến độ: thời gian, biểu mẫu, tên file lưu",
      "Đánh giá đúng mức độ học tập của trẻ: phản ứng, bối cảnh, mức độ gợi nhắc…",
      "Chỉnh sửa theo góp ý và hướng dẫn",
      "Ghi chép hồ sơ can thiệp cho học sinh theo tiến độ tuần",
      "Đánh giá lại học sinh (3–6 tháng)",
      "Sử dụng, sắp xếp, vệ sinh góc học và cơ sở vật chất, thiết bị, đồ dùng dạy học",
    ],
  },
  {
    group: "II",
    section: "3. Đánh giá tiết dạy",
    max: 3.5,
    labels: [
      "Đạt 50% mục tiêu tiết dạy",
      "Giao tiếp tích cực với học sinh (ngôn ngữ, cử chỉ, điệu bộ và hình ảnh)",
      "Phương pháp giảng dạy (kỹ thuật chuẩn)",
      "Quản lý hành vi học sinh",
      "Phát huy tính chủ động của trẻ",
      "Dạy học đúng kế hoạch tuần/tháng",
      "Dạy học sinh tiến bộ được ban giám đốc hoặc phụ huynh ghi nhận",
      "Sáng tạo, sáng kiến đóng góp về chuyên môn cho trung tâm",
      "Các hoạt động trong tiết dạy được sắp xếp theo trình tự từ dễ đến khó, có sự liên kết giữa các mục tiêu và phù hợp với khả năng tiếp thu của từng học sinh",
    ],
  },
  {
    group: "II",
    section: "4. Video và hình ảnh",
    max: 6,
    labels: [
      "Quay video hình ảnh đảm bảo theo tiến độ tuần dạy (15-20 video và 5-7 hình ảnh) kèm theo đánh giá, video quay phải thể hiện được: các hoạt động dạy, mức độ tiến bộ của học sinh, quá trình sửa sai (đặc biệt với học sinh tiểu học), đa dạng hoạt động theo giáo án, kế hoạch dạy.",
    ],
  },
];
export const CRITERIA: Criterion[] = sections.flatMap((s, si) =>
  s.labels.map((label, i) => ({
    id: `${si}-${i}`,
    group: s.group,
    section: s.section,
    label,
    max: s.max,
  })),
);
/** Điểm mặc định chỉ áp dụng khi tạo phiếu mới. */
const createDefaultScores = (): Record<string, Score> =>
  Object.fromEntries(
    CRITERIA.map((criterion) => [criterion.id, { self: criterion.max }]),
  );

export const MAX_SUM = CRITERIA.reduce((sum, c) => sum + c.max, 0);
export const grade = (n: number) =>
  n >= 85 ? "A" : n >= 70 ? "B" : n >= 55 ? "C" : "D";
const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("vi-VN");

type EvaluationRecord = {
  teacherId: string;
  teacherName: string;
  month: number;
  year: number;
  status: Status;
  scores: Record<string, Score>;
  comment: string;
  returnReason: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  submittedAt?: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  unlockedBy?: string;
  unlockedAt?: Timestamp;
  unlockReason?: string;
};
const evalId = (uid: string, year: number, month: number) =>
  `${uid}_${year}_${String(month).padStart(2, "0")}`;
const errText = (e: unknown) =>
  e instanceof Error ? e.message : "Có lỗi xảy ra. Vui lòng thử lại.";
/**
 * Route xác thực người dùng và ánh xạ admin/manager -> manager.
 * Guard này bảo vệ component cả khi Firebase Auth chuyển sang null lúc đăng xuất.
 * Quyền truy cập dữ liệu thực tế vẫn do Firestore Security Rules quyết định.
 */
type TeacherEvaluationProps = {
  db: Firestore;
  user: User | null;
  role?: Role;
};

export default function TeacherEvaluation({
  db,
  user,
  role = "teacher",
}: TeacherEvaluationProps) {
  if (!user) return null;
  return (
    <TeacherEvaluationContent key={user.uid} db={db} user={user} role={role} />
  );
}

function TeacherEvaluationContent({
  db,
  user,
  role,
}: {
  db: Firestore;
  user: User;
  role: Role;
}) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [records, setRecords] = useState<(EvaluationRecord & { id: string })[]>(
    [],
  );
  // Bộ lọc chỉ tác động đến danh sách, không thay đổi dữ liệu Firestore.
  const [searchText, setSearchText] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGrade, setFilterGrade] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [unlockReasonInput, setUnlockReasonInput] = useState("");
  const [status, setStatus] = useState<Status>("draft");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [scores, setScores] = useState<Record<string, Score>>(() =>
    createDefaultScores(),
  );
  // Giữ giá trị khởi tạo trong state; nội dung đang gõ được giữ trực tiếp trong textarea
  // để tránh render lại toàn bộ bảng tiêu chí sau mỗi ký tự.
  const [comment, setComment] = useState("");
  const commentRef = useRef<HTMLTextAreaElement | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const returnReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const [message, setMessage] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>(
    {},
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState(user.uid);
  const [teacherName, setTeacherName] = useState(
    user.displayName || "Giáo viên",
  );
  const toggleGroup = (index: number) =>
    setExpandedGroups((prev) => ({ ...prev, [index]: !prev[index] }));
  useEffect(() => {
    setLoading(true);
    const q =
      role !== "teacher"
        ? query(collection(db, "teacherEvaluations"))
        : query(
            collection(db, "teacherEvaluations"),
            where("teacherId", "==", user.uid),
          );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ ...(d.data() as EvaluationRecord), id: d.id }))
          .sort((a, b) => b.year - a.year || b.month - a.month);
        setRecords(rows);
        setLoading(false);
        if (activeId) {
          const current = rows.find((r) => r.id === activeId);
          if (current && current.status !== status) setStatus(current.status);
        }
      },
      (e) => {
        setMessage(errText(e));
        setLoading(false);
      },
    );
  }, [db, user.uid, role, activeId]);
  const openRecord = (r: EvaluationRecord & { id: string }) => {
    setActiveId(r.id);
    setTeacherId(r.teacherId);
    setTeacherName(r.teacherName);
    setYear(r.year);
    setMonth(r.month);
    setScores(r.scores || {});
    setComment(r.comment || "");
    setReturnReason(r.returnReason || "");
    setStatus(r.status);
    setExpandedGroups({});
    setView("detail");
    setMessage("");
  };
  const newRecord = () => {
    const id = evalId(user.uid, year, month);
    const existing = records.find((r) => r.id === id);
    if (existing) {
      openRecord(existing);
      return;
    }
    setActiveId(null);
    setTeacherId(user.uid);
    setTeacherName(user.displayName || "Giáo viên");
    setStatus("draft");
    setScores(createDefaultScores());
    setComment("");
    setReturnReason("");
    setExpandedGroups({});
    setView("detail");
    setMessage("");
  };
  const selfEditable =
    role === "teacher" &&
    (status === "draft" || status === "returned" || status === "submitted");
  const managerEditable = role !== "teacher" && status === "submitted";
  const totals = useMemo(
    () =>
      CRITERIA.reduce(
        (a, c) => {
          const s = scores[c.id] || {};
          a.self += s.self ?? 0;
          if (s.manager !== undefined) {
            a.manager += s.manager;
            a.deduction += (s.self ?? 0) - s.manager;
            a.reviewed++;
          }
          if (s.self !== undefined) {
            a.filled++;
            if (s.manager !== undefined) {
              a.final += c.max - (s.self - s.manager);
            }
          }
          return a;
        },
        { self: 0, manager: 0, deduction: 0, final: 0, filled: 0, reviewed: 0 },
      ),
    [scores],
  );
  const update = (id: string, field: keyof Score, raw: string, max: number) => {
    setScores((old) => {
      const next = { ...old, [id]: { ...old[id] } };
      if (raw === "") {
        delete next[id][field];
      } else {
        const v = Number(raw);
        if (!Number.isFinite(v)) return old;
        next[id][field] = Math.min(max, Math.max(0, v));
      }
      return next;
    });
  };
  const persist = async (action: "submit" | "save" | "approve" | "return") => {
    if (busy) return;

    // Đọc nội dung mới nhất trực tiếp từ textarea khi lưu/duyệt/trả phiếu.
    const currentComment = commentRef.current?.value ?? comment;
    const currentReturnReason = returnReasonRef.current?.value ?? returnReason;
    if (
      (action === "submit" || action === "save") &&
      totals.filled !== CRITERIA.length
    ) {
      setMessage(`Còn ${CRITERIA.length - totals.filled} tiêu chí chưa chấm.`);
      return;
    }
    if (
      action === "approve" &&
      (totals.reviewed !== CRITERIA.length || !currentComment.trim())
    ) {
      setMessage("Quản lý cần chấm đủ tiêu chí và nhập nhận xét.");
      return;
    }
    if (action === "return" && !currentReturnReason.trim()) {
      setMessage("Vui lòng ghi lý do trả phiếu.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const id = activeId || evalId(user.uid, year, month),
        ref = doc(db, "teacherEvaluations", id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref),
          old = snap.exists() ? (snap.data() as EvaluationRecord) : null;
        if (action === "submit" || action === "save") {
          if (role !== "teacher" || teacherId !== user.uid)
            throw Error("Không có quyền sửa phiếu này.");
          if (
            old &&
            (old.teacherId !== user.uid ||
              !["submitted", "returned", "draft"].includes(old.status))
          )
            throw Error("Phiếu đã duyệt hoặc không còn được phép sửa.");
          if (!old && action === "save") throw Error("Phiếu chưa được tạo.");
          if (
            !old &&
            records.some(
              (r) =>
                r.teacherId === user.uid &&
                r.year === year &&
                r.month === month,
            )
          )
            throw Error("Tháng này đã có phiếu.");
          const cleaned = Object.fromEntries(
            CRITERIA.map((c) => [
              c.id,
              {
                self: scores[c.id]?.self,
                ...(old?.scores?.[c.id]?.manager !== undefined
                  ? { manager: old.scores[c.id].manager }
                  : {}),
              },
            ]),
          );
          const next: Record<string, unknown> = {
            teacherId: user.uid,
            teacherName: user.displayName || "Giáo viên",
            year,
            month,
            scores: cleaned,
            status: "submitted",
            updatedAt: serverTimestamp(),
            submittedAt: serverTimestamp(),
            comment: old?.comment || "",
            returnReason: old?.returnReason || "",
          };
          if (!old) next.createdAt = serverTimestamp();
          tx.set(ref, next, { merge: true });
        } else {
          if (role === "teacher" || !old || old.status !== "submitted")
            throw Error("Phiếu không còn ở trạng thái chờ duyệt.");
          if (action === "approve") {
            if (CRITERIA.some((c) => scores[c.id]?.manager === undefined))
              throw Error("Chưa chấm đủ tiêu chí.");
            const reviewed = Object.fromEntries(
              CRITERIA.map((c) => [
                c.id,
                {
                  self: old.scores?.[c.id]?.self,
                  manager: scores[c.id]?.manager,
                },
              ]),
            );
            tx.update(ref, {
              scores: reviewed,
              comment: currentComment.trim(),
              status: "approved",
              approvedBy: user.uid,
              approvedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else
            tx.update(ref, {
              status: "returned",
              returnReason: currentReturnReason.trim(),
              comment: currentComment.trim(),
              updatedAt: serverTimestamp(),
            });
        }
      });
      setView("list");
      setActiveId(null);
      setMessage(
        action === "approve"
          ? "Đã duyệt phiếu."
          : action === "return"
            ? "Đã trả phiếu."
            : action === "save"
              ? "Đã lưu chỉnh sửa, phiếu tiếp tục chờ duyệt."
              : "Đã gửi phiếu chờ duyệt thành công.",
      );
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const removeEvaluation = async () => {
    if (!deleteTarget || busy || role !== "teacher") return;
    setBusy(true);
    setMessage("");
    try {
      const ref = doc(db, "teacherEvaluations", deleteTarget);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw Error("Phiếu không còn tồn tại.");
        const data = snap.data() as EvaluationRecord;
        if (
          data.teacherId !== user.uid ||
          !["submitted", "unlocked"].includes(data.status)
        )
          throw Error(
            "Chỉ được xóa phiếu chờ duyệt hoặc đã được Admin mở khóa.",
          );
        tx.delete(ref);
      });
      if (activeId === deleteTarget) {
        setView("list");
        setActiveId(null);
      }
      setDeleteTarget(null);
      setMessage("Đã xóa phiếu đánh giá thành công.");
    } catch (e) {
      setMessage(errText(e));
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };
  const unlockEvaluation = async () => {
    if (!unlockTarget || role !== "admin" || busy) return;
    const reason = unlockReasonInput.trim();
    if (!reason) {
      setMessage("Vui lòng nhập lý do mở khóa phiếu.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const evaluationRef = doc(db, "teacherEvaluations", unlockTarget);
      const archiveRef = doc(
        collection(db, "teacherEvaluationHistory", unlockTarget, "versions"),
      );
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(evaluationRef);
        if (!snap.exists() || snap.data().status !== "approved") {
          throw Error("Phiếu không còn ở trạng thái đã duyệt.");
        }
        const original = snap.data() as EvaluationRecord;
        // Lưu bản sao phiếu đã duyệt trước khi mở khóa.
        tx.set(archiveRef, {
          ...original,
          evaluationId: unlockTarget,
          archiveType: "admin_unlock",
          archivedBy: user.uid,
          archivedAt: serverTimestamp(),
          reason,
        });
        tx.update(evaluationRef, {
          status: "unlocked",
          unlockedBy: user.uid,
          unlockedAt: serverTimestamp(),
          unlockReason: reason,
          updatedAt: serverTimestamp(),
        });
      });
      setUnlockTarget(null);
      setUnlockReasonInput("");
      setStatus("unlocked");
      setMessage(
        "Đã mở khóa và lưu bản sao phiếu. Giáo viên có thể xóa để tạo lại.",
      );
    } catch (e) {
      setMessage(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmUnlock = unlockTarget && (
    <div className="ev-modal-overlay" role="presentation">
      <div
        className="ev-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ev-unlock-title"
        aria-describedby="ev-unlock-desc"
      >
        <h2 id="ev-unlock-title">Mở khóa phiếu đã duyệt?</h2>
        <p id="ev-unlock-desc">
          Hệ thống lưu bản sao phiếu đã duyệt vào lịch sử. Sau khi mở khóa, giáo
          viên có thể xóa phiếu hiện tại và tạo lại phiếu cùng tháng.
        </p>
        <label htmlFor="ev-unlock-reason">Lý do mở khóa (bắt buộc)</label>
        <textarea
          id="ev-unlock-reason"
          rows={3}
          value={unlockReasonInput}
          onChange={(e) => setUnlockReasonInput(e.target.value)}
          placeholder="Ví dụ: Sai thông tin đánh giá cần làm lại…"
        />
        <div className="ev-modal-actions">
          <button
            type="button"
            className="ev-unlock-cancel"
            disabled={busy}
            onClick={() => {
              setUnlockTarget(null);
              setUnlockReasonInput("");
            }}
          >
            Hủy
          </button>
          <button
            className="ev-unlock-confirm"
            type="button"
            disabled={busy || !unlockReasonInput.trim()}
            onClick={unlockEvaluation}
          >
            {busy ? "Đang mở khóa…" : "Xác nhận mở khóa"}
          </button>
        </div>
      </div>
    </div>
  );

  const confirmDelete = deleteTarget && (
    <div className="ev-modal-overlay" role="presentation">
      <div
        className="ev-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ev-delete-title"
        aria-describedby="ev-delete-desc"
      >
        <h2 id="ev-delete-title">Xóa phiếu đánh giá?</h2>
        <p id="ev-delete-desc">
          Phiếu sẽ bị xóa khỏi danh sách hiện tại. Nếu đây là phiếu đã mở khóa,
          bản sao được Admin lưu trước đó vẫn nằm trong lịch sử.
        </p>
        <div className="ev-modal-actions">
          <button
            type="button"
            className="ev-secondary"
            disabled={busy}
            onClick={() => setDeleteTarget(null)}
            style={{ borderRadius: "10px" }}
          >
            Hủy
          </button>
          <button
            type="button"
            className="ev-danger"
            disabled={busy}
            onClick={removeEvaluation}
          >
            {busy ? "Đang xóa…" : "Xác nhận xóa"}
          </button>
        </div>
      </div>
    </div>
  );
  const groups = sections.map((s, si) => ({
    ...s,
    items: CRITERIA.filter((c) => c.id.startsWith(`${si}-`)),
  }));
  const statusLabel = {
    draft: "Bản nháp",
    submitted: "Chờ quản lý duyệt",
    returned: "Yêu cầu chỉnh sửa",
    approved: "Đã duyệt",
    unlocked: "Đã mở khóa · Có thể tạo lại",
  }[status];
  // Điểm chính thức: dùng đúng công thức hiện tại của màn hình chi tiết.
  // Chỉ phiếu đã duyệt và được chấm đủ mới có xếp loại chính thức.
  const getApprovedResult = (r: EvaluationRecord) => {
    if (r.status !== "approved") return null;
    if (CRITERIA.some((c) =>
      r.scores?.[c.id]?.self === undefined ||
      r.scores?.[c.id]?.manager === undefined
    )) return null;
    const points = CRITERIA.reduce((sum, c) => {
      const score = r.scores[c.id];
      return sum + c.max - ((score.self ?? 0) - (score.manager ?? 0));
    }, 0);
    return { points, letter: grade(points) };
  };
  const availableYears = useMemo(
  () =>
    Array.from(new Set(records.map((r) => r.year))).sort(
      (a, b) => b - a,
    ),
  [records],
);
  const filteredRecords = useMemo(() => {
    const term = searchText.trim().toLocaleLowerCase("vi-VN");
    return records.filter((r) => {
      if (term && !`${r.teacherName} ${r.month}/${r.year}`
        .toLocaleLowerCase("vi-VN").includes(term)) return false;
      if (filterMonth !== "all" && r.month !== Number(filterMonth)) return false;
      if (filterYear !== "all" && r.year !== Number(filterYear)) return false;
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterGrade !== "all" && getApprovedResult(r)?.letter !== filterGrade)
        return false;
      return true;
    });
  }, [records, searchText, filterMonth, filterYear, filterStatus, filterGrade]);
  const summary = useMemo(() => {
    const approved = filteredRecords.map(getApprovedResult).filter(
      (result): result is { points: number; letter: string } => result !== null,
    );
    return {
      total: filteredRecords.length,
      approved: filteredRecords.filter((r) => r.status === "approved").length,
      pending: filteredRecords.filter((r) => r.status === "submitted").length,
      returned: filteredRecords.filter((r) => r.status === "returned").length,
      counts: Object.fromEntries(
        ["A", "B", "C", "D"].map((letter) => [
          letter, approved.filter((result) => result.letter === letter).length,
        ]),
      ) as Record<string, number>,
      classified: approved.length,
      average: approved.length
        ? approved.reduce((sum, result) => sum + result.points, 0) / approved.length
        : null,
    };
  }, [filteredRecords]);
  const clearFilters = () => {
    setSearchText("");
    setFilterMonth("all");
    setFilterYear("all");
    setFilterStatus("all");
    setFilterGrade("all");
  };
  if (view === "list")
    return (
      <main className="ev-page">
        <header className="ev-header">
          <div>
            <p className="ev-eyebrow">
              <Link to={'/'}>
            <img
              style={{
                height: "80px",
                objectFit: "cover",
                padding: "10px",
                borderRadius: "100px",
              }}
              src={icon512}
              alt="HBMEdu"
            />
          </Link>
          QUẢN LÝ NHÂN SỰ · ĐÁNH GIÁ THÁNG</p>
            <h1>Danh sách phiếu đánh giá</h1>
            <p>Quản lý các phiếu đã gửi và tình trạng phê duyệt</p>
          </div>
        </header>
        {role === "teacher" && (
          <section className="ev-panel ev-toolbar">
            <label>
              Tháng
              <select value={month} onChange={(e) => setMonth(+e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    Tháng {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Năm
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(+e.target.value)}
              />
            </label>
            <button className="ev-primary" onClick={newRecord}>
              + Tạo / mở phiếu tháng này
            </button>
          </section>
        )}
        <section className="ev-panel ev-filter-panel" aria-label="Tìm kiếm và lọc phiếu">
          <div className="ev-filter-heading">
            <h2>Tìm kiếm và bộ lọc</h2>
            <button type="button" className="ev-filter-reset" onClick={clearFilters}>
              Xóa bộ lọc
            </button>
          </div>
          <div className="ev-filter-grid">
            <label className="ev-filter-search">
              Tìm giáo viên / tháng năm
              <input type="search" value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tên giáo viên, 10/2026..." />
            </label>
            <label>Tháng
              <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                <option value="all">Tất cả tháng</option>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>Tháng {i + 1}</option>)}
              </select>
            </label>
            <label>Năm
              <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                <option value="all">Tất cả năm</option>
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>Trạng thái
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">Tất cả trạng thái</option>
                <option value="draft">Bản nháp</option>
                <option value="submitted">Chờ duyệt</option>
                <option value="returned">Yêu cầu chỉnh sửa</option>
                <option value="approved">Đã duyệt</option>
                <option value="unlocked">Đã mở khóa</option>
              </select>
            </label>
            <label>Xếp loại chính thức
              <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
                <option value="all">Tất cả xếp loại</option>
                {(["A", "B", "C", "D"] as const).map((g) =>
                  <option key={g} value={g}>Loại {g}</option>)}
              </select>
            </label>
          </div>
        </section>
        <section className="ev-summary" aria-label="Thống kê phiếu đánh giá">
          <div className="ev-summary-cards">
            <article><span>Tổng phiếu</span><strong>{summary.total}</strong></article>
            <article><span>Đã duyệt</span><strong>{summary.approved}</strong></article>
            <article><span>Chờ duyệt</span><strong>{summary.pending}</strong></article>
            <article><span>Cần chỉnh sửa</span><strong>{summary.returned}</strong></article>
            <article><span>Điểm TB đã duyệt</span><strong>{summary.average === null ? "—" : fmt(summary.average)}</strong></article>
          </div>
          <div className="ev-panel ev-grade-panel">
            <div className="ev-grade-heading">
              <h2>Thống kê xếp loại A/B/C/D</h2>
              <span>{summary.classified} phiếu đã duyệt và chấm đủ</span>
            </div>
            <div className="ev-grade-grid">
              {(["A", "B", "C", "D"] as const).map((g) => (
                <div key={g} className={`ev-grade-item ev-grade-${g.toLowerCase()}`}>
                  <span>Loại {g}</span>
                  <strong>{summary.counts[g]}</strong>
                  <small>{summary.classified
                    ? fmt(summary.counts[g] / summary.classified * 100) + "%"
                    : "0%"}</small>
                </div>
              ))}
            </div>
            <p className="ev-grade-note">Chỉ tính xếp loại chính thức của phiếu đã duyệt;
              số liệu thay đổi theo bộ lọc đang chọn. Một giáo viên có thể có nhiều phiếu theo tháng.</p>
          </div>
        </section>
        <section className="ev-panel ev-list">
          {loading ? (
            <p>Đang tải phiếu đánh giá…</p>
          ) : records.length === 0 ? (
            <p>Chưa có phiếu đánh giá nào.</p>
          ) : filteredRecords.length === 0 ? (
            <p>Không tìm thấy phiếu phù hợp với bộ lọc.</p>
          ) : (
            filteredRecords.map((r) => (
              <div key={r.id} className="ev-list-entry">
                <button
                  type="button"
                  className="ev-list-row"
                  onClick={() => openRecord(r)}
                >
                  <span>
                    <strong>
                      Phiếu tháng {r.month}/{r.year}
                    </strong>
                    {role !== "teacher" && <small>{r.teacherName}</small>}
                    {getApprovedResult(r) && (
                      <small className="ev-list-result">
                        Điểm cuối: {fmt(getApprovedResult(r)!.points)} · Loại {getApprovedResult(r)!.letter}
                      </small>
                    )}
                  </span>
                  <span className={`ev-pill ${r.status}`}>
                    {
                      {
                        draft: "Bản nháp",
                        submitted: "Chờ duyệt",
                        returned: "Yêu cầu chỉnh sửa",
                        approved: "Đã duyệt",
                        unlocked: "Đã mở khóa",
                      }[r.status]
                    }
                  </span>
                  <span className="ev-list-action">
                    {["submitted", "unlocked"].includes(r.status) &&
                    role === "teacher"
                      ? r.status === "unlocked"
                        ? "Xóa để tạo lại"
                        : "Chỉnh sửa"
                      : "Xem phiếu"}{" "}
                    ›
                  </span>
                </button>
                {role === "teacher" &&
                  ["submitted", "unlocked"].includes(r.status) && (
                    <button
                      type="button"
                      className="ev-delete-list"
                      disabled={busy}
                      onClick={() => setDeleteTarget(r.id)}
                    >
                      Xóa
                    </button>
                  )}
                  <div style={{display: 'flex', gap: '14px'}}>
                {role === "admin" && r.status === "approved" && (
                  <button
                  title="Mở khoá phiếu"
                    type="button"
                    className="ev-unlock-btn"
                    disabled={busy}
                    onClick={() => setUnlockTarget(r.id)}
                  >
                    <i className="bi bi-lock-fill"></i>
                    {/* Mở khóa phiếu */}
                  </button>
                )}
                {r.status === "approved" && (
                  <button
                    type="button"
                    className="ev-unlock-btn"
                    disabled={busy}
                    onClick={() =>
                      exportTeacherEvaluationWord(
                        {
                          teacherName: r.teacherName,
                          month: r.month,
                          year: r.year,
                          scores: r.scores,
                          comment: r.comment,
                        },
                        CRITERIA,
                      )
                    }
                  >
                    <i className="bi bi-download"></i>
                  </button>
                )}
                </div>
              </div>
            ))
          )}
        </section>
        {message && (
          <div
            role="status"
            className="ev-toast"
            onClick={() => setMessage("")}
          >
            {message} ×
          </div>
        )}
        {confirmDelete}
        {confirmUnlock}
      </main>
    );
  return (
    <main className="ev-page">
      <header className="ev-header">
        <div>
          <button
            className="ev-back"
            onClick={() => {
              setView("list");
              setActiveId(null);
            }}
          >
            ← Danh sách phiếu
          </button>
          <p className="ev-eyebrow">QUẢN LÝ NHÂN SỰ · ĐÁNH GIÁ THÁNG</p>
          <h1>Phiếu đánh giá giáo viên</h1>
          <p>Tự đánh giá, quản lý chấm lại và phê duyệt kết quả</p>
        </div>
        <span className={`ev-pill ${status}`}>{statusLabel}</span>
      </header>
      <section className="ev-panel ev-toolbar">
        <label>
          Tháng
          <select
            value={month}
            onChange={(e) => setMonth(+e.target.value)}
            disabled={!!activeId}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                Tháng {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Năm
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(+e.target.value)}
            disabled={!!activeId}
          />
        </label>
      </section>
      <div className="ev-stats">
        <article>
          <span>GV tự chấm</span>
          <strong>
            {fmt(totals.self)}
            <small> / {fmt(MAX_SUM)}</small>
          </strong>
          <b>Loại {grade(totals.self)}</b>
        </article>
        <article>
          <span>QL chấm</span>
          <strong>
            {fmt(totals.manager)}
            <small> / {fmt(MAX_SUM)}</small>
          </strong>
          <b>
            {totals.reviewed}/{CRITERIA.length} tiêu chí
          </b>
        </article>
        <article>
          <span>Điểm trừ</span>
          <strong>{fmt(totals.deduction)}</strong>
          <b>Tự động: GV chấm − QL chấm</b>
        </article>
        <article className="ev-final">
          <span>Điểm đạt cuối cùng</span>
          <strong>
            {fmt(totals.final)}
            <small> / {fmt(MAX_SUM)}</small>
          </strong>
          <b>Loại {grade(totals.final)}</b>
        </article>
      </div>
      <div className="ev-note">
        Tổng điểm tối đa theo các tiêu chí hiện tại là <b>{fmt(MAX_SUM)}</b>.
        Điểm đạt từng tiêu chí = Điểm tối đa − Điểm trừ. Điểm trừ = GV chấm − QL
        chấm. Thang xếp loại: A : 85-100 điểm ; B : 70-84 điểm ; C: 55-69 điểm;
        D: {`<`}55 điểm.
      </div>
      {status === "returned" && (
        <div className="ev-return">
          Lý do quản lý yêu cầu sửa: {returnReason}
        </div>
      )}
      {groups.map((g, idx) => (
        <section className="ev-panel ev-group" key={idx}>
          <button
            type="button"
            className="ev-grouphead ev-group-toggle"
            aria-expanded={!!expandedGroups[idx]}
            aria-controls={`ev-group-content-${idx}`}
            onClick={() => toggleGroup(idx)}
          >
            <div>
              <span>
                {g.group} · {g.section}
              </span>
              <small>{g.items.length} tiêu chí</small>
            </div>
            <div className="ev-grouphead-right">
              <strong>
                Tối đa {fmt(g.items.reduce((a, c) => a + c.max, 0))} điểm
              </strong>
              <span
                className={`ev-chevron ${expandedGroups[idx] ? "is-open" : ""}`}
                aria-hidden="true"
              >
                ⌄
              </span>
            </div>
          </button>
          {expandedGroups[idx] && (
            <div id={`ev-group-content-${idx}`} className="ev-group-content">
              <div className="ev-desktop">
                <table>
                  <thead>
                    <tr>
                      <th>Nội dung đánh giá</th>
                      <th>Tối đa</th>
                      <th>GV</th>
                      <th>QL</th>
                      <th>Điểm trừ</th>
                      <th>Điểm đạt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((c, i) => {
                      const s = scores[c.id] || {};
                      return (
                        <tr key={c.id}>
                          <td>
                            <span className="ev-index">{i + 1}.</span> {c.label}
                          </td>
                          <td className="ev-number">{fmt(c.max)}</td>
                          <td>
                            <ScoreInput
                              value={s.self}
                              max={c.max}
                              disabled={!selfEditable}
                              onChange={(v) => update(c.id, "self", v, c.max)}
                            />
                          </td>
                          <td>
                            <ScoreInput
                              value={s.manager}
                              max={c.max}
                              disabled={!managerEditable}
                              onChange={(v) =>
                                update(c.id, "manager", v, c.max)
                              }
                            />
                          </td>
                          <td>
                            <strong>
                              {s.self === undefined || s.manager === undefined
                                ? "—"
                                : fmt(s.self - s.manager)}
                            </strong>
                          </td>
                          <td className="ev-achieved">
                            {s.self === undefined || s.manager === undefined
                              ? "—"
                              : fmt(c.max - (s.self - s.manager))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ev-mobile">
                {g.items.map((c, i) => {
                  const s = scores[c.id] || {};
                  return (
                    <article className="ev-criterion" key={c.id}>
                      <div className="ev-criterion-title">
                        <b>
                          {i + 1}. {c.label}
                        </b>
                        <span>Tối đa {fmt(c.max)}</span>
                      </div>
                      <div className="ev-input-grid">
                        <label>
                          GV tự chấm
                          <ScoreInput
                            value={s.self}
                            max={c.max}
                            disabled={!selfEditable}
                            onChange={(v) => update(c.id, "self", v, c.max)}
                          />
                        </label>
                        <label>
                          QL chấm
                          <ScoreInput
                            value={s.manager}
                            max={c.max}
                            disabled={!managerEditable}
                            onChange={(v) => update(c.id, "manager", v, c.max)}
                          />
                        </label>
                        <label>
                          Điểm trừ
                          <strong>
                            {s.self === undefined || s.manager === undefined
                              ? "—"
                              : fmt(s.self - s.manager)}
                          </strong>
                        </label>
                        <div className="ev-achieved-box">
                          Điểm đạt
                          <strong>
                            {s.self === undefined || s.manager === undefined
                              ? "—"
                              : fmt(c.max - (s.self - s.manager))}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ))}
      <section className="ev-panel ev-review">
        <h2>Đánh giá của Ban lãnh đạo</h2>
        <label>
          Nhận xét chung
          <textarea
            ref={commentRef}
            rows={4}
            defaultValue={comment}
            disabled={!managerEditable}
            placeholder="Nhập nhận xét về chuyên môn, tác phong, những điểm cần cải thiện…"
          />
        </label>
        <p>
          Xếp loại cuối cùng:{" "}
          <strong>
            {totals.reviewed === CRITERIA.length
              ? grade(totals.final)
              : "Chưa chấm đủ"}
          </strong>
        </p>
        {managerEditable && (
          <label>
            Lý do trả phiếu (nếu cần)
            <textarea
              ref={returnReasonRef}
              rows={2}
              defaultValue={returnReason}
              placeholder="Ghi rõ nội dung giáo viên cần bổ sung…"
            />
          </label>
        )}
      </section>
      <footer className="ev-actions">
        <div>
          <strong>
            Tổng GV: {fmt(totals.self)} · {grade(totals.self)}
          </strong>
          <span> | </span>
          <strong>
            Điểm đạt: {fmt(totals.final)} ·{" "}
            {totals.reviewed === CRITERIA.length
              ? grade(totals.final)
              : "Chờ chấm"}
          </strong>
        </div>
        <div className="ev-buttons">
          {selfEditable && (
            <>
              {status === "submitted" && (
                <button
                  className="ev-secondary"
                  disabled={busy}
                  onClick={() => persist("save")}
                >
                  Lưu chỉnh sửa
                </button>
              )}
              {status !== "submitted" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => persist("submit")}
                >
                  Gửi chờ duyệt
                </button>
              )}
            </>
          )}
          {managerEditable && (
            <>
              <button
                className="ev-secondary"
                disabled={busy}
                onClick={() => persist("return")}
              >
                Yêu cầu chỉnh sửa
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => persist("approve")}
              >
                Duyệt kết quả
              </button>
            </>
          )}
          {role === "teacher" &&
            ["submitted", "unlocked"].includes(status) &&
            activeId && (
              <button
                type="button"
                className="ev-danger"
                disabled={busy}
                onClick={() => setDeleteTarget(activeId)}
              >
                Xóa phiếu
              </button>
            )}
          {role === "admin" && status === "approved" && activeId && (
            <button
              type="button"
              className="ev-secondary"
              disabled={busy}
              onClick={() => setUnlockTarget(activeId)}
            >
              Mở khóa phiếu
            </button>
          )}
          {status === "unlocked" && (
            <span className="ev-locked">
              🔓 Đã mở khóa · Giáo viên có thể xóa phiếu
            </span>
          )}
          {status === "approved" && (
            <span className="ev-locked">✓ Phiếu đã khóa</span>
          )}
        </div>
      </footer>
      {message && (
        <div role="status" className="ev-toast" onClick={() => setMessage("")}>
          {message} ×
        </div>
      )}
      {confirmDelete}
      {confirmUnlock}
    </main>
  );
}
function ScoreInput({
  value,
  max,
  disabled,
  onChange,
}: {
  value?: number;
  max: number;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className="ev-score"
      aria-label="Nhập điểm"
      type="number"
      min="0"
      max={max}
      step="0.5"
      inputMode="decimal"
      value={value ?? ""}
      disabled={disabled}
      placeholder="—"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
