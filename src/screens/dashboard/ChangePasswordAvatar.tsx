import { useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "../../firebase.config";
import {
  handleToastError,
  handleToastSuccess,
} from "../../constants/handleToast";
import LoadingOverlay from "../../components/LoadingOverLay";

type PasswordKey = "currentPassword" | "newPassword" | "confirmPassword";
type PasswordForm = Record<PasswordKey, string>;
const EMPTY_FORM: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function ChangePasswordScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState<PasswordForm>({ ...EMPTY_FORM });
  const [visible, setVisible] = useState<Record<PasswordKey, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Trang đổi mật khẩu được mở từ Cài đặt: trở về Cài đặt và giữ state điều hướng.
  // Ví dụ route: /settings/changepassword -> /settings.
  // const goBack = () =>
  //   navigate("..", {
  //     relative: "path",
  //     replace: true,
  //     state: location.state,
  //   });
  const goBack = () => {
    navigate(-1);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const name = e.target.name as PasswordKey;
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
  };

  const toggleVisible = (name: PasswordKey) => {
    setVisible((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const validate = (): string | null => {
    if (!form.currentPassword) return "Vui lòng nhập mật khẩu hiện tại.";
    if (!form.newPassword) return "Vui lòng nhập mật khẩu mới.";
    if (!form.confirmPassword) return "Vui lòng xác nhận mật khẩu mới.";
    if (form.currentPassword.length < 6)
      return "Mật khẩu hiện tại không hợp lệ.";
    if (form.newPassword.length < 8)
      return "Mật khẩu mới phải có ít nhất 8 ký tự.";
    if (!/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) {
      return "Mật khẩu mới phải chứa cả chữ và số.";
    }
    if (form.newPassword === form.currentPassword)
      return "Mật khẩu mới không được trùng mật khẩu hiện tại.";
    if (form.newPassword !== form.confirmPassword)
      return "Xác nhận mật khẩu không khớp.";
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;
    const errorMessage = validate();
    if (errorMessage) {
      handleToastError(errorMessage);
      return;
    }
    const user = auth.currentUser;
    if (!user?.email) {
      handleToastError("Không tìm thấy tài khoản đăng nhập.");
      return;
    }
    setIsLoading(true);
    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        form.currentPassword,
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, form.newPassword);
      setForm({ ...EMPTY_FORM });
      setVisible({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });
      handleToastSuccess("Đổi mật khẩu thành công!");
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (
        ["auth/wrong-password", "auth/invalid-credential"].includes(code || "")
      ) {
        handleToastError("Mật khẩu hiện tại không đúng.");
      } else if (code === "auth/weak-password") {
        handleToastError("Mật khẩu mới quá yếu.");
      } else if (code === "auth/too-many-requests") {
        handleToastError("Thao tác quá nhiều lần. Vui lòng thử lại sau.");
      } else if (code === "auth/network-request-failed") {
        handleToastError("Không thể kết nối mạng. Vui lòng thử lại.");
      } else {
        handleToastError("Không thể đổi mật khẩu. Vui lòng thử lại.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fields: {
    key: PasswordKey;
    label: string;
    placeholder: string;
    icon: string;
    autoComplete: string;
  }[] = [
    {
      key: "currentPassword",
      label: "Mật khẩu hiện tại",
      placeholder: "Nhập mật khẩu hiện tại",
      icon: "bi-lock",
      autoComplete: "current-password",
    },
    {
      key: "newPassword",
      label: "Mật khẩu mới",
      placeholder: "Nhập mật khẩu mới",
      icon: "bi-shield-lock",
      autoComplete: "new-password",
    },
    {
      key: "confirmPassword",
      label: "Xác nhận mật khẩu mới",
      placeholder: "Nhập lại mật khẩu mới",
      icon: "bi-check-circle",
      autoComplete: "new-password",
    },
  ];

  return (
    <div className="hb-change-password-page">
      <style>{styles}</style>
      <div className="hb-change-password-wrap">
        <header className="hb-change-password-header">
          <button
            type="button"
            className="hb-cp-back"
            onClick={goBack}
            aria-label="Quay lại trang cài đặt"
            title="Quay lại"
          >
            <i className="bi bi-arrow-left" aria-hidden="true" />
          </button>
          <h1>Đổi mật khẩu</h1>
        </header>

        <form
          className="hb-change-password-card"
          onSubmit={handleSubmit}
          noValidate
        >
          {fields.map(({ key, label, placeholder, icon, autoComplete }) => (
            <div className="hb-cp-field" key={key}>
              <label htmlFor={`hb-cp-${key}`}>{label}</label>
              <div className="hb-cp-input-wrap">
                <i
                  className={`bi ${icon} hb-cp-field-icon`}
                  aria-hidden="true"
                />
                <input
                  id={`hb-cp-${key}`}
                  name={key}
                  type={visible[key] ? "text" : "password"}
                  value={form[key]}
                  onChange={onChange}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="hb-cp-visibility"
                  onClick={() => toggleVisible(key)}
                  aria-label={
                    visible[key]
                      ? `Ẩn ${label.toLowerCase()}`
                      : `Hiện ${label.toLowerCase()}`
                  }
                  aria-pressed={visible[key]}
                >
                  <i
                    className={`bi ${visible[key] ? "bi-eye-slash" : "bi-eye"}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
              {key === "newPassword" && (
                <span className="hb-cp-hint">
                  Ít nhất 8 ký tự, bao gồm chữ và số.
                </span>
              )}
            </div>
          ))}
          <div className="hb-cp-actions">
            <button
              type="button"
              className="hb-cp-cancel"
              onClick={goBack}
              disabled={isLoading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="hb-cp-submit"
              disabled={
                isLoading ||
                !Object.values(form).every((value) => value.length > 0)
              }
            >
              <i className="bi bi-check2-circle" aria-hidden="true" />
              Cập nhật mật khẩu
            </button>
          </div>
        </form>
      </div>
      <LoadingOverlay show={isLoading} />
    </div>
  );
}

const styles = `
.hb-change-password-page {
  --cp-green: #821c1c;
  --cp-deep: #471616;
  --cp-line: #e8dcdd;
  --cp-muted: #846868;
  box-sizing: border-box;
  min-height: 100dvh;
  width: 100%;
  padding: clamp(20px, 4vw, 48px) clamp(16px, 4vw, 56px);
  background: #faf6f7;
  color: var(--cp-deep);
}
.hb-change-password-page *, .hb-change-password-page *::before, .hb-change-password-page *::after { box-sizing: border-box; }
.hb-change-password-wrap { width: 100%; max-width: 560px; margin: 0 auto; }
.hb-change-password-header { display: flex; align-items: center; gap: 14px; margin: 0 0 20px; }
.hb-change-password-header h1 { margin: 0; color: var(--cp-deep); font-size: clamp(22px, 2.6vw, 28px); font-weight: 800; line-height: 1.25; }
.hb-cp-back { width: 44px; height: 44px; flex: 0 0 44px; display: grid; place-items: center; border: 1px solid var(--cp-line); border-radius: 13px; background: white; color: var(--cp-green); cursor: pointer; }
.hb-cp-back i { font-size: 21px; }
.hb-cp-back:hover { background: #f7eeef; }
.hb-change-password-card { padding: 28px; background: white; border: 1px solid var(--cp-line); border-radius: 20px; box-shadow: 0 8px 24px rgba(81,22,22, .045); }
.hb-cp-field { margin-bottom: 20px; }
.hb-cp-field label { display: block; margin-bottom: 8px; font-size: 15px; font-weight: 700; color: var(--cp-deep); }
.hb-cp-input-wrap { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 9px 0 15px; border: 1px solid #e4d5d6; border-radius: 12px; background: #fff; transition: border-color .2s, box-shadow .2s; }
.hb-cp-input-wrap:focus-within { border-color: var(--cp-green); box-shadow: 0 0 0 3px rgba(130,28,28, .10); }
.hb-cp-field-icon { color: var(--cp-green); font-size: 17px; }
.hb-cp-input-wrap input { flex: 1; min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; font-size: 15px; font-weight: 500; color: #3a1919; }
.hb-cp-input-wrap input::placeholder { color: #aa9294; opacity: 1; }
.hb-cp-visibility { width: 36px; height: 36px; flex: 0 0 36px; display: grid; place-items: center; border: 0; border-radius: 9px; background: transparent; color: #825f5f; cursor: pointer; }
.hb-cp-visibility:hover { background: #f7eeef; }
.hb-cp-hint { display: block; margin-top: 6px; font-size: 12px; color: var(--cp-muted); }
.hb-cp-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 26px; }
.hb-cp-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; padding: 0 18px; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; }
.hb-cp-cancel { border: 1px solid var(--cp-line); background: white; color: #665151; }
.hb-cp-cancel:hover { background: #f8f4f5; }
.hb-cp-submit { border: 1px solid var(--cp-green); background: var(--cp-green); color: white; }
.hb-cp-submit:hover:not(:disabled) { background: #701616; }
.hb-cp-actions button:disabled { cursor: not-allowed; opacity: .5; }
.hb-cp-back:focus-visible, .hb-cp-visibility:focus-visible, .hb-cp-actions button:focus-visible { outline: 3px solid rgba(130,28,28,.28); outline-offset: 2px; }
@media (max-width: 600px) {
  .hb-change-password-page { padding: 18px 16px calc(28px + env(safe-area-inset-bottom)); }
  .hb-change-password-header { margin-bottom: 16px; gap: 12px; }
  .hb-change-password-header h1 { font-size: 23px; }
  .hb-change-password-card { padding: 20px 16px; border-radius: 16px; }
  .hb-cp-field { margin-bottom: 18px; }
  .hb-cp-actions { flex-direction: column-reverse; margin-top: 22px; }
  .hb-cp-actions button { width: 100%; min-height: 48px; }
}
`;
