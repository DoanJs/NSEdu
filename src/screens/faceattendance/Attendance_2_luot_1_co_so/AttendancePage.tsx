import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Fingerprint,
  MapPin,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sun,
  Sunset,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./attendance.css";
import {
  createAttendanceAdapter,
  type Geo,
  type Shift,
  type Action,
  type SiteId,
} from "./attendanceAdapter";

type Entry = { recordedAt: string; attendanceId: string };
type Daily = Record<Shift, Record<Action, Entry | null>>;
const empty = (): Daily => ({
  morning: { checkIn: null, checkOut: null },
  afternoon: { checkIn: null, checkOut: null },
});
// Một cơ sở duy nhất; giữ nguyên ID cs1 để tương thích Cloud Functions và Firestore.
const site = {
  id: "cs1" as SiteId,
  name: "Cơ sở làm việc",
  address: "Ngôi Sao Xanh Education",
  image: "/images/attendance/cs1.jpg",
};

function SitePhoto({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="hbm-site-photo">
      {!failed ? (
        <img
          src={src}
          alt={`Hình ảnh ${name}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="hbm-site-photo-placeholder">
          <MapPin size={28} />
          <small>Thêm ảnh {name}</small>
        </span>
      )}
    </span>
  );
}
const vnDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const clock = (s?: string) =>
  s && !Number.isNaN(new Date(s).getTime())
    ? new Date(s).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "--:--";
const distanceMeters = (a: Geo, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.latitude) * rad;
  const dLng = (b.lng - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};
const dateLabel = () =>
  new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Đã xảy ra lỗi. Vui lòng thử lại.";
async function gps(): Promise<Geo> {
  if (!navigator.geolocation) throw new Error("Thiết bị không hỗ trợ GPS.");
  const p = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 18000,
      maximumAge: 0,
    }),
  );
  return {
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    accuracy: p.coords.accuracy,
  };
}
function capture(video: HTMLVideoElement): Promise<Blob> {
  const w = 640,
    h = Math.max(
      1,
      Math.round(
        ((video.videoHeight || 480) * 640) / (video.videoWidth || 640),
      ),
    );
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không thể chụp ảnh.");
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Không thể tạo ảnh JPEG."))),
      "image/jpeg",
      0.78,
    ),
  );
}
export interface AttendancePageProps {
  auth: Auth;
  functions: Functions;
  db: Firestore;
  logoSrc?: string;
  onBack?: () => void;
}
export default function AttendancePage({
  auth,
  functions,
  db,
  logoSrc,
  onBack,
}: AttendancePageProps) {
  const adapter = useMemo(
    () => createAttendanceAdapter(functions),
    [functions],
  );
  const [user, setUser] = useState<User | null>(null);
  const [teacherAvatar, setTeacherAvatar] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const siteId: SiteId = site.id;
  const [daily, setDaily] = useState<Daily>(empty);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    "gps" | "passkey" | "camera" | "verify" | null
  >(null);
  const [pending, setPending] = useState<{
    sessionId: string;
    shift: Shift;
    action: Action;
    location: Geo;
  } | null>(null);
  const [error, setError] = useState("");
  const [syncNote, setSyncNote] = useState("");
  const [success, setSuccess] = useState("");
  const [distanceNote, setDistanceNote] = useState<string | null>(null);
  const [gpsNote, setGpsNote] = useState("GPS sẽ được kiểm tra khi chấm công");
  const [result, setResult] = useState<{
    ok: boolean;
    title: string;
    detail: string;
  } | null>(null);
  const [scanNote, setScanNote] = useState("Đang khởi động camera…");
  const [passkeyNote, setPasskeyNote] = useState(
    "Đang yêu cầu xác thực thiết bị…",
  );
  const [passkeyStatus, setPasskeyStatus] = useState<
    "loading" | "registered" | "missing" | "unsupported"
  >("loading");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [verifyNote, setVerifyNote] = useState("Đang chuẩn bị xác thực…");
  const [cameraReady, setCameraReady] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanning = useRef(false);
  const cancelled = useRef(false);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [auth],
  );
  useEffect(() => {
    if (!user?.uid) {
      setPasskeyStatus("loading");
      return;
    }
    let active = true;
    if (!window.PublicKeyCredential || !window.isSecureContext) {
      setPasskeyStatus("unsupported");
      return;
    }
    void adapter
      .passkeyStatus()
      .then((r) => {
        if (active) setPasskeyStatus(r.registered ? "registered" : "missing");
      })
      .catch(() => {
        if (active) setPasskeyStatus("loading");
      });
    return () => {
      active = false;
    };
  }, [user?.uid, adapter]);

  async function registerPasskey() {
    if (passkeyBusy || busy) return;
    setPasskeyBusy(true);
    setError("");
    try {
      await adapter.registerPasskey();
      const state = await adapter.passkeyStatus();
      if (!state.registered)
        throw new Error("Máy chủ chưa xác nhận Passkey đã đăng ký.");
      setPasskeyStatus("registered");
      setSuccess("Đã đăng ký Passkey. Bạn có thể bắt đầu chấm công.");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPasskeyBusy(false);
    }
  }

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(
    () => () => {
      if (resultTimer.current) clearTimeout(resultTimer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (phase === "camera" && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play().catch(() => {});
    }
  }, [phase]);

  useEffect(() => {
    if (!user?.uid) return;

    let active = true;

    const loadAvatar = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));

        if (!active) return;

        const avatar = snap.data()?.avatar;

        setTeacherAvatar(
          typeof avatar === "string" && avatar.trim() ? avatar : null,
        );
      } catch (error) {
        console.error("Không tải được avatar giáo viên:", error);
      }
    };

    loadAvatar();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  async function refresh() {
    if (!user) return;
    const day = vnDay();
    const slots: { shift: Shift; action: Action }[] = [
      { shift: "morning", action: "checkIn" },
      { shift: "afternoon", action: "checkOut" },
    ];
    // Đọc đúng 2 document theo ID cố định, không cần query cả collection.
    const results = await Promise.allSettled(
      slots.map(({ shift, action }) =>
        getDoc(doc(db, "faceAttendance", `${user.uid}_${day}_${shift}_${action}`)),
      ),
    );
    const next = empty();
    let permissionDenied = false;
    let otherFailure = false;
    results.forEach((result, index) => {
      const { shift, action } = slots[index];
      if (result.status === "rejected") {
        const err = result.reason as { code?: string };
        if (err?.code === "permission-denied") permissionDenied = true;
        else otherFailure = true;
        return;
      }
      const snap = result.value;
      if (!snap.exists()) return;
      const x = snap.data();
      if (x.uid !== user.uid || x.shift !== shift || x.action !== action) return;
      const raw = x.recordedAt;
      const at = raw?.toDate?.()?.toISOString?.() ||
        (typeof raw === "string" ? raw : "");
      next[shift][action] = { attendanceId: snap.id, recordedAt: at };
    });
    // Giữ trạng thái trước đó nếu một lượt đọc Firestore bị lỗi.
    setDaily((previous) => {
      const updated: Daily = {
        morning: { ...previous.morning },
        afternoon: { ...previous.afternoon },
      };
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const { shift, action } = slots[index];
          updated[shift][action] = next[shift][action];
        }
      });
      return updated;
    });
    if (permissionDenied) {
      setSyncNote(
        "Chưa được cấp quyền đọc trạng thái chấm công. Vui lòng kiểm tra Firestore Rules; việc chấm công vẫn do máy chủ xác nhận.",
      );
    } else if (otherFailure) {
      setSyncNote("Chưa đồng bộ được trạng thái hôm nay. Hãy thử Làm mới.");
    } else {
      setSyncNote("");
    }
  }
  useEffect(() => {
    if (user) void refresh();
    else setDaily(empty());
  }, [user]);
  function showResult(ok: boolean, title: string, detail: string) {
    if (resultTimer.current) clearTimeout(resultTimer.current);
    setResult({ ok, title, detail });
    resultTimer.current = setTimeout(
      () => {
        setResult(null);
        resultTimer.current = null;
      },
      ok ? 2400 : 3500,
    );
  }
  async function updateDistance(location: Geo, chosenSite: SiteId) {
    try {
      const site = await getDoc(doc(db, "attendanceSites", chosenSite));
      const data = site.data();
      if (typeof data?.lat === "number" && typeof data?.lng === "number") {
        const meters = Math.round(
          distanceMeters(location, { lat: data.lat, lng: data.lng }),
        );
        setDistanceNote(
          `Cách cơ sở khoảng ${meters} m · Sai số GPS ±${Math.round(location.accuracy)} m`,
        );
      } else {
        setDistanceNote(
          `Sai số GPS ±${Math.round(location.accuracy)} m · Không có tọa độ cơ sở`,
        );
      }
    } catch {
      setDistanceNote(
        `Sai số GPS ±${Math.round(location.accuracy)} m · Chưa thể đọc khoảng cách`,
      );
    }
  }
  function close() {
    cancelled.current = true;
    stopCamera();
    setPending(null);
    setPhase(null);
    setBusy(false);
    scanning.current = false;
    setCameraReady(false);
    setExpiresAt(null);
  }
  async function begin(shift: Shift, action: Action) {
    if (busy || daily[shift][action]) return;
    if (action === "checkOut" && !daily.morning.checkIn) {
      setError("Cần chấm công vào trước khi chấm công ra.");
      return;
    }
    cancelled.current = false;
    scanning.current = false;
    setBusy(true);
    setError("");
    setSuccess("");
    if (resultTimer.current) clearTimeout(resultTimer.current);
    setResult(null);
    setDistanceNote(null);
    setVerifyNote("Đang chuẩn bị xác thực…");
    setPhase("gps");
    try {
      const location = await gps();
      setGpsNote(`GPS đã lấy · sai số ±${Math.round(location.accuracy)}m`);
      void updateDistance(location, siteId);
      // Server validates geofence and enrollment before opening the camera.
      const start = await adapter.start({
        siteId,
        shift,
        action,
        location,
      });
      if (cancelled.current) return;
      // Bước 2: máy chủ xác thực WebAuthn và đánh dấu phiên GPS đã qua Passkey.
      // Không mở camera nếu xác thực thất bại hoặc người dùng hủy.
      setPhase("passkey");
      setPasskeyNote("Xác nhận Passkey trên thiết bị của bạn…");
      await adapter.verifyAttendancePasskey(start.sessionId);
      if (cancelled.current) return;
      setPasskeyNote("Passkey hợp lệ. Đang mở camera…");
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Trình duyệt không hỗ trợ camera hoặc chưa dùng HTTPS.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });
      if (cancelled.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setScanNote("Đưa khuôn mặt vào giữa vòng tròn");
      setCameraReady(false);
      setExpiresAt(
        typeof start.expiresAt === "number" ? start.expiresAt : null,
      );
      setPending({ sessionId: start.sessionId, shift, action, location });
      setPhase("camera");
    } catch (e) {
      close();
      setError(messageOf(e));
      showResult(false, "Chưa thể xác thực", messageOf(e));
    }
  }
  // Giới hạn thời gian cho các bước bất đồng bộ trên thiết bị di động.
  // Promise.race không hủy yêu cầu đã gửi đến máy chủ.
  function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }
  // Camera tự chụp khi video sẵn sàng. Nếu trình duyệt hỗ trợ FaceDetector,
  // chỉ gửi ảnh khi phát hiện đúng một khuôn mặt. Các trình duyệt khác gửi
  // một khung hình sau khi camera ổn định; AI phía server sẽ kiểm tra khuôn mặt.
  useEffect(() => {
    if (phase !== "camera" || !cameraReady || !pending || scanning.current)
      return;
    // Snapshot ổn định qua các await; không dùng pending nullable trong async.
    const currentPending = pending;
    scanning.current = true;
    let stopped = false;
    // Khi chuyển từ camera sang verify, effect sẽ cleanup.
    // Không được hủy tác vụ đang gửi ảnh chỉ vì giao diện đổi phase.
    let verificationStarted = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));
    const run = async () => {
      try {
        await wait(1100);
        // await wait(1500);
        if (stopped || cancelled.current) return;
        const v = video.current;
        if (!v || v.readyState < 2 || !v.videoWidth)
          throw new Error("Camera chưa sẵn sàng.");
        // FaceDetector không có trên mọi trình duyệt: đây là kiểm tra tùy chọn.
        const Detector = (
          window as unknown as {
            FaceDetector?: new (options: {
              fastMode: boolean;
              maxDetectedFaces: number;
            }) => { detect: (source: HTMLVideoElement) => Promise<unknown[]> };
          }
        ).FaceDetector;
        if (Detector) {
          const detector = new Detector({
            fastMode: true,
            maxDetectedFaces: 2,
          });
          let found = false;
          for (let attempt = 0; attempt < 12; attempt++) {
            if (stopped || cancelled.current) return;
            setScanNote("Đưa một khuôn mặt vào giữa vòng tròn…");
            const faces = await withTimeout(
              detector.detect(v),
              5000,
              "Phát hiện khuôn mặt quá lâu. Vui lòng thử lại.",
            );
            if (faces.length === 1) {
              found = true;
              break;
            }
            await wait(450);
          }
          if (!found)
            throw new Error(
              "Chưa phát hiện rõ một khuôn mặt. Vui lòng thử lại.",
            );
        } else {
          setScanNote("Đang lấy ảnh để AI kiểm tra khuôn mặt…");
        }
        if (stopped || cancelled.current) return;
        if (expiresAt && Date.now() > expiresAt)
          throw new Error("Phiên xác thực đã hết hạn. Vui lòng thử lại.");
        const shot = await capture(v);
        if (stopped || cancelled.current) return;
        // Đánh dấu đã chuyển sang giai đoạn xác minh trước khi đổi phase.
        // Cleanup của effect không được ngắt quá trình này.
        verificationStarted = true;
        setPhase("verify");
        stopCamera();
        // Hiển thị chính xác bước đang chạy; GPS được xác minh lại trên server.
        setVerifyNote("Đang lấy lại vị trí GPS…");
        console.info("[FaceAttendance] verifying GPS");
        const location = await withTimeout(
          gps(),
          22000,
          "Không lấy được GPS lần hai. Hãy bật định vị, mở lại trang và thử lại.",
        );
        if (cancelled.current) return;
        if (expiresAt && Date.now() > expiresAt)
          throw new Error("Phiên xác thực đã hết hạn. Vui lòng thử lại.");
        setVerifyNote("Đang gửi ảnh và đối chiếu khuôn mặt với AI…");
        console.info("[FaceAttendance] calling finishFaceAttendance");
        const saved = await withTimeout(
          adapter.finish({
            sessionId: currentPending.sessionId,
            location,
            image: shot,
          }),
          70000,
          "Máy chủ phản hồi quá lâu. Hãy bấm Làm mới để kiểm tra trạng thái trước khi thử lại.",
        );
        console.info("[FaceAttendance] finishFaceAttendance resolved");
        if (cancelled.current) return;
        const detail = `Đã ghi nhận ${currentPending.action === "checkIn" ? "vào" : "ra"} ca ${currentPending.shift === "morning" ? "sáng" : "chiều"} lúc ${clock(saved.recordedAt)}.`;
        // Không chờ Firestore refresh để hiển thị thành công.
        close();
        setDaily((previous) => ({
          ...previous,
          [currentPending.shift]: {
            ...previous[currentPending.shift],
            [currentPending.action]: {
              attendanceId: saved.attendanceId,
              recordedAt: saved.recordedAt,
            },
          },
        }));
        setSuccess(detail);
        showResult(true, "Chấm công thành công", detail);
        void refresh();
      } catch (e) {
        if (cancelled.current || (stopped && !verificationStarted)) return;
        console.error("[FaceAttendance] verification failed", e);
        const detail = messageOf(e);
        close();
        setError(detail);
        showResult(false, "Xác thực thất bại", detail);
      }
    };
    void run();
    return () => {
      if (!verificationStarted) stopped = true;
    };
  }, [phase, cameraReady, pending, expiresAt, adapter]);
  const completed = (["morning", "afternoon"] as const).reduce(
    (count, shift) => count + Number(shift === "morning" ? !!daily[shift].checkIn : !!daily[shift].checkOut),
    0,
  );
  if (!ready)
    return (
      <main className="hbm-attendance">
        <div className="hbm-attendance__loading">Đang kiểm tra tài khoản…</div>
      </main>
    );
  if (!user)
    return (
      <main className="hbm-attendance">
        <div className="hbm-attendance__loading">
          Vui lòng đăng nhập NSXEdu để chấm công.
        </div>
      </main>
    );
  return (
    <main className="hbm-attendance">
      <div className="hbm-attendance__container">
        <header className="hbm-attendance__top">
          <div className="hbm-attendance__brand">
            <Link to="/" className="hbm-attendance__brand-icon">
              {logoSrc ? <img src={logoSrc} alt="NSXEdu" /> : "NSXEdu"}
            </Link>
            <div>
              <span className="hbm-attendance__brand-name">
                NGÔI SAO XANH EDUCATION
              </span>
              <span className="hbm-attendance__brand-sub">
                NSXEdu · Chấm công thông minh
              </span>
            </div>
          </div>
          <div className="hbm-attendance__top-actions">
            {onBack && (
              <button className="hbm-attendance__text-button" onClick={onBack}>
                Quay lại
              </button>
            )}
            {/* <span className="hbm-attendance__avatar">
              {(user.displayName || user.email || "GV")
                .slice(0, 2)
                .toUpperCase()}
            </span> */}
            <span className="hbm-attendance__avatar">
              {teacherAvatar ? (
                <img
                  src={teacherAvatar}
                  alt={user.displayName || "Ảnh giáo viên"}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                (user.displayName || user.email || "GV")
                  .slice(0, 2)
                  .toUpperCase()
              )}
            </span>
          </div>
        </header>
        <section className="hbm-attendance__hero">
          <div className="hbm-attendance__hero-copy">
            <span className="hbm-attendance__eyebrow">
              <ShieldCheck size={15} /> XÁC THỰC AN TOÀN
            </span>
            <h1>
              Chấm công
              <br />
              <em>mỗi ngày</em>
            </h1>
            <p>
              Chấm công qua ba lớp GPS, Passkey và nhận diện khuôn mặt AI, ghi
              nhận giờ vào và ra ca của bạn.
            </p>
          </div>
          <div className="hbm-attendance__hero-symbol">
            <ScanFace size={78} strokeWidth={1.15} />
          </div>
        </section>
        <section className="hbm-attendance__identity">
          <div>
            <span className="hbm-attendance__muted">Xin chào,</span>
            <strong>{user.displayName || user.email || "Giáo viên"}</strong>
            <small>{dateLabel()}</small>
          </div>
          <div className="hbm-attendance__progress">
            <strong>
              {completed}
              <span>/2</span>
            </strong>
            <small>Lượt đã ghi nhận</small>
          </div>
        </section>
        <section className="hbm-attendance__branch">
          <div className="hbm-attendance__section-title">
            <MapPin size={18} /> Cơ sở làm việc
          </div>
          <div className="hbm-site-grid hbm-site-grid--single" aria-label="Cơ sở làm việc">
            <div className="hbm-site-card is-selected hbm-site-card--fixed">
              <SitePhoto src={site.image} name={site.name} />
              <span className="hbm-site-card-badge">
                <CheckCircle2 size={15} />
                CƠ SỞ HIỆN TẠI
              </span>
              <span className="hbm-site-card-body">
                <span className="hbm-site-card-title">
                  {site.name}
                  <CheckCircle2 size={19} />
                </span>
                <span className="hbm-site-card-address">
                  <MapPin size={14} />
                  {site.address}
                </span>
              </span>
            </div>
          </div>

          <p className="hbm-attendance__gps-note">
            <MapPin size={14} />
            {distanceNote || gpsNote}
          </p>
        </section>
        <section
          className="hbm-attendance__passkey"
          aria-label="Đăng ký Passkey"
        >
          <div className="hbm-attendance__section-title">
            <Fingerprint size={18} /> Bảo mật Passkey
          </div>
          <div className="hbm-attendance__passkey-row">
            <div>
              <strong>
                {passkeyStatus === "registered"
                  ? "Đã có Passkey"
                  : passkeyStatus === "missing"
                    ? "Chưa đăng ký Passkey"
                    : passkeyStatus === "unsupported"
                      ? "Thiết bị chưa hỗ trợ"
                      : "Đang kiểm tra Passkey…"}
              </strong>
              <p>
                {passkeyStatus === "registered"
                  ? "Nếu muốn thay đổi Passkey, vui lòng liên hệ Admin. Mỗi lần chấm công cần xác thực Passkey trước khi mở camera."
                  : passkeyStatus === "missing"
                    ? "Đăng ký Passkey theo chính sách của Trung tâm trước khi chấm công."
                    : passkeyStatus === "unsupported"
                      ? "Hãy dùng trình duyệt hỗ trợ WebAuthn trên HTTPS."
                      : "Đang kết nối máy chủ xác thực."}
              </p>
            </div>
            {passkeyStatus === "registered" ? (
              <CheckCircle2 className="hbm-attendance__passkey-ok" size={26} />
            ) : passkeyStatus === "missing" ? (
              <button
                type="button"
                className="hbm-attendance__passkey-register"
                disabled={busy || passkeyBusy}
                onClick={() => void registerPasskey()}
              >
                <Fingerprint size={17} />{" "}
                {passkeyBusy ? "Đang đăng ký…" : "Đăng ký Passkey"}
              </button>
            ) : null}
          </div>
        </section>
        <div className="hbm-attendance__section-heading">
          <h2>Chấm công hôm nay</h2>
          <span>2 lượt/ngày · Vào sáng – Ra chiều</span>
        </div>
        {(["morning", "afternoon"] as const).map((shift) => {
          const am = shift === "morning";
          const action: Action = am ? "checkIn" : "checkOut";
          const entry = daily[shift][action];
          const canStart = am || !!daily.morning.checkIn;
          return (
            <section key={shift} className={`hbm-attendance__shift ${entry ? "hbm-attendance__shift--done" : ""}`}>
              <div className="hbm-attendance__shift-head">
                <div className={`hbm-attendance__shift-icon ${am ? "hbm-attendance__shift-icon--am" : "hbm-attendance__shift-icon--pm"}`}>
                  {am ? <Sun size={25} /> : <Sunset size={25} />}
                </div>
                <div className="hbm-attendance__shift-label">
                  <strong>{am ? "Chấm vào buổi sáng" : "Chấm ra buổi chiều"}</strong>
                  <span>GPS + Passkey + SFace</span>
                </div>
                <span className={`hbm-attendance__status ${entry ? "hbm-attendance__status--done" : ""}`}>
                  {entry ? <><Check size={13} /> Hoàn thành</> : "Chưa chấm"}
                </span>
              </div>
              <div className="hbm-attendance__shift-actions">
                <div className="hbm-attendance__shift-bottom">
                  <div>
                    <small>{am ? "GIỜ VÀO SÁNG" : "GIỜ RA CHIỀU"}</small>
                    <strong className="hbm-attendance__timestamp">{clock(entry?.recordedAt)}</strong>
                  </div>
                  <button type="button"
                    disabled={busy || !!entry || !canStart || passkeyStatus !== "registered"}
                    onClick={() => void begin(shift, action)}>
                    {entry ? <><CheckCircle2 size={18} /> Đã ghi nhận</> :
                      <><ScanFace size={18} /> {am ? "Chấm vào" : "Chấm ra"}</>}
                  </button>
                </div>
              </div>
            </section>
          );
        })}
        {syncNote && (
          <div className="hbm-attendance__sync-note" role="status">
            <AlertCircle size={16} /> {syncNote}
          </div>
        )}
        {error && (
          <div
            className="hbm-attendance__notice hbm-attendance__notice--error"
            role="alert"
          >
            <AlertCircle size={19} />
            {error}
            <button onClick={() => setError("")} aria-label="Đóng">
              <X size={17} />
            </button>
          </div>
        )}
        {success && (
          <div
            className="hbm-attendance__notice hbm-attendance__notice--success"
            role="status"
          >
            <CheckCircle2 size={19} />
            {success}
            <button onClick={() => setSuccess("")} aria-label="Đóng">
              <X size={17} />
            </button>
          </div>
        )}
        <div className="hbm-attendance__footer-actions">
          <button disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={16} /> Làm mới
          </button>
        </div>
        <footer className="hbm-attendance__footer">
          <ShieldCheck size={15} /> Dữ liệu chấm công được xác nhận và ghi nhận
          tại máy chủ.
        </footer>
      </div>
      {phase && (
        <div
          className="hbm-attendance__overlay hbm-face-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Quy trình xác thực chấm công"
        >
          <div className="hbm-face-panel">
            {phase === "camera" ? (
              <>
                <div className="hbm-face-panel-head">
                  <span>
                    <ShieldCheck size={17} /> XÁC THỰC KHUÔN MẶT
                  </span>
                  <button
                    type="button"
                    aria-label="Đóng camera"
                    onClick={close}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="hbm-face-live">
                  <span className="hbm-face-live-dot" /> CAMERA TRỰC TIẾP{" "}
                  <span className="hbm-face-live-count">Tự động xác thực</span>
                </div>
                <div className="hbm-face-camera-stage">
                  <video
                    ref={video}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => setCameraReady(true)}
                  />
                  <div className="hbm-face-dim" />
                  <div className="hbm-face-oval">
                    <span className="hbm-face-corner hbm-face-corner-a" />
                    <span className="hbm-face-corner hbm-face-corner-b" />
                    <span className="hbm-face-corner hbm-face-corner-c" />
                    <span className="hbm-face-corner hbm-face-corner-d" />
                  </div>
                  <span className="hbm-face-camera-hint">
                    Giữ khuôn mặt trong khung tròn
                  </span>
                </div>
                <div className="hbm-face-guidance">
                  <div className="hbm-face-guide-icon">
                    <ScanFace size={25} />
                  </div>
                  <span className="hbm-face-eyebrow">NHẬN DIỆN TỰ ĐỘNG</span>
                  <h2>Nhìn thẳng vào camera</h2>
                  <p role="status">
                    {cameraReady ? scanNote : "Đang khởi động camera…"}
                  </p>
                </div>
                <div className="hbm-face-actions-panel">
                  <button
                    type="button"
                    className="hbm-face-secondary"
                    onClick={close}
                  >
                    Hủy xác thực
                  </button>
                </div>
                <p className="hbm-face-disclaimer">
                  Không cần bấm chụp. AI phía máy chủ quyết định kết quả; khung
                  tròn không phải chức năng chống giả mạo.
                </p>
              </>
            ) : (
              <div className="hbm-face-wait">
                <div className="hbm-attendance__scanner">
                  <div className="hbm-attendance__scanner-ring" />
                  <div className="hbm-attendance__scanner-ring hbm-attendance__scanner-ring--second" />
                  <div className="hbm-attendance__scanner-core">
                    <ScanFace size={52} />
                  </div>
                </div>
                <span className="hbm-attendance__verify-eyebrow">
                  {phase === "gps"
                    ? "VÒNG 1 · GPS"
                    : phase === "passkey"
                      ? "VÒNG 2 · PASSKEY"
                      : "VÒNG 3 · SFACE"}
                </span>
                <h2>
                  {phase === "gps"
                    ? "Đang xác minh GPS…"
                    : phase === "passkey"
                      ? "Xác thực Passkey…"
                      : "Đang đối chiếu khuôn mặt…"}
                </h2>
                <p>
                  {phase === "verify"
                    ? verifyNote
                    : phase === "passkey"
                      ? passkeyNote
                      : "Vui lòng chờ máy chủ xác nhận."}
                </p>
                {phase === "passkey" && (
                  <button
                    type="button"
                    className="hbm-face-secondary"
                    onClick={close}
                  >
                    Hủy xác thực
                  </button>
                )}
                <div className="hbm-attendance__verify-dots">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {result && (
        <div
          className={`hbm-attendance__overlay ${result.ok ? "" : "hbm-attendance__overlay--error"}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="hbm-attendance__verify">
            <div
              className={`hbm-attendance__result-circle ${result.ok ? "hbm-attendance__result-circle--success" : "hbm-attendance__result-circle--error"}`}
            >
              {result.ok ? (
                <CheckCircle2 size={100} color="#0F704A" strokeWidth={2.5} />
              ) : (
                <X size={100} color="#168B5C" strokeWidth={2.5} />
              )}
            </div>
            <h2>{result.title}</h2>
            <p>{result.detail}</p>
          </div>
        </div>
      )}
    </main>
  );
}
