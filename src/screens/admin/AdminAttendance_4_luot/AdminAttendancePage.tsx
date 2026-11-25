import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  Download,
  Eye,
  ImageOff,
  Info,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { db, functions } from "../../../firebase.config";
import "./AdminAttendance.css";
import type {
  Attendance,
  Action,
  AttendanceDataset,
  Branch,
  ClockIn,
  MonthlySummary,
  Shift,
  Staff,
} from "./types";

type Status = "all" | "complete" | "partial" | "none";
type View = "monthly" | "daily";
type Row = { staff: Staff; entry?: Attendance };
const TZ = "Asia/Ho_Chi_Minh";
const SITES: Record<string, string> = {
  cs1: "CS1 · Hà Nội 1",
  cs2: "CS2 · Hà Nội 2",
};
const todayVN = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const fmtDate = (day: string) =>
  new Date(`${day}T12:00:00+07:00`).toLocaleDateString("vi-VN", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
const fmtTime = (iso: string, seconds = false) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("vi-VN", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        ...(seconds ? { second: "2-digit" } : {}),
      });
};
const moveDay = (day: string, offset: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const branchName = (id: string, data?: AttendanceDataset | null) =>
  data?.branches.find((x) => x.id === id)?.name || SITES[id] || id || "—";
const countTurns = (entry?: Attendance) =>
  Number(!!entry?.morning) +
  Number(!!entry?.morningOut) +
  Number(!!entry?.afternoon) +
  Number(!!entry?.afternoonOut);
const countShifts = (entry?: Attendance) =>
  Number(!!entry?.morning && !!entry?.morningOut) +
  Number(!!entry?.afternoon && !!entry?.afternoonOut);
const minutesBetween = (a?: ClockIn | null, b?: ClockIn | null) => {
  if (!a?.at || !b?.at) return 0;
  const delta = new Date(b.at).getTime() - new Date(a.at).getTime();
  return Number.isFinite(delta) && delta > 0 ? Math.round(delta / 60000) : 0;
};
const minutesFor = (entry?: Attendance) =>
  minutesBetween(entry?.morning, entry?.morningOut) +
  minutesBetween(entry?.afternoon, entry?.afternoonOut);
const fmtDuration = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}p`;
const turnRecord = (
  entry: Attendance | undefined,
  shift: Shift,
  action: Action,
) =>
  shift === "morning"
    ? action === "checkIn"
      ? entry?.morning
      : entry?.morningOut
    : action === "checkIn"
      ? entry?.afternoon
      : entry?.afternoonOut;
const hasBranch = (entry: Attendance, branch: string) =>
  [entry.morning, entry.morningOut, entry.afternoon, entry.afternoonOut].some(
    (r) => r?.branchId === branch,
  );
const validMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const dateIso = (value: unknown): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  )
    return (value as { toDate: () => Date }).toDate().toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
    return new Date(value).toISOString();
  return "";
};
const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return `"${(/^[\s]*[=+@\-]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};
function downloadCsv(filename: string, lines: (string | number)[][]) {
  const text =
    "\uFEFF" + lines.map((line) => line.map(csvCell).join(";")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function summariesFor(staff: Staff[], entries: Attendance[]): MonthlySummary[] {
  const byUid = new Map<string, Attendance[]>();
  entries.forEach((e) => byUid.set(e.uid, [...(byUid.get(e.uid) || []), e]));
  return staff.map((s) => {
    const items = byUid.get(s.uid) || [];
    const morningShifts = items.filter((x) => !!x.morning).length;
    const afternoonShifts = items.filter((x) => !!x.afternoon).length;
    const fullDays = items.filter((x) => countShifts(x) === 2).length;
    const halfDays = items.filter((x) => countShifts(x) === 1).length;
    const totalShifts = morningShifts + afternoonShifts;
    const totalTurns = items.reduce((n, e) => n + countTurns(e), 0);
    const totalMinutes = items.reduce((n, e) => n + minutesFor(e), 0);
    return {
      uid: s.uid,
      morningShifts,
      afternoonShifts,
      fullDays,
      halfDays,
      daysWithAttendance: fullDays + halfDays,
      totalShifts,
      workDays: totalShifts / 2,
      totalTurns,
      completeShifts: totalShifts,
      totalMinutes,
    };
  });
}

// Chỉ đọc Firestore; ảnh R2 luôn lấy qua CF có kiểm tra quyền Admin.
async function loadMonth(month: string): Promise<AttendanceDataset> {
  const [usersSnap, sitesSnap, recordsSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "attendanceSites")),
    getDocs(
      query(
        collection(db, "faceAttendance"),
        where("day", ">=", `${month}-01`),
        where("day", "<=", `${month}-31`),
      ),
    ),
  ]);
  const branches: Branch[] = sitesSnap.docs.map((doc) => {
    const v = doc.data();
    return {
      id: doc.id,
      name: String(v.name || SITES[doc.id] || doc.id),
      address: String(v.address || ""),
      radiusMeters: Number(v.radiusMeters || 0),
      enabled: v.enabled === true,
      lat: Number(v.lat || 0),
      lng: Number(v.lng || 0),
    };
  });
  const staff: Staff[] = usersSnap.docs
    .filter((doc) => {
      const v = doc.data();
      return v.role === "teacher" || v.role === "manager" || v.role === "admin";
    })
    .map((doc) => {
      const v = doc.data();
      const name = String(
        v.fullName || v.name || v.displayName || v.username || doc.id,
      );
      const sites = Array.isArray(v.allowedAttendanceSites)
        ? v.allowedAttendanceSites
        : [];
      return {
        uid: doc.id,
        name,
        role: String(v.role || "Nhân sự"),
        branchId: String(sites[0] || v.branchId || ""),
        initials: name
          .trim()
          .split(/\s+/)
          .slice(-2)
          .map((x) => x.charAt(0))
          .join("")
          .toUpperCase(),
        color: "#edd8da",
        avatar: typeof v.avatar === "string" ? v.avatar : undefined,
      };
    });
  const byKey = new Map<string, Attendance>();
  recordsSnap.docs.forEach((doc) => {
    const v = doc.data();
    if (
      (v.action !== "checkIn" && v.action !== "checkOut") ||
      (v.shift !== "morning" && v.shift !== "afternoon") ||
      typeof v.uid !== "string" ||
      typeof v.day !== "string"
    )
      return;
    const key = `${v.uid}_${v.day}`;
    const row = byKey.get(key) || {
      uid: v.uid,
      date: v.day,
      morning: null,
      afternoon: null,
      morningOut: null,
      afternoonOut: null,
    };
    const loc = v.location || {};
    const record: ClockIn = {
      id: doc.id,
      at: dateIso(v.recordedAt),
      branchId: String(v.siteId || ""),
      gpsAccuracyMeters: Number(loc.accuracy || 0),
      lat: Number(loc.lat || 0),
      lng: Number(loc.lng || 0),
      score: typeof v.score === "number" ? v.score : null,
      photoKey: String(v.photoKey || ""),
      sessionId: typeof v.sessionId === "string" ? v.sessionId : undefined,
    };
    const slot =
      v.shift === "morning"
        ? v.action === "checkOut"
          ? "morningOut"
          : "morning"
        : v.action === "checkOut"
          ? "afternoonOut"
          : "afternoon";
    row[slot] = record;
    byKey.set(key, row);
  });
  // Bảo đảm vẫn hiển thị nhân sự đã có chấm công dù chưa nằm trong danh sách users được lọc.
  const known = new Set(staff.map((s) => s.uid));
  for (const entry of Array.from(byKey.values()))
    if (!known.has(entry.uid)) {
      staff.push({
        uid: entry.uid,
        name: entry.uid,
        role: "Nhân sự",
        branchId: "",
        initials: "NV",
        color: "#edd8da",
      });
      known.add(entry.uid);
    }
  staff.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const attendances = Array.from(byKey.values());
  return {
    staff,
    branches,
    attendances,
    summaries: summariesFor(staff, attendances),
  };
}
const evidenceCall = httpsCallable<{ attendanceId: string }, { url: string }>(
  functions,
  "getFaceAttendanceEvidence",
);

