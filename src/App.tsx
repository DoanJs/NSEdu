import {
  onAuthStateChanged,
  signOut,
  updateProfile,
  User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from "./components";
import { handleToastWarn } from "./constants/handleToast";
import { ADMINID } from "./constants/info";
import { auth, db, functions } from "./firebase.config";
import AdminScreen from "./screens/admin/AdminScreen";
import ForgotPasswordBootstrapGreen from "./screens/auth/ForgotPasswordScreen";
import LoginBootstrapGreen from "./screens/auth/LoginScreen";
import RegisterBootstrapGreen from "./screens/auth/RegisterScreen";
import GoalBankBootstrapGreen from "./screens/bank/Bank";
import GoalCartBootstrapGreen from "./screens/cart/Cart";
import ChangePassword from "./screens/dashboard/ChangePassword";
import DashboardBootstrapGreen from "./screens/dashboard/DashBoard";
import PendingApprovalBootstrapGreen from "./screens/pending/Pendings";
import PlanDetailBootstrapGreen from "./screens/plan/PlanDetails";
import ApprovedPlansBootstrapGreen from "./screens/plan/Plans";
import AddReportBootstrapGreen from "./screens/report/AddReport";
import ReportDetailBootstrapGreen from "./screens/report/ReportDetails";
import ApprovedReportBootstrapGreen from "./screens/report/Reports";
import ScrollButtons from "./screens/scroll/ScrollButtons";
import SplashScreen from "./screens/splash/SplashScreen";
import { useUserStore } from "./zustand";
import UserSettingPage from "./screens/setting/Setting";
import { usePresence } from "./hooks/usePresence";
import DocumentUpload from "./screens/document/demo/DocumentUpload";
import TeachingAttendancePage from "./screens/TeachingAttendance/main/TeachingAttendancePage_BT_TongHop_Card";
import Violation from "./screens/violation/other/Violation_ImageFullscreen";
import TeacherEvaluationRoute from "./screens/TeacherEvaluation/TeacherEvaluationRoute";
import { FaceEnrollmentPage } from "./screens/FaceEnrollment";
import NotFoundPage from "./screens/notfound404/NotFoundPage";
import AttendancePage from "./screens/faceattendance/Attendance_2_luot_1_co_so/AttendancePage";
import HomeStudentsBootstrapGreen from "./screens/children/ChildrenScreen_updated";
import AdminTeachingPage from "./screens/admin/AdminTeaching/new/AdminTeachingPage";
import { AdminAttendancePage } from "./screens/admin/AdminAttendance_2_luo_1_co_so";
import ChildrenMonthlyHoursPage from "./screens/TeachingAttendance/Total/ChildrenMonthlyHoursPage";
import UserSettingPageAvatar from "./screens/setting/UserSettingPageAvatar";
import ChangePasswordAvatar from "./screens/dashboard/ChangePasswordAvatar";

type AuthState = {
  user: User | null;
  isLoading: boolean;
};

export default function App() {
  usePresence();

  const { setUser, user } = useUserStore();
  const isAdmin = user&&user.role === "admin"
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
  });

  const [progress, setProgress] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  // Progress 0 -> 90% trong 3 giây
  useEffect(() => {
    if (authReady) return;

    const duration = 1200;
    const maxProgress = 99;
    const intervalTime = 16;

    const step = maxProgress / (duration / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= maxProgress) return maxProgress;
        return Math.min(prev + step, maxProgress);
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [authReady]);

  // Check auth + load user profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          const userRef = doc(db, "users", currentUser.uid);

          const result = await getDoc(userRef);

          if (!result.exists()) {
            await signOut(auth);

            handleToastWarn(
              "Tài khoản chưa được cấp quyền, vui lòng liên hệ admin!",
            );

            setUser(null);

            setAuthState({
              user: null,
              isLoading: false,
            });

            return;
          }

          setUser({
            ...result.data(),
            id: currentUser.uid,
          } as any);

          setAuthState({
            user: currentUser,
            isLoading: false,
          });
        } else {
          setUser(null);

          setAuthState({
            user: null,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error("Auth error:", error);

        setUser(null);

        setAuthState({
          user: null,
          isLoading: false,
        });
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, [setUser]);

  // Khi auth xong => lên 100% rồi vào app
  useEffect(() => {
    if (!authReady) return;

    setProgress(100);

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [authReady]);

  if (showSplash || authState.isLoading) {
    return <SplashScreen progress={Math.round(progress)} centerName="" />;
  }

  return (
    <div>
      <ScrollButtons />

      <Routes>
        <Route
          path="/login"
          element={
            authState.user ? (
              <Navigate to="/" replace />
            ) : (
              <LoginBootstrapGreen />
            )
          }
        />
        <Route
          path="/"
          element={
            authState.user ? (
              <HomeStudentsBootstrapGreen />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Cả CTV cũng điểm danh */}
        <Route
          path="/attendance"
          element={
            authState.user ? (
              <AttendancePage
                auth={auth}
                db={db}
                functions={functions}
                logoSrc="/NSXEdu-icon-512x512.png"
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/faceenrollment"
          element={
            isAdmin ? (
              <FaceEnrollmentPage
                auth={auth}
                db={db}
                functions={functions}
                logoSrc="/NSXEdu-icon-512x512.png"
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/adminattendance"
          element={
            isAdmin ? (
              <AdminAttendancePage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/violation" element={<Violation />} />

        <Route
          path="/teachingattendance"
          element={
            user && user.position !== "Cộng tác viên" ? (
              <TeachingAttendancePage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/children-monthly-hours"
          element={
            isAdmin ? (
              <ChildrenMonthlyHoursPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/adminteachingattendance"
          element={
            isAdmin ? (
              <AdminTeachingPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="teacherevaluation"
          element={
            user && user.position !== "Cộng tác viên" ? (
              <TeacherEvaluationRoute />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route path="home/:id" element={<DashboardBootstrapGreen />}>
          <Route
            path="bank"
            element={
              isAdmin ? (
                <GoalBankBootstrapGreen />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          <Route path="documentupload" element={<DocumentUpload />} />
          <Route path="plan" element={<ApprovedPlansBootstrapGreen />} />
          <Route path="plandetail" element={<PlanDetailBootstrapGreen />} />
          <Route path="report" element={<ApprovedReportBootstrapGreen />} />
          <Route path="reportdetail" element={<ReportDetailBootstrapGreen />} />
          <Route path="addreport" element={<AddReportBootstrapGreen />} />
          <Route path="pending" element={<PendingApprovalBootstrapGreen />} />
          <Route path="cart" element={
              isAdmin ? (
                <GoalCartBootstrapGreen />
              ) : (
                <Navigate to="/" replace />
              )
            }/>
          <Route path="changepassword" element={<ChangePassword />} />
          <Route path="setting" element={<UserSettingPage />} />
          <Route
            path="admin"
            element={
              isAdmin ? (
                <AdminScreen />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Route>
        <Route
          path="register"
          element={
            isAdmin ? (
              <RegisterBootstrapGreen />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="setting"
          element={
            user ? <UserSettingPageAvatar /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="changepassword"
          element={
            user ? <ChangePasswordAvatar /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="forgotPassword"
          element={<ForgotPasswordBootstrapGreen />}
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <ToastContainer />
    </div>
  );
}
