import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { collection, getDocs, query, where } from "firebase/firestore";
import type { Functions } from "firebase/functions";
import { httpsCallable } from "firebase/functions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./faceEnrollment.css";
import { Link } from "react-router-dom";

type Teacher = {
  uid: string;
  name: string;
  email?: string;
  avatar?: string;
  role: string;
};
type EnrollmentResult = { ok: boolean };
type Stage = "idle" | "camera" | "preview" | "saving" | "done";
export interface FaceEnrollmentPageProps {
  auth: Auth;
  db: Firestore;
  functions: Functions; // phải là instance vùng asia-southeast1
  onBack?: () => void;
  logoSrc?: string;
}
const getMessage = (error: unknown) => {
  const e = error as { code?: string; message?: string };
  if (e?.code?.includes("permission-denied"))
    return "Tài khoản không có quyền đăng ký khuôn mặt. Kiểm tra users/{uid}.role và Firestore Rules.";
  if (e?.code?.includes("unauthenticated")) return "Vui lòng đăng nhập lại.";
  if (e?.code?.includes("failed-precondition"))
    return (
      e.message || "Không nhận diện được khuôn mặt. Vui lòng thử ảnh khác."
    );
  if (e?.code?.includes("unavailable"))
    return "Dịch vụ AI chưa sẵn sàng. Vui lòng thử lại.";
  return e?.message || "Có lỗi xảy ra. Vui lòng thử lại.";
};

