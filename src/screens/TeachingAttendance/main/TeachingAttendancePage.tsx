import {
  collection,
  deleteField,
  setDoc,
  doc,
  query as firestoreQuery,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { memo, useCallback, useEffect, useMemo, useState } from "react";

import LoadingOverlay from "../../../components/LoadingOverLay";

import {
  handleToastError,
  handleToastSuccess,
} from "../../../constants/handleToast";

import {
  teachleftbot,
  teachlefttop,
  teachrightbot,
  teachrighttop,
} from "../../../constants/info";

import { useFirestoreWithMetaCondition } from "../../../constants/useFirestoreWithMetaCondition";

import type { ChildrenModel } from "../../../models";

import { TeachingAssignmentModel } from "../../../models/TeachingAssignmentModel";

import {
  TeachingAttendanceEntry,
  TeachingAttendanceModel,
} from "../../../models/TeachingAttendanceModel";

import { useUserStore } from "../../../zustand";

// import AdminTeacherSelect from "../new/AdminTeacherSelect";
// import "../new/TeachingAttendancePage.css";
import AdminTeacherSelect from "./AdminTeacherSelect";
import "./TeachingAttendancePage.css";
import "./TeachingAttendanceSubstitutions.css";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";

type Mode = "day" | "night";
type TeacherOption = { id: string; name: string };
type SubstituteRecipient = { teacherId: string; hours: number };
type SubstituteRecord = {
  id: string;
  childId: string;
  childName?: string;
  childAvatar?: string;
  originalTeacherId: string;
  date: string;
  session: Mode;
  recipients: SubstituteRecipient[];
  participantIds: string[];
  status: "active";
};
type AttendanceTab = "main" | "received" | "sent";
const HOURS = [0.5, 1, 1.5, 2, 2.5, 3] as const;
const substituteId = (teacherId: string, childId: string, date: string) =>
  `${teacherId}_${childId}_${date}`;
const attendanceKey = (teacherId: string, childId: string) =>
  `${teacherId}_${childId}`;

type Choice = 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | "X" | "";

type Entry = TeachingAttendanceEntry;

type AttendanceMap = Record<string, Record<string, Entry | undefined>>;

type StudentView = {
  id: string;

  name: string;

  teacherId: string;

  session: Mode;

  defaultHours: number;

  avatar: string;

  teacherIds: string[];
};

type EditState = {
  teacherId: string;

  studentId: string;

  name: string;

  dateKey: string;

  day: number;

  value: Choice;
};

type Day = { day: number; week: number; key: string; weekend: boolean };

const getLastThreeNames = (fullName: string): string => {
  const words = fullName.trim().split(/\s+/);

  return words.slice(-3).join(" ");
};

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const CHOICES: Choice[] = [0.5, 1, 1.5, 2, 2.5, 3, "X", ""];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const normalize = (value: string) =>
  value

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/đ/g, "d")

    .replace(/Đ/g, "D")

    .toLowerCase();

const toChoice = (hours: number | null | undefined): Choice =>
  hours === null
    ? "X"
    : ([0.5, 1, 1.5, 2, 2.5, 3] as number[]).includes(hours as number)
      ? (hours as Choice)
      : "";

const bubbleClass = (value: number | null | undefined) =>
  `ta-bubble ${
    value === undefined ? "ta-empty" : value === null ? "ta-absent" : "ta-one"
  }`;

function useMonth(year: number, month: number) {
  return useMemo(() => {
    const count = new Date(year, month, 0).getDate();

    const dates: Day[] = [];

    let targetHours = 0;

    for (let day = 1; day <= count; day++) {
      const week = new Date(year, month - 1, day).getDay();

      const weekend = week === 0 || week === 6;

      dates.push({ day, week, weekend, key: dateKey(year, month, day) });

      if (!weekend) targetHours++;
    }

    return {
      dates,

      targetHours,

      leadingBlanks: ((dates[0]?.week ?? 1) + 6) % 7,
    };
  }, [year, month]);
}

function Avatar({ name, src }: { name: string; src: string }) {
  return (
    <span className="ta-avatar">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: "100%",

            height: "100%",

            objectFit: "cover",

            borderRadius: "50%",
          }}
        />
      ) : (
        <span aria-label={name}>👶</span>
      )}
    </span>
  );
}

const ModeButton = memo(function ModeButton({ mode }: { mode: Mode }) {
  return (
    <span
      className={`ta-mode-toggle ${mode === "night" ? "is-night" : "is-day"}`}
      title={mode === "day" ? "Giờ hành chính" : "Ngoài giờ hành chính"}
    >
      <span className="ta-mode-icon">{mode === "day" ? "☀️" : "🌙"}</span>
    </span>
  );
});

type RowProps = {
  student: StudentView;

  index: number;

  dates: Day[];

  entries: Record<string, Entry | undefined>;

  mode: Mode;

  targetHours: number;

  month: number;

  year: number;

  leadingBlanks: number;

  teacherLabel: string;
  relatedTeacherName?: string;
  relatedTeacherRole?: string;

  onEdit: (
    teacherId: string,

    studentId: string,

    name: string,

    date: Day,

    hours: number | null | undefined,
  ) => void;

  onToggle: (id: string) => void;
  readOnly?: boolean;
  substitutionDates?: Set<string>;
};

function useStudentStats(entries: RowProps["entries"], dates: Day[]) {
  return useMemo(
    () =>
      dates.reduce((acc, date) => {
        const hours = entries[date.key]?.hours;

        return acc + (typeof hours === "number" ? hours : 0);
      }, 0),

    [entries, dates],
  );
}

const DesktopRow = memo(function DesktopRow({
  student,

  index,

  dates,

  entries,

  mode,

  targetHours,

  teacherLabel,
  relatedTeacherName,
  relatedTeacherRole,

  onEdit,

  onToggle,
  readOnly = false,
  substitutionDates,
}: RowProps) {
  const total = useStudentStats(entries, dates);

  return (
    <tr>
      <td className="ta-student">
        <div className="ta-student-info">
          <Avatar name={student.name} src={student.avatar} />

          <div className="ta-student-name-row">
            <strong title={student.name}>
              {getLastThreeNames(student.name)}
            </strong>

            <ModeButton mode={mode} />
            {relatedTeacherName && (
              <small className="ta-related-teacher">
                {relatedTeacherRole}: {relatedTeacherName}
              </small>
            )}
          </div>
        </div>
      </td>

      {dates.map((d) => {
        const value = entries[d.key]?.hours;

        return (
          <td key={d.key} className={d.weekend ? "ta-weekend" : ""}>
            <button
              type="button"
              className={
                substitutionDates?.has(d.key)
                  ? "ta-bubble ta-sub-bubble"
                  : bubbleClass(value)
              }
              title={`${student.name}, ${d.day}: ${substitutionDates?.has(d.key) ? "Đã nhờ dạy thay" : value === null ? "Nghỉ" : (value ?? "Chưa nhập")}`}
              aria-label={`Điểm danh ${student.name} ngày ${d.day}`}
              disabled={readOnly}
              onClick={() =>
                onEdit(student.teacherId, student.id, student.name, d, value)
              }
            >
              {substitutionDates?.has(d.key)
                ? "THAY"
                : value === null
                  ? "×"
                  : (value ?? "")}
            </button>
          </td>
        );
      })}

      <td className="ta-total">
        {fmt(total)}
        {!readOnly && (
          <>
            /
            <span className="ta-missing">
              {fmt(student.defaultHours * targetHours)}
            </span>
          </>
        )}
      </td>

      {/* <td className="ta-missing">{fmt(targetHours - total)}</td> */}

      {/* <td className="ta-owner-cell">{teacherLabel}</td> */}
    </tr>
  );
});