function PhotoViewer({
  url,
  onClose,
  staff,
  record,
}: {
  url: string;
  onClose: () => void;
  staff: Staff;
  record: ClockIn;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      className="hbm-ac-photo-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Ảnh chấm công toàn màn hình"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="hbm-ac-photo-close"
        onClick={onClose}
        aria-label="Đóng ảnh"
      >
        <X size={27} />
      </button>
      <img
        src={url}
        alt={`Ảnh chấm công của ${staff.name}`}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="hbm-ac-photo-caption">
        {staff.name} · {fmtTime(record.at, true)} ·{" "}
        {branchName(record.branchId)}
      </div>
    </div>
  );
}
function Details({
  staff,
  shift,
  action,
  record,
  data,
  onClose,
}: {
  staff: Staff;
  shift: Shift;
  action: Action;
  record: ClockIn;
  data: AttendanceDataset;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    evidenceCall({ attendanceId: record.id })
      .then((result) => {
        if (active) setUrl(result.data.url);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Không thể tải ảnh chấm công.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [record.id]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !fullscreen) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, fullscreen]);
  return (
    <div
      className="hbm-ac-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="hbm-ac-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết chấm công"
      >
        <header className="hbm-ac-dialog-head">
          <div>
            <span className="hbm-ac-eyebrow">CHI TIẾT FACE ID</span>
            <h2>{staff.name}</h2>
            <p>
              {shift === "morning" ? "Ca sáng" : "Ca chiều"} ·{" "}
              {action === "checkIn" ? "Chấm vào" : "Chấm ra"} ·{" "}
              {fmtDate(
                record.at
                  ? new Date(record.at).toLocaleDateString("en-CA", {
                      timeZone: TZ,
                    })
                  : todayVN(),
              )}
            </p>
          </div>
          <button
            type="button"
            className="hbm-ac-icon-btn"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </header>
        <div className="hbm-ac-dialog-body">
          <div className="hbm-ac-confirm">
            <CheckCircle2 size={20} /> Đã xác minh Face ID và ghi nhận chấm công
          </div>
          <div className="hbm-ac-evidence-title">
            <Camera size={18} />
            <strong>Ảnh tại thời điểm chấm công</strong>
          </div>
          {loading ? (
            <div className="hbm-ac-photo-placeholder">Đang lấy ảnh từ R2…</div>
          ) : error ? (
            <div className="hbm-ac-error">
              {error}
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setError("");
                  evidenceCall({ attendanceId: record.id })
                    .then((r) => setUrl(r.data.url))
                    .catch((e) =>
                      setError(
                        e instanceof Error ? e.message : "Không thể tải ảnh.",
                      ),
                    )
                    .finally(() => setLoading(false));
                }}
              >
                Thử lại
              </button>
            </div>
          ) : url ? (
            <button
              type="button"
              className="hbm-ac-photo-thumb"
              onClick={() => setFullscreen(true)}
              title="Bấm để xem toàn màn hình"
            >
              <img src={url} alt={`Ảnh chấm công ${staff.name}`} />
              <span>
                <Eye size={16} /> Xem toàn màn hình
              </span>
            </button>
          ) : (
            <div className="hbm-ac-photo-placeholder">
              <ImageOff size={20} /> Không có ảnh
            </div>
          )}
          <dl className="hbm-ac-detail-list">
            <div>
              <dt>Giờ ghi nhận (máy chủ)</dt>
              <dd>{fmtTime(record.at, true)}</dd>
            </div>
            <div>
              <dt>Cơ sở</dt>
              <dd>{branchName(record.branchId, data)}</dd>
            </div>
            <div>
              <dt>Sai số GPS</dt>
              <dd>{record.gpsAccuracyMeters.toLocaleString("vi-VN")} m</dd>
            </div>
            <div>
              <dt>Tọa độ GPS</dt>
              <dd>
                {record.lat.toFixed(6)}, {record.lng.toFixed(6)}
              </dd>
            </div>
            <div>
              <dt>Điểm so khớp SFace</dt>
              <dd>{record.score === null ? "—" : record.score.toFixed(4)}</dd>
            </div>
          </dl>
          <div className="hbm-ac-camera">
            <ShieldCheck size={19} />
            <div>
              <strong>Đối chiếu camera cơ sở khi cần</strong>
              <p>
                So sánh hình ảnh tại {branchName(record.branchId, data)} vào{" "}
                {fmtTime(record.at, true)}. Thời gian camera và máy chủ cần được
                đồng bộ.
              </p>
            </div>
          </div>
        </div>
        <footer className="hbm-ac-dialog-footer">
          <button type="button" className="hbm-ac-primary" onClick={onClose}>
            Đóng
          </button>
        </footer>
      </section>
      {fullscreen && url && (
        <PhotoViewer
          url={url}
          onClose={() => setFullscreen(false)}
          staff={staff}
          record={record}
        />
      )}
    </div>
  );
}

