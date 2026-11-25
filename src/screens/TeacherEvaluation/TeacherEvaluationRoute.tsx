import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase.config";
import TeacherEvaluation from "./teacher-evaluation/TeacherEvaluation";

type Role = "teacher" | "manager" | "admin";

export default function TeacherEvaluationRoute() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let version = 0;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const currentVersion = ++version;
      setLoading(true);
      setUser(null);
      setRole(null);
      setError("");
      if (!currentUser) {
        setLoading(false);
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, "users", currentUser.uid));
        if (currentVersion !== version) return;
        const rawRole = snapshot.exists() ? snapshot.data().role : null;
        if (rawRole !== "teacher" && rawRole !== "manager" && rawRole !== "admin") {
          setError("Tài khoản không có quyền truy cập đánh giá giáo viên.");
          return;
        }
        // Truyền role thật để chỉ admin được mở khóa phiếu.
        setRole(rawRole);
        setUser(currentUser);
      } catch (e) {
        if (currentVersion === version) {
          console.error(e);
          setError("Không thể kiểm tra quyền tài khoản.");
        }
      } finally {
        if (currentVersion === version) setLoading(false);
      }
    });
    return () => { version++; unsubscribe(); };
  }, []);

  if (loading) return <div>Đang kiểm tra tài khoản...</div>;
  if (error) return <div role="alert">{error}</div>;
  if (!user || !role) return null;
  return <TeacherEvaluation db={db} user={user} role={role} />;
}