const MobileCard = memo(function MobileCard({
  student,

  index,

  dates,

  entries,

  mode,

  targetHours,

  month,

  year,

  leadingBlanks,

  teacherLabel,
  relatedTeacherName,
  relatedTeacherRole,

  onEdit,

  onToggle,
  readOnly = false,
  substitutionDates,
}: RowProps) {
  const total = useStudentStats(entries, dates);

  const toggle = useCallback(
    () => onToggle(student.id),

    [onToggle, student.id],
  );

  return (
    <article className="ta-mobile-card">
      <div className="ta-mobile-student-head">
        <div className="ta-mobile-identity">
          <Avatar name={student.name} src={student.avatar} />

          <div className="ta-mobile-student-details">
            <span className="ta-mobile-index">
              HỌC SINH {String(index + 1).padStart(2, "0")}
            </span>

            <div className="ta-mobile-name-row">
              {/* <h2>{student.name}</h2> */}

              <h2 title={student.name}>{getLastThreeNames(student.name)}</h2>

              <ModeButton mode={mode} />
            </div>

            {relatedTeacherName ? (
              <small className="ta-related-teacher">
                {relatedTeacherRole}: {relatedTeacherName}
              </small>
            ) : (
              <small>{teacherLabel}</small>
            )}
          </div>
        </div>

        <span className="ta-mobile-progress">
          {fmt(total)}
          {readOnly ? "" : `/${fmt(student.defaultHours * targetHours)}`} giờ
        </span>
      </div>

      <div className="ta-mobile-metrics">
        <div>
          <span>Đã dạy</span>

          <strong>
            {fmt(total)} <small>giờ</small>
          </strong>
        </div>

        <div>
          <span>Yêu cầu</span>

          <strong className="ta-mobile-shortfall">
            {readOnly ? "—" : fmt(student.defaultHours * targetHours)}{" "}
            <small>giờ</small>
          </strong>
        </div>
      </div>

      <div className="ta-mobile-calendar-title">
        <strong>🌷 Lịch điểm danh</strong>

        <span>
          Tháng {String(month).padStart(2, "0")}/{year}
        </span>
      </div>

      <div className="ta-mobile-calendar">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((w, i) => (
          <div
            key={w}
            className={`ta-mobile-weekday ${i > 4 ? "ta-mobile-weekend" : ""}`}
          >
            {w}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div
            key={`blank-${i}`}
            className="ta-mobile-blank"
            aria-hidden="true"
          />
        ))}

        {dates.map((d) => {
          const value = entries[d.key]?.hours;

          return (
            <button
              key={d.key}
              type="button"
              className={`ta-mobile-day ${d.weekend ? "ta-mobile-weekend" : ""}`}
              disabled={readOnly}
              onClick={() =>
                onEdit(student.teacherId, student.id, student.name, d, value)
              }
              aria-label={`${student.name}, ngày ${d.day}/${month}: ${value === null ? "Nghỉ" : value === undefined ? "Chưa nhập" : `${value} giờ`}`}
            >
              <span className="ta-mobile-day-number">{d.day}</span>

              <span
                className={
                  substitutionDates?.has(d.key)
                    ? "ta-bubble ta-sub-bubble"
                    : bubbleClass(value)
                }
              >
                {substitutionDates?.has(d.key)
                  ? "THAY"
                  : value === null
                    ? "×"
                    : (value ?? "")}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
});

const AttendanceDialog = memo(function AttendanceDialog({
  editing,
  onClose,
  onSave,
  onSaveSubstitution,
  month,
  year,
  teachers,
  currentSubstitution,
  saving,
}: {
  editing: EditState;
  onClose: () => void;
  onSave: (value: Choice) => void;
  onSaveSubstitution: (recipients: SubstituteRecipient[]) => void;
  month: number;
  year: number;
  teachers: TeacherOption[];
  currentSubstitution?: SubstituteRecord;
  saving: boolean;
}) {
  const [tab, setTab] = useState<"attendance" | "substitute">(
    currentSubstitution ? "substitute" : "attendance",
  );
  const [draft, setDraft] = useState<Choice>(editing.value);
  const [recipients, setRecipients] = useState<SubstituteRecipient[]>(
    currentSubstitution?.recipients ?? [],
  );
  const [newTeacher, setNewTeacher] = useState("");
  const [newHours, setNewHours] = useState<number>(1);
  const availableTeachers = teachers.filter(
    (teacher) =>
      teacher.id !== editing.teacherId &&
      !recipients.some((recipient) => recipient.teacherId === teacher.id),
  );
  const totalTransferred = recipients.reduce(
    (sum, recipient) => sum + recipient.hours,
    0,
  );
  return (
    <div
      className="ta-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="ta-dialog ta-sub-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Điểm danh và dạy thay"
      >
        <h2>🌸 Điểm danh giờ dạy</h2>
        <p>
          {editing.name} · {editing.day}/{month}/{year}
        </p>
        <div
          className="ta-sub-tabs"
          role="tablist"
          aria-label="Hình thức điểm danh"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "attendance"}
            className={tab === "attendance" ? "active" : ""}
            onClick={() => setTab("attendance")}
          >
            ✏️ Tự dạy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "substitute"}
            className={tab === "substitute" ? "active" : ""}
            onClick={() => setTab("substitute")}
          >
            🔄 Nhờ dạy thay
          </button>
        </div>
        {tab === "attendance" ? (
          <>
            {currentSubstitution && (
              <p className="ta-sub-warning">
                Lưu điểm danh tự dạy sẽ hủy toàn bộ phân công dạy thay của ngày
                này.
              </p>
            )}
            <div className="ta-choices">
              {CHOICES.map((value) => (
                <button
                  key={String(value) || "empty"}
                  type="button"
                  className={draft === value ? "selected" : ""}
                  onClick={() => setDraft(value)}
                >
                  {value === "X"
                    ? "✕ Nghỉ"
                    : value === ""
                      ? "Trống"
                      : `${value} giờ`}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="ta-sub-form">
            <p className="ta-sub-help">
              Chọn một hoặc nhiều giáo viên. Mỗi cô có thể nhận số giờ khác
              nhau. Số giờ này không tính cho cô đang phụ trách.
            </p>
            {recipients.map((recipient) => (
              <div className="ta-sub-recipient" key={recipient.teacherId}>
                <strong>
                  {teachers.find(
                    (teacher) => teacher.id === recipient.teacherId,
                  )?.name ?? recipient.teacherId}
                </strong>
                <select
                  aria-label="Số giờ nhận dạy thay"
                  value={recipient.hours}
                  onChange={(e) =>
                    setRecipients((prev) =>
                      prev.map((item) =>
                        item.teacherId === recipient.teacherId
                          ? { ...item, hours: Number(e.target.value) }
                          : item,
                      ),
                    )
                  }
                >
                  {HOURS.map((hours) => (
                    <option key={hours} value={hours}>
                      {hours} giờ
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Bỏ giáo viên"
                  onClick={() =>
                    setRecipients((prev) =>
                      prev.filter(
                        (item) => item.teacherId !== recipient.teacherId,
                      ),
                    )
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="ta-sub-add">
              <select
                aria-label="Chọn giáo viên dạy thay"
                value={newTeacher}
                onChange={(e) => setNewTeacher(e.target.value)}
              >
                <option value="">Chọn giáo viên...</option>
                {availableTeachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Chọn giờ dạy thay"
                value={newHours}
                onChange={(e) => setNewHours(Number(e.target.value))}
              >
                {HOURS.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} giờ
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!newTeacher}
                onClick={() => {
                  if (!newTeacher) return;
                  setRecipients((prev) => [
                    ...prev,
                    { teacherId: newTeacher, hours: newHours },
                  ]);
                  setNewTeacher("");
                }}
              >
                + Thêm cô
              </button>
            </div>
            <p className="ta-sub-total">
              Tổng giờ chuyển: <strong>{fmt(totalTransferred)} giờ</strong>
            </p>
            {currentSubstitution && (
              <p className="ta-sub-help">
                Để hủy dạy thay, bỏ hết giáo viên rồi lưu.
              </p>
            )}
          </div>
        )}
        <div className="ta-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="ta-primary"
            disabled={
              saving ||
              (tab === "substitute" &&
                recipients.length === 0 &&
                !currentSubstitution)
            }
            onClick={() =>
              tab === "attendance"
                ? onSave(draft)
                : onSaveSubstitution(recipients)
            }
          >
            {saving
              ? "Đang lưu..."
              : tab === "attendance"
                ? "Lưu điểm danh"
                : "Lưu dạy thay"}
          </button>
        </div>
      </section>
    </div>
  );
});

const EMPTY_ENTRIES: Record<string, Entry | undefined> = {};

export default function TeachingAttendancePage() {
  const [isLoading, setIsLoading] = useState(false);

  const { user } = useUserStore();

  // Chỉnh theo cấu trúc phân quyền thực tế của ứng dụng.

  const isAdmin =
    (user as (typeof user & { role?: string }) | undefined)?.role === "admin";

  const [selectedTeacherId, setSelectedTeacherId] = useState("all");

  const [searchTerm, setSearchTerm] = useState("");

  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  const [year, setYear] = useState(() => new Date().getFullYear());

  // Ghi đè tạm thời sau khi Firestore xác nhận lưu thành công.
  // Key chứa cả tháng/năm để không làm sai dữ liệu khi chuyển kỳ.
  const [localAttendanceUpdates, setLocalAttendanceUpdates] = useState<
    Record<string, Entry | null>
  >({});

  const [editing, setEditing] = useState<EditState | null>(null);
  const [activeTab, setActiveTab] = useState<AttendanceTab>("main");
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [substitutions, setSubstitutions] = useState<SubstituteRecord[]>([]);
  const [substitutionsReady, setSubstitutionsReady] = useState(false);
  const db = useMemo(() => getFirestore(), []);
  // Khóa theo giáo viên + tháng; không thay đổi dữ liệu điểm danh hiện có.
  const [monthLocked, setMonthLocked] = useState(false);
  const [lockReady, setLockReady] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    return onSnapshot(
      firestoreQuery(collection(db, "users"), where("role", "==", "teacher")),
      (snapshot) => {
        setTeachers(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              name: data.fullName || data.displayName || data.name || item.id,
            };
          }),
        );
      },
      (error) => {
        console.error(error);
        handleToastError("Không tải được danh sách giáo viên.");
      },
    );
  }, [db, user?.id]);
  useEffect(() => {
    setSubstitutionsReady(false);
    if (!user?.id) return;
    const first = dateKey(year, month, 1);
    const next =
      month === 12 ? dateKey(year + 1, 1, 1) : dateKey(year, month + 1, 1);
    const constraints = [where("date", ">=", first), where("date", "<", next)];
    const q = isAdmin
      ? firestoreQuery(collection(db, "teachingSubstitutions"), ...constraints)
      : firestoreQuery(
          collection(db, "teachingSubstitutions"),
          where("participantIds", "array-contains", user.id),
          ...constraints,
        );
    return onSnapshot(
      q,
      (snapshot) => {
        setSubstitutionsReady(true);
        setSubstitutions(
          snapshot.docs
            .map(
              (item) => ({ ...item.data(), id: item.id }) as SubstituteRecord,
            )
            .filter((item) => item.status === "active"),
        );
      },
      (error) => {
        setSubstitutionsReady(false);
        console.error(error);
        handleToastError(
          "Không tải được dữ liệu dạy thay (kiểm tra Rules/Index).",
        );
      },
    );
  }, [db, user?.id, isAdmin, year, month]);

  const { dates, targetHours, leadingBlanks } = useMonth(year, month);

  const activeTeacherId = isAdmin ? selectedTeacherId : (user?.id ?? "");

  const lockTeacherId = isAdmin ? selectedTeacherId : (user?.id ?? "");
  const lockDocId = `${lockTeacherId}_${year}_${month}`;
  useEffect(() => {
    setLockReady(false);
    setMonthLocked(false);
    if (!user?.id || !lockTeacherId || lockTeacherId === "all") return;
    return onSnapshot(
      doc(db, "teachingAttendanceLocks", lockDocId),
      (snapshot) => {
        setMonthLocked(snapshot.exists() && snapshot.data().locked === true);
        setLockReady(true);
      },
      (error) => {
        console.error("Lỗi đọc khóa điểm danh:", error);
        setLockReady(false); // Không cho ghi khi chưa xác minh được trạng thái.
        handleToastError("Không kiểm tra được trạng thái khóa chấm công.");
      },
    );
  }, [db, user?.id, lockTeacherId, lockDocId]);

  const changeMonthLock = useCallback(async () => {
    if (
      !isAdmin ||
      !user?.id ||
      !lockReady ||
      lockTeacherId === "all" ||
      lockSaving
    )
      return;
    setLockSaving(true);
    try {
      await setDoc(
        doc(db, "teachingAttendanceLocks", lockDocId),
        {
          teacherId: lockTeacherId,
          year,
          month,
          locked: !monthLocked,
          updatedBy: user.id,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setLockDialogOpen(false);
      handleToastSuccess(
        !monthLocked
          ? "Đã khóa chấm công tháng."
          : "Đã mở khóa chấm công tháng.",
      );
    } catch (error) {
      console.error("Lỗi cập nhật khóa chấm công:", error);
      handleToastError("Không cập nhật được khóa chấm công.");
    } finally {
      setLockSaving(false);
    }
  }, [
    isAdmin,
    user?.id,
    lockReady,
    lockTeacherId,
    lockSaving,
    db,
    lockDocId,
    year,
    month,
    monthLocked,
  ]);

  const attendanceReadOnly = !lockReady || (monthLocked && !isAdmin);

  useEffect(() => {
    setLockDialogOpen(false);
    setEditing(null);
  }, [lockDocId]);

  const attendanceConditions = [
    where("year", "==", year),

    where("month", "==", month),

    ...(isAdmin && selectedTeacherId === "all"
      ? []
      : [where("teacherId", "==", activeTeacherId || "__none__")]),
  ];

  const { data: data_attendances, loading: loading_attendances } =
    useFirestoreWithMetaCondition({
      key: `teachingAttendances_${user?.id}_${activeTeacherId}_${year}_${month}`,

      id: user?.id,

      metaDoc: "teachingAttendances",

      nameCollect: "teachingAttendances",

      condition: attendanceConditions,
    });

  const { data: rawChildren, loading } = useFirestoreWithMetaCondition({
    key: `${user?.id ?? "anonymous"}_childrenCache`,

    id: user?.id,

    metaDoc: "children",

    nameCollect: "children",

    condition: isAdmin
      ? []
      : [where("teacherIds", "array-contains", user?.id ?? "__none__")],
  });

  const children = useMemo(
    () => (rawChildren ?? []) as ChildrenModel[],

    [rawChildren],
  );

  const [saving, setSaving] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  const assignmentConditions =
    isAdmin && selectedTeacherId === "all"
      ? [where("status", "==", "active")]
      : [
          where(
            "teacherId",

            "==",

            isAdmin ? selectedTeacherId : (user?.id ?? "__none__"),
          ),

          where("status", "==", "active"),
        ];

  const { data: data_assignments, loading: loading_assignments } =
    useFirestoreWithMetaCondition({
      key: `teachingAssignments_${user?.id}_${isAdmin ? selectedTeacherId : user?.id}`,

      id: user?.id,

      metaDoc: "teachingAssignments",

      nameCollect: "teachingAssignments",

      condition: assignmentConditions,
    });

  const attendanceFromFirestore = useMemo<AttendanceMap>(() => {
    const result: AttendanceMap = {};
    const attendances = (data_attendances ?? []) as TeachingAttendanceModel[];
    for (const item of attendances) {
      const key = `${item.teacherId}_${item.childId}`;
      result[key] = item.entries ?? {};
    }
    return result;
  }, [data_attendances]);

  const attendance = useMemo<AttendanceMap>(() => {
    const result: AttendanceMap = {};
    for (const [key, entries] of Object.entries(attendanceFromFirestore)) {
      result[key] = { ...entries };
    }
    const prefix = `${year}_${month}_`;
    for (const [key, entry] of Object.entries(localAttendanceUpdates)) {
      if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      const splitAt = suffix.lastIndexOf("|");
      if (splitAt < 0) continue;
      const rowKey = suffix.slice(0, splitAt);
      const dayKey = suffix.slice(splitAt + 1);
      if (!result[rowKey]) result[rowKey] = {};
      if (entry === null) delete result[rowKey][dayKey];
      else result[rowKey][dayKey] = entry;
    }
    return result;
  }, [attendanceFromFirestore, localAttendanceUpdates, year, month]);

  // Khi snapshot Firestore đã phản ánh dữ liệu vừa lưu, bỏ ghi đè cục bộ.
  useEffect(() => {
    if (loading_attendances) return;
    setLocalAttendanceUpdates((previous) => {
      let changed = false;
      const next = { ...previous };
      const prefix = `${year}_${month}_`;
      for (const [key, expected] of Object.entries(previous)) {
        if (!key.startsWith(prefix)) continue;
        const suffix = key.slice(prefix.length);
        const splitAt = suffix.lastIndexOf("|");
        if (splitAt < 0) continue;
        const actual =
          attendanceFromFirestore[suffix.slice(0, splitAt)]?.[
            suffix.slice(splitAt + 1)
          ];
        if (
          (expected === null && actual === undefined) ||
          (expected !== null &&
            actual?.hours === expected.hours &&
            actual?.startTime === expected.startTime)
        ) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [attendanceFromFirestore, loading_attendances, year, month]);

  const query = useMemo(() => normalize(searchTerm.trim()), [searchTerm]);

  const students = useMemo<StudentView[]>(() => {
    if (!user?.id || loading || loading_assignments) return [];

    const assignments = (data_assignments ?? []) as TeachingAssignmentModel[];
    const childById = new Map(children.map((child) => [child.id, child]));

    return assignments
      .filter(
        (assignment) =>
          assignment.status === "active" &&
          (assignment.session === "day" || assignment.session === "night") &&
          (!isAdmin ||
            selectedTeacherId === "all" ||
            assignment.teacherId === selectedTeacherId),
      )
      .flatMap((assignment): StudentView[] => {
        const child = childById.get(assignment.childId);
        if (!child || child.status !== "studying") return [];
        if (!normalize(child.fullName ?? child.shortName ?? "").includes(query))
          return [];
        return [
          {
            id: child.id,
            teacherId: assignment.teacherId,
            session: assignment.session,
            name: child.fullName || child.shortName || "Chưa có tên",
            avatar: child.avatar || "",
            teacherIds: child.teacherIds ?? [],
            defaultHours: assignment.defaultHours ?? 1,
          },
        ];
      });
  }, [
    children,
    user?.id,
    loading,
    loading_assignments,
    data_assignments,
    isAdmin,
    selectedTeacherId,
    query,
  ]);

  const openEdit = useCallback(
    (
      teacherId: string,
      studentId: string,
      name: string,
      date: Day,
      hours: number | null | undefined,
    ) => {
      if (attendanceReadOnly) {
        handleToastError(
          lockReady
            ? "Tháng này đã khóa chấm công."
            : "Đang kiểm tra trạng thái khóa chấm công.",
        );
        return;
      }
      setEditing({
        teacherId,
        studentId,
        name,
        dateKey: date.key,
        day: date.day,
        value: toChoice(hours),
      });
    },
    [attendanceReadOnly, lockReady],
  );

  const closeEdit = useCallback(() => setEditing(null), []);

  const persistDay = useCallback(
    async (value?: Choice, recipients?: SubstituteRecipient[]) => {
      if (!editing || saving || !user?.id) return;
      if (!lockReady || (monthLocked && !isAdmin)) {
        handleToastError(
          "Tháng này đã khóa hoặc chưa kiểm tra được trạng thái khóa.",
        );
        return;
      }
      if (!substitutionsReady) {
        handleToastError("Đang tải dữ liệu dạy thay. Vui lòng thử lại sau.");
        return;
      }
      const { teacherId, studentId, dateKey: selectedDate } = editing;
      if (!isAdmin && teacherId !== user.id) {
        handleToastError("Bạn không có quyền chuyển ca của giáo viên khác.");
        return;
      }
      const assignment = (
        (data_assignments ?? []) as TeachingAssignmentModel[]
      ).find(
        (item) =>
          item.childId === studentId &&
          item.teacherId === teacherId &&
          item.status === "active",
      ) as TeachingAssignmentModel | undefined;
      if (!assignment) {
        handleToastError("Phân công chính không còn hiệu lực.");
        return;
      }
      if (
        recipients &&
        (new Set(recipients.map((r) => r.teacherId)).size !==
          recipients.length ||
          recipients.some(
            (r) =>
              r.teacherId === teacherId ||
              !HOURS.includes(r.hours as (typeof HOURS)[number]) ||
              !teachers.some((t) => t.id === r.teacherId),
          ))
      ) {
        handleToastError(
          "Danh sách giáo viên hoặc số giờ dạy thay không hợp lệ.",
        );
        return;
      }
      const subRef = doc(
        db,
        "teachingSubstitutions",
        substituteId(teacherId, studentId, selectedDate),
      );
      // Dữ liệu từ listener: tránh get() một document dạy thay chưa tồn tại.
      const knownSubstitution = substitutions.find(
        (item) => item.id === subRef.id,
      );
      const attRef = doc(
        db,
        "teachingAttendances",
        `${teacherId}_${studentId}_${year}_${month}`,
      );
      setSaving(true);
      setSaveError(null);
      setIsLoading(true);
      try {
        await runTransaction(db, async (transaction) => {
          const assignmentRef = doc(
            db,
            "teachingAssignments",
            `${teacherId}_${studentId}`,
          );
          // Đọc khóa ngay trong transaction để tránh ghi khi admin vừa khóa tháng.
          const lockSnapshot = await transaction.get(
            doc(db, "teachingAttendanceLocks", `${teacherId}_${year}_${month}`),
          );
          if (
            !isAdmin &&
            lockSnapshot.exists() &&
            lockSnapshot.data().locked === true
          ) {
            throw new Error("Tháng này đã khóa chấm công.");
          }
          const assignmentSnapshot = await transaction.get(assignmentRef);
          // Firestore Rules không cho giáo viên get document dạy thay
          // chưa tồn tại. Chỉ đọc khi listener xác nhận đã có bản ghi.
          const subSnapshot = knownSubstitution
            ? await transaction.get(subRef)
            : null;
          const attSnapshot = await transaction.get(attRef);
          if (
            !assignmentSnapshot.exists() ||
            assignmentSnapshot.data().status !== "active"
          )
            throw new Error("Phân công đã ngừng hoạt động.");
          const currentSub = subSnapshot?.exists()
            ? (subSnapshot.data() as SubstituteRecord)
            : undefined;
          if (currentSub && currentSub.originalTeacherId !== teacherId)
            throw new Error("Dữ liệu dạy thay không hợp lệ.");
          const previousEntry = attSnapshot.exists()
            ? (attSnapshot.data().entries?.[selectedDate] as Entry | undefined)
            : undefined;
          if (recipients && recipients.length > 0) {
            transaction.set(
              subRef,
              {
                id: subRef.id,
                childId: studentId,
                childName: editing.name,
                childAvatar:
                  children.find((child) => child.id === studentId)?.avatar ??
                  "",
                originalTeacherId: teacherId,
                date: selectedDate,
                session: assignment.session,
                recipients,
                participantIds: [
                  teacherId,
                  ...recipients.map((r) => r.teacherId),
                ],
                status: "active",
                updatedAt: serverTimestamp(),
                ...(!currentSub ? { createdAt: serverTimestamp() } : {}),
              },
              { merge: true },
            );
            if (attSnapshot.exists() && previousEntry !== undefined) {
              transaction.update(attRef, {
                [`entries.${selectedDate}`]: deleteField(),
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            if (currentSub) transaction.delete(subRef);
            if (value !== undefined) {
              const entry =
                value === ""
                  ? undefined
                  : {
                      hours: value === "X" ? null : value,
                      startTime:
                        value === "X"
                          ? null
                          : (previousEntry?.startTime ??
                            (assignment.session === "night"
                              ? "17:30"
                              : "08:00")),
                    };
              if (entry === undefined) {
                if (attSnapshot.exists() && previousEntry !== undefined)
                  transaction.update(attRef, {
                    [`entries.${selectedDate}`]: deleteField(),
                    updatedAt: serverTimestamp(),
                  });
              } else {
                transaction.set(
                  attRef,
                  {
                    teacherId,
                    childId: studentId,
                    year,
                    month,
                    entries: { [selectedDate]: entry },
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true },
                );
              }
            }
          }
        });
        // Cập nhật UI ngay sau khi transaction đã commit thành công.
        // Không đợi hook cache/meta tải lại dữ liệu.
        if (recipients?.length || value !== undefined) {
          const nextEntry: Entry | null = recipients?.length
            ? null
            : value === ""
              ? null
              : {
                  hours: value === "X" ? null : (value as number),
                  startTime:
                    value === "X"
                      ? null
                      : (attendance[attendanceKey(teacherId, studentId)]?.[
                          selectedDate
                        ]?.startTime ??
                        (assignment.session === "night" ? "17:30" : "08:00")),
                };
          setLocalAttendanceUpdates((previous) => ({
            ...previous,
            [`${year}_${month}_${attendanceKey(teacherId, studentId)}|${selectedDate}`]:
              nextEntry,
          }));
        }
        setEditing(null);
        handleToastSuccess(
          recipients
            ? "Đã cập nhật phân công dạy thay!"
            : "Điểm danh thành công!",
        );
      } catch (error) {
        console.error("Lỗi lưu điểm danh / dạy thay:", error);
        if (error && typeof error === "object" && "code" in error) {
          console.error("Firebase error code:", error.code);
        }
        setSaveError(
          error instanceof Error ? error.message : "Không thể lưu dữ liệu.",
        );
        handleToastError("Lưu thất bại. Kiểm tra quyền Firestore và thử lại.");
      } finally {
        setSaving(false);
        setIsLoading(false);
      }
    },
    [
      editing,
      saving,
      lockReady,
      monthLocked,
      substitutionsReady,
      user?.id,
      isAdmin,
      data_assignments,
      teachers,
      children,
      substitutions,
      attendance,
      db,
      year,
      month,
    ],
  );
  const saveEdit = useCallback(
    (value: Choice) => {
      void persistDay(value);
    },
    [persistDay],
  );
  const saveSubstitution = useCallback(
    (recipients: SubstituteRecipient[]) => {
      void persistDay(undefined, recipients);
    },
    [persistDay],
  );

  const toggleMode = useCallback((_id: string) => {
    // Ca dạy được cấu hình tại teachingAssignments, không chỉnh trong bảng điểm danh.
  }, []);

  const totals = useMemo(() => {
    const result = { inside: 0, outside: 0 };
    for (const student of students) {
      const key = `${student.teacherId}_${student.id}`;
      const entries = attendance[key] ?? EMPTY_ENTRIES;
      for (const date of dates) {
        const hours = entries[date.key]?.hours;
        if (typeof hours !== "number" || hours <= 0) continue;
        if (student.session === "day") result.inside += hours;
        else result.outside += hours;
      }
    }
    return result;
  }, [students, attendance, dates]);

  // Tổng hợp không phụ thuộc ô tìm kiếm hoặc tab đang mở.
  // Bảng chính đã loại giờ nhờ thay, nên không trừ lần thứ hai.
  const workSummary = useMemo(() => {
    const teacherScope = (teacherId: string) =>
      isAdmin
        ? selectedTeacherId === "all" || selectedTeacherId === teacherId
        : teacherId === user?.id;

    let ownHours = 0;
    let receivedHours = 0;
    let delegatedHours = 0;
    let plannedHours = 0;

    const allAssignments = (data_assignments ??
      []) as TeachingAssignmentModel[];
    const validChildren = new Set(
      children
        .filter((child) => child.status === "studying")
        .map((child) => child.id),
    );
    const activeKeys = new Set<string>();

    for (const assignment of allAssignments) {
      if (assignment.status !== "active" || !teacherScope(assignment.teacherId))
        continue;
      if (!validChildren.has(assignment.childId)) continue;
      const key = attendanceKey(assignment.teacherId, assignment.childId);
      if (activeKeys.has(key)) continue;
      activeKeys.add(key);
      plannedHours += (assignment.defaultHours ?? 1) * targetHours;
    }

    for (const [key, entries] of Object.entries(attendance)) {
      // Truy vấn attendance đã được giới hạn theo giáo viên được chọn;
      // lọc theo activeKeys để nhất quán với các dòng bảng chính.
      if (!activeKeys.has(key)) continue;
      for (const date of dates) {
        const hours = entries[date.key]?.hours;
        if (typeof hours === "number" && hours > 0) ownHours += hours;
      }
    }

    for (const substitution of substitutions) {
      if (substitution.status !== "active") continue;
      for (const recipient of substitution.recipients ?? []) {
        if (teacherScope(recipient.teacherId)) receivedHours += recipient.hours;
        if (teacherScope(substitution.originalTeacherId))
          delegatedHours += recipient.hours;
      }
    }

    return {
      ownHours,
      receivedHours,
      delegatedHours,
      actualHours: ownHours + receivedHours,
      plannedHours,
      difference: ownHours + receivedHours - plannedHours,
    };
  }, [
    isAdmin,
    selectedTeacherId,
    user?.id,
    data_assignments,
    children,
    attendance,
    substitutions,
    dates,
    targetHours,
  ]);

  const visibleSubstitutions = useMemo(
    () =>
      substitutions.filter(
        (item) =>
          !isAdmin ||
          selectedTeacherId === "all" ||
          item.originalTeacherId === selectedTeacherId ||
          item.recipients.some((r) => r.teacherId === selectedTeacherId),
      ),
    [substitutions, isAdmin, selectedTeacherId],
  );
  const subByOwnerDay = useMemo(
    () =>
      new Map(
        visibleSubstitutions.map((item) => [
          `${item.originalTeacherId}_${item.childId}_${item.date}`,
          item,
        ]),
      ),
    [visibleSubstitutions],
  );
  const auxRows = useMemo(() => {
    const map = new Map<
      string,
      {
        student: StudentView;
        entries: Record<string, Entry | undefined>;
        related: string;
      }
    >();
    const childMap = new Map(children.map((child) => [child.id, child]));
    const selected = isAdmin ? selectedTeacherId : user?.id;
    for (const item of visibleSubstitutions) {
      for (const recipient of item.recipients) {
        const teacherId =
          activeTab === "received"
            ? recipient.teacherId
            : item.originalTeacherId;
        const relatedId =
          activeTab === "received"
            ? item.originalTeacherId
            : recipient.teacherId;
        if (selected !== "all" && teacherId !== selected) continue;
        const child = childMap.get(item.childId);
        const childName =
          child?.fullName ||
          child?.shortName ||
          item.childName ||
          "Chưa có tên";
        if (!normalize(childName).includes(query)) continue;
        const key = `${teacherId}_${item.childId}_${relatedId}`;
        if (!map.has(key))
          map.set(key, {
            student: {
              id: item.childId,
              teacherId,
              session: item.session,
              defaultHours: 0,
              name: childName,
              avatar: child?.avatar || item.childAvatar || "",
              teacherIds: child?.teacherIds ?? [],
            },
            entries: {},
            related: relatedId,
          });
        map.get(key)!.entries[item.date] = {
          hours: recipient.hours,
          startTime: null,
        };
      }
    }
    return Array.from(map.values());
  }, [
    visibleSubstitutions,
    children,
    activeTab,
    isAdmin,
    selectedTeacherId,
    user?.id,
    query,
  ]);
  const teacherName = (id: string) =>
    teachers.find((teacher) => teacher.id === id)?.name ?? id;
  const subForEditing = editing
    ? subByOwnerDay.get(
        `${editing.teacherId}_${editing.studentId}_${editing.dateKey}`,
      )
    : undefined;

  const teacherLabel =
    isAdmin && selectedTeacherId !== "all" ? selectedTeacherId : "";

  return (
    <main className="ta-page">
      <header className="ta-header">
        <div className="ta-heading">
          <span className="ta-bunny">
            <img
              src={teachlefttop}
              alt=""
              style={{ width: 130, objectFit: "contain" }}
            />
          </span>

          <h1>ĐIỂM DANH SỐ GIỜ DẠY THỰC TẾ</h1>

          <span className="ta-heart">💗</span>
        </div>

        <div className="ta-controls">
          <label className="ta-month">
            🗓️ <span>Tháng</span>
            <select
              aria-label="Tháng"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {String(i + 1).padStart(2, "0")}
                </option>
              ))}
            </select>
            <span>/</span>
            <input
              aria-label="Năm"
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => {
                const value = Number(e.target.value);

                if (value >= 2020 && value <= 2100) setYear(value);
              }}
            />
            <span style={{ color: "#b30e4a" }}>{targetHours} ngày</span>
          </label>

          {isAdmin && user?.id && (
            <AdminTeacherSelect
              userId={user.id}
              value={selectedTeacherId}
              onChange={setSelectedTeacherId}
            />
          )}

          {lockTeacherId && lockTeacherId !== "all" && (
            // <div className="ta-lock-panel" aria-live="polite">
            //   <span className={`ta-lock-status ${monthLocked ? "is-locked" : "is-open"}`}>
            //     {!lockReady ? "⏳ Đang kiểm tra khóa" : monthLocked ? "🔒 Đã khóa chấm công" : "🔓 Đang mở chấm công"}
            //   </span>
            //   {isAdmin && (
            //     <button type="button" className="ta-lock-button"
            //       disabled={!lockReady || lockSaving}
            //       onClick={() => setLockDialogOpen(true)}>
            //       {monthLocked ? "Mở khóa tháng" : "Khóa chấm công tháng"}
            //     </button>
            //   )}
            // </div>
            <button
              type="button"
              className={`ta-lock-icon-btn ${monthLocked ? "is-locked" : "is-unlocked"}`}
              disabled={!lockReady || lockSaving}
              onClick={() => setLockDialogOpen(true)}
              title={
                monthLocked ? "Mở khóa chấm công tháng" : "Khóa chấm công tháng"
              }
              aria-label={
                monthLocked ? "Mở khóa chấm công tháng" : "Khóa chấm công tháng"
              }
            >
              {monthLocked ? (
                <LockKeyhole size={20} />
              ) : (
                <LockKeyholeOpen size={20} />
              )}
            </button>
          )}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img
              src={teachrighttop}
              alt=""
              style={{ width: 130, objectFit: "contain" }}
            />
          </div>
        </div>
      </header>

      <div className="ta-hint">
        Chạm vào ngày để nhập giờ dạy · Lịch tự xuống dòng theo tuần
      </div>

      <section className="ta-work-summary" aria-label="Tổng hợp giờ công tháng">
        <div className="ta-work-summary-heading">
          <div>
            <h2>🌸 TỔNG HỢP GIỜ CÔNG</h2>
            <p>
              Tháng {String(month).padStart(2, "0")}/{year} ·{" "}
              {isAdmin && selectedTeacherId === "all"
                ? "Tất cả giáo viên"
                : isAdmin
                  ? (teachers.find(
                      (teacher) => teacher.id === selectedTeacherId,
                    )?.name ?? "Giáo viên")
                  : "Giờ công của tôi"}
            </p>
          </div>
          <span className="ta-work-summary-tag">Tự động cập nhật</span>
        </div>
        <div className="ta-work-summary-grid">
          <div className="ta-work-summary-item is-own">
            <span>📋 Giờ tự dạy</span>
            <strong>
              {fmt(workSummary.ownHours)} <small>giờ</small>
            </strong>
            <small>Đã điểm danh tại bảng chính</small>
          </div>
          <div className="ta-work-summary-item is-received">
            <span>➕ Nhận dạy thay</span>
            <strong>
              +{fmt(workSummary.receivedHours)} <small>giờ</small>
            </strong>
            <small>Giờ nhận từ giáo viên khác</small>
          </div>
          <div className="ta-work-summary-item is-delegated">
            <span>↗️ Nhờ dạy thay</span>
            <strong>
              {fmt(workSummary.delegatedHours)} <small>giờ</small>
            </strong>
            <small>Đã loại khỏi giờ tự dạy</small>
          </div>
          <div className="ta-work-summary-item is-actual">
            <span>💗 Tổng giờ thực tế</span>
            <strong>
              {fmt(workSummary.actualHours)} <small>giờ</small>
            </strong>
            <small>Tự dạy + nhận dạy thay</small>
          </div>
        </div>
        <div className="ta-work-summary-note">
          <span>
            Kế hoạch: <b>{fmt(workSummary.plannedHours)} giờ</b>
          </span>
          <span>
            Chênh lệch:{" "}
            <b
              className={
                workSummary.difference < 0 ? "is-negative" : "is-positive"
              }
            >
              {workSummary.difference > 0 ? "+" : ""}
              {fmt(workSummary.difference)} giờ
            </b>
          </span>
          <span className="ta-work-summary-explain">
            Giờ nhờ dạy thay không trừ lần hai.
          </span>
        </div>
      </section>

      <div
        className="ta-main-tabs"
        role="tablist"
        aria-label="Các bảng điểm danh"
      >
        <button
          role="tab"
          aria-selected={activeTab === "main"}
          className={activeTab === "main" ? "active" : ""}
          onClick={() => setActiveTab("main")}
        >
          📋 Ca chính
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "received"}
          className={activeTab === "received" ? "active" : ""}
          onClick={() => setActiveTab("received")}
        >
          🔄 Ca dạy thay
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "sent"}
          className={activeTab === "sent" ? "active" : ""}
          onClick={() => setActiveTab("sent")}
        >
          💌 Chi tiết
        </button>
      </div>
      <p className="ta-sub-caption">
        {activeTab === "main"
          ? "Bảng chính: chọn ngày để điểm danh hoặc nhờ giáo viên khác dạy thay."
          : activeTab === "received"
            ? "Bảng dạy thay: các giờ được giáo viên khác chuyển cho bạn (chỉ xem)."
            : "Bảng nhờ dạy thay: ai nhận dạy thay, ngày nào, trẻ nào và bao nhiêu giờ (chỉ xem)."}
      </p>
      <div
        className="ta-search-wrap"
        role="search"
        style={{
          display: "flex",

          alignItems: "center",

          flexWrap: "wrap",

          gap: 10,

          margin: "12px 0 16px",
        }}
      >
        <label
          htmlFor="ta-student-search"
          style={{ fontWeight: 700, color: "#168B5C" }}
        >
          🔎 Tìm trẻ
        </label>

        <input
          id="ta-student-search"
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Nhập tên trẻ..."
          style={{
            flex: "1 1 220px",

            minWidth: 0,

            maxWidth: 420,

            padding: "11px 14px",

            borderRadius: 14,

            border: "1px solid #f0bfd0",

            background: "#fffafd",
          }}
        />

        {/* {searchTerm && (

          <button type="button" onClick={() => setSearchTerm("")}>

            Xóa

          </button>

        )} */}

        <span aria-live="polite">
          {loading
            ? "Đang tải..."
            : `${activeTab === "main" ? students.length : auxRows.length} dòng`}
        </span>
      </div>

      <div className="ta-table-scroll">
        <table className="ta-table">
          <thead>
            <tr>
              {/* <th className="ta-stt">STT</th> */}

              <th className="ta-name">Tên trẻ</th>

              {dates.map((d) => (
                <th key={d.key} className={d.weekend ? "ta-weekend" : ""}>
                  <span>{d.day}</span>

                  <small>{WEEKDAYS[d.week]}</small>
                </th>
              ))}

              <th className="ta-summary">
                Tổng
                <br />
                số giờ /
                <span style={{ color: "#fa2b61" }}>
                  Số giờ
                  <br />
                  yêu cầu
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {(activeTab === "main"
              ? students.map((student) => ({
                  student,
                  entries:
                    attendance[attendanceKey(student.teacherId, student.id)] ??
                    EMPTY_ENTRIES,
                  related: "",
                }))
              : auxRows
            ).map(({ student, entries, related }, index) => (
              <DesktopRow
                key={`${student.teacherId}_${student.id}_${related}`}
                student={student}
                relatedTeacherName={related ? teacherName(related) : undefined}
                relatedTeacherRole={
                  activeTab === "received" ? "Cô nhờ" : "Cô nhận"
                }
                index={index}
                dates={dates}
                entries={entries}
                mode={student.session}
                targetHours={targetHours}
                month={month}
                year={year}
                leadingBlanks={leadingBlanks}
                teacherLabel={teacherLabel}
                onEdit={openEdit}
                readOnly={
                  activeTab !== "main" ||
                  (isAdmin && selectedTeacherId === "all") ||
                  attendanceReadOnly
                }
                substitutionDates={
                  activeTab === "main"
                    ? new Set(
                        dates
                          .filter((d) =>
                            subByOwnerDay.has(
                              `${student.teacherId}_${student.id}_${d.key}`,
                            ),
                          )
                          .map((d) => d.key),
                      )
                    : undefined
                }
                onToggle={toggleMode}
              />
            ))}
          </tbody>
        </table>

        {!loading &&
          (activeTab === "main"
            ? students.length === 0
            : auxRows.length === 0) && (
            <p className="ta-no-data">Chưa có trẻ phù hợp.</p>
          )}
      </div>

      <section
        className="ta-mobile-list"
        aria-label="Danh sách điểm danh trên điện thoại"
      >
        {!loading &&
          (activeTab === "main"
            ? students.length === 0
            : auxRows.length === 0) && (
            <p className="ta-no-data">Chưa có trẻ phù hợp.</p>
          )}

        {(activeTab === "main"
          ? students.map((student) => ({
              student,
              entries:
                attendance[attendanceKey(student.teacherId, student.id)] ??
                EMPTY_ENTRIES,
              related: "",
            }))
          : auxRows
        ).map(({ student, entries, related }, index) => (
          <MobileCard
            key={`${student.teacherId}_${student.id}_${related}`}
            student={student}
            relatedTeacherName={related ? teacherName(related) : undefined}
            relatedTeacherRole={activeTab === "received" ? "Cô nhờ" : "Cô nhận"}
            index={index}
            dates={dates}
            entries={entries}
            mode={student.session}
            targetHours={targetHours}
            month={month}
            year={year}
            leadingBlanks={leadingBlanks}
            teacherLabel={teacherLabel}
            onEdit={openEdit}
            readOnly={
              activeTab !== "main" ||
              (isAdmin && selectedTeacherId === "all") ||
              attendanceReadOnly
            }
            substitutionDates={
              activeTab === "main"
                ? new Set(
                    dates
                      .filter((d) =>
                        subByOwnerDay.has(
                          `${student.teacherId}_${student.id}_${d.key}`,
                        ),
                      )
                      .map((d) => d.key),
                  )
                : undefined
            }
            onToggle={toggleMode}
          />
        ))}
      </section>

      {activeTab === "main" ? (
        <footer className="ta-footer">
          <div className="ta-footer-card">
            <span className="ta-decoration">
              <img
                src={teachleftbot}
                alt=""
                style={{ width: 130, objectFit: "contain" }}
              />
            </span>

            <strong>Số ca trong giờ hành chính:</strong>

            <b>{fmt(totals.inside)}</b>

            <span>🌷</span>
          </div>

          <div className="ta-footer-card">
            <span className="ta-decoration">
              <img
                src={teachrightbot}
                alt=""
                style={{ width: 130, objectFit: "contain" }}
              />
            </span>

            <strong>Số ca ngoài giờ hành chính:</strong>

            <b>{fmt(totals.outside)}</b>

            <span>💗</span>
          </div>

          <div className="ta-footer-card">
            {/* <span className="ta-decoration">

            <img

              src={teachattendancesum}

              alt=""

              style={{ width: 130, objectFit: "contain" }}

            />

          </span> */}

            <strong>Tổng số giờ:</strong>

            <b>{Number(fmt(totals.inside)) + Number(fmt(totals.outside))}</b>

            <span>💗</span>
          </div>
        </footer>
      ) : (
        <footer className="ta-sub-footer">
          Tổng giờ {activeTab === "received" ? "nhận dạy thay" : "nhờ dạy thay"}
          :{" "}
          <strong>
            {fmt(
              auxRows.reduce(
                (sum, row) =>
                  sum +
                  dates.reduce(
                    (a, d) => a + (row.entries[d.key]?.hours ?? 0),
                    0,
                  ),
                0,
              ),
            )}{" "}
            giờ
          </strong>
        </footer>
      )}

      {lockDialogOpen && isAdmin && lockTeacherId !== "all" && (
        <div
          className="ta-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !lockSaving)
              setLockDialogOpen(false);
          }}
        >
          <section
            className="ta-dialog ta-lock-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Xác nhận khóa chấm công"
          >
            <h2>
              {monthLocked ? "🔓 Mở khóa chấm công" : "🔒 Khóa chấm công tháng"}
            </h2>
            <p>
              Giáo viên:{" "}
              <strong>
                {teachers.find((t) => t.id === lockTeacherId)?.name ??
                  lockTeacherId}
              </strong>
            </p>
            <p>
              Tháng {String(month).padStart(2, "0")}/{year}
            </p>
            <p>
              {monthLocked
                ? "Giáo viên sẽ được phép cập nhật điểm danh và nhờ dạy thay trở lại."
                : "Giáo viên sẽ không thể chỉnh sửa điểm danh hoặc nhờ dạy thay trong tháng này. Dữ liệu cũ được giữ nguyên."}
            </p>
            <div className="ta-actions">
              <button
                type="button"
                disabled={lockSaving}
                onClick={() => setLockDialogOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="ta-primary"
                disabled={lockSaving || !lockReady}
                onClick={() => void changeMonthLock()}
              >
                {lockSaving
                  ? "Đang lưu..."
                  : monthLocked
                    ? "Xác nhận mở khóa"
                    : "Xác nhận khóa"}
              </button>
            </div>
          </section>
        </div>
      )}

      {editing && (
        <AttendanceDialog
          key={`${editing.studentId}_${editing.dateKey}`}
          editing={editing}
          onClose={closeEdit}
          onSave={saveEdit}
          onSaveSubstitution={saveSubstitution}
          teachers={teachers}
          currentSubstitution={subForEditing}
          saving={saving}
          month={month}
          year={year}
        />
      )}

      <LoadingOverlay show={isLoading} />
    </main>
  );
}