function EvidenceThumb({
  record,
  onClick,
}: {
  record?: ClockIn | null;
  onClick: () => void;
}) {
  if (!record) return null;

  return (
    <button
      type="button"
      className="hbm-ac-inline-thumb"
      onClick={onClick}
      title="Bấm để xem ảnh chấm công"
    >
      <Camera size={16} />
    </button>
  );
}
function ShiftButton({
  record,
  onClick,
}: {
  record?: ClockIn | null;
  onClick: () => void;
}) {
  return record ? (
    <button
      type="button"
      className="hbm-ac-shift"
      onClick={onClick}
      title="Xem chi tiết và ảnh chấm công"
    >
      <CheckCircle2 size={15} />
      {fmtTime(record.at)}
      <ArrowRight size={13} />
    </button>
  ) : (
    <span className="hbm-ac-empty">— Chưa ghi nhận</span>
  );
}

export default function AdminAttendancePage() {
  const [day, setDay] = useState(todayVN);
  const [view, setView] = useState<View>("monthly");
  const month = day.slice(0, 7);
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<AttendanceDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<{
    staff: Staff;
    record: ClockIn;
    shift: Shift;
    action: Action;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setSelected(null);
    loadMonth(month)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, reload]);
  const attendanceMap = useMemo(
    () =>
      new Map(
        (data?.attendances || [])
          .filter((x) => x.date === day)
          .map((x) => [x.uid, x]),
      ),
    [data, day],
  );
  const matchesBranch = useCallback(
    (staff: Staff, entries: Attendance[]) =>
      branch === "all" ||
      staff.branchId === branch ||
      entries.some((x) => hasBranch(x, branch)),
    [branch],
  );
  const allRows = useMemo<Row[]>(
    () =>
      (data?.staff || [])
        .filter((staff) =>
          matchesBranch(
            staff,
            [attendanceMap.get(staff.uid)].filter((x): x is Attendance => !!x),
          ),
        )
        .map((staff) => ({ staff, entry: attendanceMap.get(staff.uid) })),
    [data, matchesBranch, attendanceMap],
  );
  const matchesSearch = (s: Staff) =>
    `${s.name} ${s.uid}`
      .toLocaleLowerCase("vi-VN")
      .includes(search.trim().toLocaleLowerCase("vi-VN"));
  const rows = allRows.filter(
    (x) =>
      matchesSearch(x.staff) &&
      (status === "all" ||
        (status === "complete" && countTurns(x.entry) === 4) ||
        (status === "partial" &&
          countTurns(x.entry) > 0 &&
          countTurns(x.entry) < 4) ||
        (status === "none" && countTurns(x.entry) === 0)),
  );
  const stats = {
    total: allRows.length,
    complete: allRows.filter((x) => countTurns(x.entry) === 4).length,
    partial: allRows.filter(
      (x) => countTurns(x.entry) > 0 && countTurns(x.entry) < 4,
    ).length,
    none: allRows.filter((x) => countTurns(x.entry) === 0).length,
  };
  const monthlyRows = useMemo(() => {
    if (!data) return [];
    const sm = new Map(data.summaries.map((x) => [x.uid, x]));
    return data.staff
      .filter((s) =>
        matchesBranch(
          s,
          data.attendances.filter((x) => x.uid === s.uid),
        ),
      )
      .filter(matchesSearch)
      .map((staff) => ({ staff, summary: sm.get(staff.uid)! }))
      .filter(
        (x) =>
          status === "all" ||
          (status === "complete" && x.summary.fullDays > 0) ||
          (status === "partial" &&
            x.summary.totalTurns > x.summary.completeShifts * 2) ||
          (status === "none" && x.summary.totalTurns === 0),
      );
  }, [data, branch, search, status, matchesBranch]);
  const monthlyShifts = monthlyRows.reduce(
    (n, x) => n + x.summary.totalShifts,
    0,
  );
  const monthlyWorkDays = monthlyShifts / 2;
  const exportData = () => {
    if (!data) return;
    if (view === "monthly")
      downloadCsv(`BangCong_FaceID_${month}.csv`, [
        [
          "Tháng",
          "Giáo viên",
          "UID",
          "Cơ sở",
          "Ca sáng đủ vào/ra",
          "Ca chiều đủ vào/ra",
          "Ngày 2 ca",
          "Ngày 1 ca",
          "Ngày có chấm",
          "Tổng ca",
          "Công quy đổi",
          "Tổng lượt xác thực",
          "Thời lượng ghi nhận",
        ],
        ...monthlyRows.map(({ staff, summary: s }) => [
          month,
          staff.name,
          staff.uid,
          branchName(staff.branchId, data),
          s.morningShifts,
          s.afternoonShifts,
          s.fullDays,
          s.halfDays,
          s.daysWithAttendance,
          s.totalShifts,
          String(s.workDays).replace(".", ","),
          s.totalTurns,
          fmtDuration(s.totalMinutes),
        ]),
      ]);
    else
      downloadCsv(`ChamCong_FaceID_${day}.csv`, [
        [
          "Ngày",
          "Giáo viên",
          "UID",
          "Vào sáng",
          "Cơ sở vào sáng",
          "Ảnh vào sáng",
          "Ra sáng",
          "Cơ sở ra sáng",
          "Ảnh ra sáng",
          "Vào chiều",
          "Cơ sở vào chiều",
          "Ảnh vào chiều",
          "Ra chiều",
          "Cơ sở ra chiều",
          "Ảnh ra chiều",
          "Lượt",
          "Thời lượng",
        ],
        ...rows.map(({ staff, entry }) => {
          const slots = [
            entry?.morning,
            entry?.morningOut,
            entry?.afternoon,
            entry?.afternoonOut,
          ];
          return [
            day,
            staff.name,
            staff.uid,
            ...slots.flatMap((r) => [
              r ? fmtTime(r.at, true) : "",
              r ? branchName(r.branchId, data) : "",
              r?.photoKey || "",
            ]),
            countTurns(entry),
            fmtDuration(minutesFor(entry)),
          ];
        }),
      ]);
  };
  const show = (
    staff: Staff,
    record: ClockIn | null | undefined,
    shift: Shift,
    action: Action,
  ) => {
    if (record) setSelected({ staff, record, shift, action });
  };
  return (
    <div className="hbm-admin-attendance">
      <div className="hbm-ac-content">
        <header className="hbm-ac-heading">
          <div>
            <span className="hbm-ac-eyebrow">
              NGÔI SAO XANH EDUCATION · QUẢN LÝ NHÂN SỰ
            </span>
            <h1>Quản lý chấm công</h1>
            <p>
              Face ID + GPS + Passkey · Ảnh đối chứng lưu trên Cloudflare R2
            </p>
          </div>
          <div className="hbm-ac-header-actions">
            <button
              type="button"
              className="hbm-ac-secondary"
              onClick={() => setReload((x) => x + 1)}
              disabled={loading}
            >
              <RefreshCw size={16} /> Làm mới
            </button>
            {/* <button
              type="button"
              className="hbm-ac-primary"
              onClick={exportData}
              disabled={!data || loading}
            >
              <Download size={16} /> Xuất CSV
            </button> */}
          </div>
        </header>
        <div className="hbm-ac-banner">
          <ShieldCheck size={19} />
          <span>
            Dữ liệu chấm công được xác minh bằng Face ID và GPS. Bấm vào giờ
            chấm công để xem ảnh thực tế và đối chiếu camera khi cần.
          </span>
        </div>
        <div className="hbm-ac-view-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === "monthly"}
            className={view === "monthly" ? "active" : ""}
            onClick={() => {
              setView("monthly");
              setStatus("all");
            }}
          >
            Tổng hợp tháng
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "daily"}
            className={view === "daily" ? "active" : ""}
            onClick={() => {
              setView("daily");
              setStatus("all");
            }}
          >
            Chi tiết ngày
          </button>
        </div>
        <section className="hbm-ac-filters">
          <div className="hbm-ac-filter-title">
            <CalendarDays size={18} /> Bộ lọc chấm công
          </div>
          <div className="hbm-ac-filter-grid">
            <label>
              <span>{view === "monthly" ? "Tháng" : "Ngày"}</span>
              {view === "monthly" ? (
                <input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (validMonth(e.target.value))
                      setDay(`${e.target.value}-01`);
                  }}
                />
              ) : (
                <div className="hbm-ac-date">
                  <button
                    type="button"
                    onClick={() => setDay(moveDay(day, -1))}
                    aria-label="Ngày trước"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <input
                    type="date"
                    value={day}
                    onChange={(e) => {
                      if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                        setDay(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setDay(moveDay(day, 1))}
                    aria-label="Ngày sau"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </label>
            <label>
              <span>Cơ sở</span>
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="all">Tất cả cơ sở</option>
                {(data?.branches.length
                  ? data.branches
                  : [
                      { id: "cs1", name: SITES.cs1 },
                      { id: "cs2", name: SITES.cs2 },
                    ]
                ).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Trạng thái</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                <option value="all">Tất cả</option>
                <option value="complete">Đủ 4 lượt</option>
                <option value="partial">Chưa đủ 4 lượt</option>
                <option value="none">Chưa chấm</option>
              </select>
            </label>
            <label>
              <span>Tìm giáo viên</span>
              <div className="hbm-ac-search">
                <Search size={17} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tên hoặc UID..."
                />
              </div>
            </label>
          </div>
        </section>
        {view === "monthly" ? (
          <>
            <section className="hbm-ac-stats">
              <div>
                <span>Nhân sự</span>
                <strong>{monthlyRows.length}</strong>
                <small>Theo bộ lọc</small>
              </div>
              <div>
                <span>Ca đủ vào/ra</span>
                <strong>{monthlyShifts}</strong>
                <small>Chỉ tính ca có đủ 2 lượt</small>
              </div>
              <div>
                <span>Công quy đổi</span>
                <strong>{monthlyWorkDays.toLocaleString("vi-VN")}</strong>
                <small>Quy đổi tham khảo · 1 ca đủ = 0,5</small>
              </div>
              <div>
                <span>Tháng</span>
                <strong>
                  {month.slice(5)}/{month.slice(0, 4)}
                </strong>
                <small>Không tính ca thiếu lượt ra</small>
              </div>
            </section>
            <section className="hbm-ac-table-card">
              <div className="hbm-ac-table-head">
                <div>
                  <h2>Bảng công theo tháng</h2>
                  <p>
                    {monthlyRows.length} nhân sự · 2 ca đủ vào/ra = 1 công (tham
                    khảo)
                  </p>
                </div>
              </div>
              {error && (
                <div className="hbm-ac-error" role="alert">
                  {error}
                </div>
              )}
              {loading ? (
                <div className="hbm-ac-state">Đang tải dữ liệu…</div>
              ) : data ? (
                <>
                  <div className="hbm-ac-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>GIÁO VIÊN</th>
                          <th>CƠ SỞ</th>
                          <th>SÁNG ĐỦ VÀO/RA</th>
                          <th>CHIỀU ĐỦ VÀO/RA</th>
                          <th>NGÀY 2 CA</th>
                          <th>NGÀY 1 CA</th>
                          <th>CA HOÀN TẤT</th>
                          <th>LƯỢT XÁC THỰC</th>
                          <th>THỜI LƯỢNG</th>
                          <th>CÔNG QUY ĐỔI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyRows.map(({ staff, summary: s }) => (
                          <tr key={staff.uid}>
                            <td>
                              <strong>{staff.name}</strong>
                            </td>
                            <td>{branchName(staff.branchId, data)}</td>
                            <td>{s.morningShifts}</td>
                            <td>{s.afternoonShifts}</td>
                            <td>{s.fullDays}</td>
                            <td>{s.halfDays}</td>
                            <td>{s.totalShifts}</td>
                            <td>{s.totalTurns}</td>
                            <td>{fmtDuration(s.totalMinutes)}</td>
                            <td>
                              <strong>
                                {s.workDays.toLocaleString("vi-VN")}
                              </strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="hbm-ac-month-mobile">
                    {monthlyRows.map(({ staff, summary: s }) => (
                      <article key={staff.uid} className="hbm-ac-mobile-card">
                        <strong>{staff.name}</strong>
                        <small>{branchName(staff.branchId, data)}</small>
                        <div className="hbm-ac-month-metrics">
                          <span>
                            Sáng: <b>{s.morningShifts}</b>
                          </span>
                          <span>
                            Chiều: <b>{s.afternoonShifts}</b>
                          </span>
                          <span>
                            Ca đủ: <b>{s.totalShifts}</b>
                          </span>
                          <span>
                            Lượt: <b>{s.totalTurns}</b>
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
            <p className="hbm-ac-footer-note">
              <Info size={16} /> Chỉ quy đổi ca có đủ lượt vào và ra; thời lượng
              tính từ dấu thời gian máy chủ. Đây là số liệu tham khảo, chưa áp
              dụng lịch làm việc, nghỉ phép và quy định tính lương.
            </p>
          </>
        ) : (
          <>
            <section className="hbm-ac-stats">
              <div>
                <span>Tổng nhân sự</span>
                <strong>{stats.total}</strong>
                <small>Theo cơ sở</small>
              </div>
              <div>
                <span>Đủ 4 lượt</span>
                <strong>{stats.complete}</strong>
                <small>Vào/ra sáng và chiều</small>
              </div>
              <div>
                <span>Chưa đủ 4 lượt</span>
                <strong>{stats.partial}</strong>
                <small>Đã có ít nhất một lượt</small>
              </div>
              <div>
                <span>Chưa chấm</span>
                <strong>{stats.none}</strong>
                <small>Không đồng nghĩa vắng mặt</small>
              </div>
            </section>
            <section className="hbm-ac-table-card">
              <div className="hbm-ac-table-head">
                <div>
                  <h2>Danh sách chấm công</h2>
                  <p>
                    {fmtDate(day)} · {rows.length}/{allRows.length} nhân sự
                  </p>
                </div>
                <button
                  type="button"
                  className="hbm-ac-secondary"
                  onClick={() => {
                    setBranch("all");
                    setStatus("all");
                    setSearch("");
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
              {error && (
                <div className="hbm-ac-error" role="alert">
                  {error}
                </div>
              )}
              {loading ? (
                <div className="hbm-ac-state">Đang tải dữ liệu…</div>
              ) : data && rows.length === 0 ? (
                <div className="hbm-ac-state">Không có nhân sự phù hợp.</div>
              ) : data ? (
                <>
                  <div className="hbm-ac-table-scroll">
                    <table className="hbm-ac-four-table">
                      <thead>
                        <tr>
                          <th>GIÁO VIÊN</th>
                          <th>VÀO SÁNG</th>
                          <th>RA SÁNG</th>
                          <th>VÀO CHIỀU</th>
                          <th>RA CHIỀU</th>
                          <th>THỜI LƯỢNG</th>
                          <th>TRẠNG THÁI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ staff, entry }) => (
                          <tr key={staff.uid}>
                            <td>
                              <div className="hbm-ac-person">
                                <span
                                  className="hbm-ac-avatar"
                                  style={{ background: staff.color }}
                                >
                                  {staff.avatar ? (
                                    <img src={staff.avatar} alt="" />
                                  ) : (
                                    staff.initials
                                  )}
                                </span>
                                <div>
                                  <strong>{staff.name}</strong>
                                  <small>{staff.role}</small>
                                </div>
                              </div>
                            </td>
                            {(
                              [
                                ["morning", "checkIn"],
                                ["morning", "checkOut"],
                                ["afternoon", "checkIn"],
                                ["afternoon", "checkOut"],
                              ] as [Shift, Action][]
                            ).map(([shift, action]) => {
                              const r = turnRecord(entry, shift, action);
                              return (
                                <td key={`${shift}_${action}`}>
                                  <div className="hbm-ac-shift-cell">
                                    <ShiftButton
                                      record={r}
                                      onClick={() =>
                                        show(staff, r, shift, action)
                                      }
                                    />
                                    {r && (
                                      <>
                                        <EvidenceThumb
                                          record={r}
                                          onClick={() =>
                                            show(staff, r, shift, action)
                                          }
                                        />
                                        <span className="hbm-ac-shift-site">
                                          <MapPin size={13} />
                                          {branchName(r.branchId, data)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td>
                              <strong>
                                {countShifts(entry)
                                  ? fmtDuration(minutesFor(entry))
                                  : "—"}
                              </strong>
                            </td>
                            <td>
                              <span
                                className={`hbm-ac-status hbm-ac-status-${countTurns(entry) === 4 ? 2 : countTurns(entry) ? 1 : 0}`}
                              >
                                {countTurns(entry)}/4 lượt
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="hbm-ac-mobile-list">
                    {rows.map(({ staff, entry }) => (
                      <article key={staff.uid} className="hbm-ac-mobile-card">
                        <div className="hbm-ac-mobile-top">
                          <div className="hbm-ac-person">
                            <span
                              className="hbm-ac-avatar"
                              style={{ background: staff.color }}
                            >
                              {staff.avatar ? (
                                <img src={staff.avatar} alt="" />
                              ) : (
                                staff.initials
                              )}
                            </span>
                            <div>
                              <strong>{staff.name}</strong>
                              <small>{staff.role}</small>
                            </div>
                          </div>
                          <span
                            className={`hbm-ac-status hbm-ac-status-${countTurns(entry) === 4 ? 2 : countTurns(entry) ? 1 : 0}`}
                          >
                            {countTurns(entry)}/4 lượt
                          </span>
                        </div>
                        <div className="hbm-ac-mobile-shifts">
                          {(
                            [
                              ["morning", "checkIn", "Vào sáng"],
                              ["morning", "checkOut", "Ra sáng"],
                              ["afternoon", "checkIn", "Vào chiều"],
                              ["afternoon", "checkOut", "Ra chiều"],
                            ] as [Shift, Action, string][]
                          ).map(([shift, action, label]) => {
                            const r = turnRecord(entry, shift, action);
                            return (
                              <div key={`${shift}_${action}`}>
                                <span>{label}</span>
                                <div className="hbm-ac-shift-with-photo">
                                  <ShiftButton
                                    record={r}
                                    onClick={() =>
                                      show(staff, r, shift, action)
                                    }
                                  />
                                  <EvidenceThumb
                                    record={r}
                                    onClick={() =>
                                      show(staff, r, shift, action)
                                    }
                                  />
                                </div>
                                {r && (
                                  <span className="hbm-ac-shift-site">
                                    <MapPin size={13} />
                                    {branchName(r.branchId, data)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="hbm-ac-mobile-duration">
                          Thời lượng ghi nhận:{" "}
                          <strong>
                            {countShifts(entry)
                              ? fmtDuration(minutesFor(entry))
                              : "—"}
                          </strong>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
            <p className="hbm-ac-footer-note">
              <Info size={16} /> “Chưa chấm” không đồng nghĩa nghỉ làm hoặc đi
              muộn. Dữ liệu trước khi áp dụng 4 lượt có thể chỉ có giờ vào;
              không tự suy diễn giờ ra.
            </p>
          </>
        )}
      </div>
      {selected && data && (
        <Details
          staff={selected.staff}
          shift={selected.shift}
          action={selected.action}
          record={selected.record}
          data={data}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