export default function FaceEnrollmentPage({
  auth,
  db,
  functions,
  onBack,
  logoSrc,
}: FaceEnrollmentPageProps) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [faceStatuses, setFaceStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [stage, setStage] = useState<Stage>("idle");
  const [image, setImage] = useState<string>("");
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const teacher = teachers.find((t) => t.uid === selected);
  const filtered = useMemo(
    () =>
      teachers.filter((t) =>
        `${t.name} ${t.email || ""}`
          .toLocaleLowerCase("vi")
          .includes(search.toLocaleLowerCase("vi")),
      ),
    [teachers, search],
  );
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error("Vui lòng đăng nhập.");
        const adminDoc = await import("firebase/firestore").then((m) =>
          m.getDoc(m.doc(db, "users", uid)),
        );
        if (adminDoc.data()?.role !== "admin")
          throw new Error("Chỉ Admin được truy cập trang đăng ký khuôn mặt.");
        const snap = await getDocs(
          query(collection(db, "users"), where("role", "==", "teacher")),
        );
        const rows = snap.docs
          .map((d) => {
            const x = d.data();
            return {
              uid: d.id,
              name: String(
                x.fullName || x.displayName || x.name || x.email || d.id,
              ),
              email: typeof x.email === "string" ? x.email : undefined,
              avatar:
                typeof x.avatar === "string"
                  ? x.avatar
                  : typeof x.photoURL === "string"
                    ? x.photoURL
                    : undefined,
              role: "teacher",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "vi"));
        let statuses: Record<string, boolean> = {};

        try {
          const getStatuses = httpsCallable<
            Record<string, never>,
            { profiles: { uid: string; active: boolean }[] }
          >(functions, "getFaceEnrollmentStatuses");

          const statusResult = await getStatuses({});

          statusResult.data.profiles.forEach((p) => {
            statuses[p.uid] = p.active;
          });
        } catch (error) {
          console.error("Không tải được trạng thái Face ID:", error);
        }

        if (active) {
          setTeachers(rows);
          setFaceStatuses(statuses);
          setSelected((s) => s || rows[0]?.uid || "");
        }
      } catch (e) {
        if (active) setLoadError(getMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [auth, db, functions]);
  const selectTeacher = (uid: string) => {
    if (stage === "saving") return;
    stopCamera();
    setSelected(uid);
    setStage("idle");
    setImage("");
    setError("");
    setConsent(false);
  };
  const openCamera = async () => {
    if (!teacher) return;
    setError("");
    setCameraBusy(true);
    stopCamera();
    setImage("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Thiết bị hoặc trình duyệt không hỗ trợ camera. Hãy sử dụng HTTPS.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setStage("camera");
    } catch (e) {
      setError(getMessage(e));
      setStage("idle");
    } finally {
      if (mountedRef.current) setCameraBusy(false);
    }
  };
  useEffect(() => {
    if (stage !== "camera" || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current
      .play()
      .catch(() =>
        setError("Không thể phát camera. Vui lòng cấp quyền camera."),
      );
  }, [stage]);
  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth) {
      setError("Camera chưa sẵn sàng, vui lòng đợi một chút.");
      return;
    }
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Không thể xử lý ảnh.");
      return;
    }
    // Ảnh gốc không lật, chỉ preview camera được lật gương.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.86);
    stopCamera();
    setImage(data);
    setStage("preview");
    setError("");
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp hình ảnh.");
      return;
    }
    if (file.size > 12_000_000) {
      setError("Ảnh nguồn tối đa 12MB.");
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Không đọc được ảnh."));
        img.src = url;
      }).finally(() => URL.revokeObjectURL(url));
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Không thể xử lý ảnh.");
      const scale = Math.min(
        1,
        960 / img.naturalWidth,
        960 / img.naturalHeight,
      );
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Không thể xử lý ảnh.");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.83);
      if (data.length > 2_100_000)
        throw new Error("Ảnh vẫn quá lớn. Vui lòng chọn ảnh nhỏ hơn.");
      stopCamera();
      setImage(data);
      setStage("preview");
    } catch (e) {
      setError(getMessage(e));
    }
  };
  const submit = async () => {
    if (!teacher || !image || !consent || stage === "saving") return;
    setStage("saving");
    setError("");

    const user = auth.currentUser;

    if (!user) {
      throw new Error("Bạn chưa đăng nhập Firebase.");
    }

    const token = await user.getIdToken(true);

    console.log("Firebase UID:", user.uid);
    console.log("Token tồn tại:", Boolean(token));

    try {
      const fn = httpsCallable<
        { targetUid: string; imageData: string },
        EnrollmentResult
      >(functions, "enrollFaceAttendance");
      const result = await fn({ targetUid: teacher.uid, imageData: image });
      if (result.data?.ok !== true)
        throw new Error("Máy chủ chưa xác nhận đăng ký thành công.");
      setFaceStatuses((prev) => ({
  ...prev,
  [teacher.uid]: true,
}));

      setImage("");
      setStage("done");
      setConsent(false);
    } catch (e) {
      setError(getMessage(e));
      setStage("preview");
    }
  };
  const reset = () => {
    stopCamera();
    setStage("idle");
    setImage("");
    setError("");
    setConsent(false);
  };
  return (
    <div className="hbm-enroll">
      <header className="hbm-enroll__top">
        <div className="hbm-enroll__brand">
         <Link to='/'> {logoSrc ? (
            <img src={logoSrc} alt="Logo NSX - Education" />
          ) : (
            <span className="hbm-enroll__flower">✿</span>
          )}</Link>
          <div>
            <strong>NSX - Education</strong>
            <small>Can thiệp sớm cho trẻ có nhu cầu đặc biệt</small>
          </div>
        </div>
        <div className="hbm-enroll__topright">
          <span className="hbm-enroll__admin">Quản trị hệ thống</span>
          {onBack && (
            <button type="button" className="hbm-enroll__back" onClick={onBack}>
              ← Quay lại
            </button>
          )}
        </div>
      </header>
      <main className="hbm-enroll__main">
        <div className="hbm-enroll__hero">
          <div className="hbm-enroll__heroicon">▣</div>
          <div>
            <h1>Đăng ký khuôn mặt giáo viên</h1>
            <p>
              Thiết lập dữ liệu nhận diện để chấm công bằng GPS và khuôn mặt.
            </p>
          </div>
          <span className="hbm-enroll__heroart" aria-hidden="true">
            ✿ ♡ ✿
          </span>
        </div>
        <div className="hbm-enroll__steps" aria-label="Các bước đăng ký">
          {[
            "Chọn giáo viên",
            "Chụp khuôn mặt",
            "AI xử lý dữ liệu",
            "Hoàn thành",
          ].map((x, i) => (
            <div
              className={
                "hbm-enroll__step " +
                ((
                  stage === "done"
                    ? i <= 3
                    : i === 0 ||
                      (i === 1 && stage !== "idle") ||
                      (i === 2 && stage === "saving")
                )
                  ? "is-active"
                  : "")
              }
              key={x}
            >
              <b>{i + 1}</b>
              <span>{x}</span>
            </div>
          ))}
        </div>
        <div className="hbm-enroll__layout">
          <section className="hbm-enroll__panel hbm-enroll__teachers">
            <h2>
              <span>♙</span> Chọn giáo viên
            </h2>
            <label className="hbm-enroll__search">
              <span>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc email..."
                aria-label="Tìm giáo viên"
              />
            </label>
            {loading ? (
              <p className="hbm-enroll__muted">
                Đang tải danh sách giáo viên...
              </p>
            ) : loadError ? (
              <p className="hbm-enroll__error" role="alert">
                {loadError}
              </p>
            ) : filtered.length === 0 ? (
              <p className="hbm-enroll__muted">
                Không tìm thấy giáo viên có role "teacher".
              </p>
            ) : (
              <div className="hbm-enroll__teacherlist">
                {filtered.map((t) => (
                  <button
                    type="button"
                    key={t.uid}
                    disabled={stage === "saving"}
                    onClick={() => selectTeacher(t.uid)}
                    className={
                      "hbm-enroll__teacher " +
                      (selected === t.uid ? "is-selected" : "")
                    }
                  >
                    <span className="hbm-enroll__avatar">
                      {t.avatar ? (
                        <img src={t.avatar} alt="" />
                      ) : (
                        t.name.slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="hbm-enroll__teacherinfo">
                      <strong>{t.name}</strong>
                      <small>Giáo viên</small>
                    </span>
                    <span aria-hidden="true">
                      {selected === t.uid ? "✓" : "›"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <div className="hbm-enroll__right">
            <section className="hbm-enroll__panel">
              <h2>
                <span>▣</span> Chụp khuôn mặt
              </h2>
              <div className="hbm-enroll__capturegrid">
                <div className="hbm-enroll__captureleft">
                  <div className="hbm-enroll__view">
                    {stage === "camera" ? (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="hbm-enroll__video"
                        />
                        <div className="hbm-enroll__oval" aria-hidden="true" />
                        <span className="hbm-enroll__viewhint">
                          Đặt khuôn mặt vào khung hình
                        </span>
                      </>
                    ) : image ? (
                      <img
                        className="hbm-enroll__preview"
                        src={image}
                        alt="Ảnh khuôn mặt chuẩn bị đăng ký"
                      />
                    ) : stage === "done" ? (
                      <div className="hbm-enroll__empty">
                        <span className="hbm-enroll__successicon">✓</span>
                        <strong>Đăng ký thành công</strong>
                        <small>
                          Dữ liệu khuôn mặt đã được lưu an toàn trong hồ sơ.
                        </small>
                      </div>
                    ) : (
                      <div className="hbm-enroll__empty">
                        <span>◎</span>
                        <strong>Chuẩn bị đăng ký khuôn mặt</strong>
                        <small>
                          Chọn giáo viên rồi mở camera hoặc tải ảnh lên
                        </small>
                      </div>
                    )}
                  </div>
                  <div className="hbm-enroll__actions">
                    {stage === "camera" ? (
                      <>
                        <button
                          type="button"
                          className="hbm-enroll__primary"
                          onClick={capture}
                        >
                          ▣ Chụp ảnh
                        </button>
                        <button
                          type="button"
                          className="hbm-enroll__secondary"
                          onClick={reset}
                        >
                          Hủy
                        </button>
                      </>
                    ) : stage === "preview" ? (
                      <>
                        <button
                          type="button"
                          className="hbm-enroll__secondary"
                          onClick={() => void openCamera()}
                          disabled={cameraBusy}
                        >
                          ↻ Chụp lại
                        </button>
                        <button
                          type="button"
                          className="hbm-enroll__secondary"
                          onClick={() => fileRef.current?.click()}
                        >
                          Thay ảnh
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="hbm-enroll__primary"
                          onClick={() => void openCamera()}
                          disabled={
                            !teacher || cameraBusy || stage === "saving"
                          }
                        >
                          {cameraBusy ? "Đang mở..." : "▣ Mở camera"}
                        </button>
                        <button
                          type="button"
                          className="hbm-enroll__secondary"
                          onClick={() => fileRef.current?.click()}
                          disabled={!teacher || stage === "saving"}
                        >
                          ⇧ Tải ảnh lên
                        </button>
                      </>
                    )}
                  </div>
                  {stage === "preview" && (
                    <div className="hbm-enroll__submit">
                      <label>
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                        />{" "}
                        Tôi xác nhận đã thông báo mục đích sử dụng và có sự đồng
                        ý của giáo viên đối với việc đăng ký dữ liệu khuôn mặt.
                      </label>
                      <button
                        type="button"
                        className="hbm-enroll__primary"
                        disabled={!consent || !teacher}
                        onClick={() => void submit()}
                      >
                        Đăng ký khuôn mặt với AI →
                      </button>
                    </div>
                  )}
                  {stage === "saving" && (
                    <p className="hbm-enroll__notice" role="status">
                      Đang gửi ảnh đến AI và lưu hồ sơ, vui lòng chờ...
                    </p>
                  )}
                  {stage === "done" && (
                    <button
                      type="button"
                      className="hbm-enroll__secondary hbm-enroll__donebtn"
                      onClick={reset}
                    >
                      Đăng ký lại khuôn mặt
                    </button>
                  )}
                  {error && (
                    <p className="hbm-enroll__error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
                <aside className="hbm-enroll__guide">
                  <h3>◉ Hướng dẫn chụp ảnh</h3>
                  <p>✓ Nhìn thẳng vào camera</p>
                  <p>✓ Khuôn mặt rõ nét, đủ ánh sáng</p>
                  <p>✓ Không đeo khẩu trang, kính râm</p>
                  <p>✓ Chỉ một người trong khung hình</p>
                  <p>✓ Giữ mặt ở chính giữa ảnh</p>
                  <div className="hbm-enroll__privacy">
                    🔒 Ảnh được gửi tới AI qua Firebase. Chỉ dữ liệu đặc trưng
                    khuôn mặt được lưu trong hồ sơ giáo viên.
                  </div>
                </aside>
              </div>
            </section>
            <section className="hbm-enroll__panel hbm-enroll__details">
              <h2>
                <span>♙</span> Thông tin giáo viên
              </h2>
              {teacher ? (
                <div className="hbm-enroll__person">
                  <span className="hbm-enroll__avatar hbm-enroll__avatar--large">
                    {teacher.avatar ? (
                      <img src={teacher.avatar} alt="" />
                    ) : (
                      teacher.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div>
                    <strong>{teacher.name}</strong>
                    <small>Giáo viên</small>
                    <small
                      className={
                        faceStatuses[teacher.uid]
                          ? "hbm-face-status is-registered"
                          : "hbm-face-status is-unregistered"
                      }
                    >
                      {faceStatuses[teacher.uid]
                        ? "✓ Đã đăng ký Face ID"
                        : "○ Chưa đăng ký Face ID"}
                    </small>
                  </div>
                  <div className="hbm-enroll__email">
                    {teacher.email || "Chưa có email"}
                  </div>
                </div>
              ) : (
                <p className="hbm-enroll__muted">
                  Vui lòng chọn giáo viên để bắt đầu.
                </p>
              )}
            </section>
          </div>
        </div>
      </main>
      <canvas ref={canvasRef} style={{ display: "none" }} aria-hidden="true" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
