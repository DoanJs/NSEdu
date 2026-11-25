import { useMemo } from "react";
import { useFirestoreWithMetaCondition } from "../../../constants/useFirestoreWithMetaCondition";
import { UserModel } from "../../../models";

interface Props {
  userId: string;
  value: string;
  onChange: (teacherId: string) => void;
}

export default function AdminTeacherSelect({ userId, value, onChange }: Props) {
  const { data, loading } = useFirestoreWithMetaCondition({
    key: `${userId}_teachersCache`,
    id: userId,
    metaDoc: "users",
    nameCollect: "users",
    condition: [],
  });

  const teachers = useMemo(() => {
    return [...((data ?? []) as UserModel[])].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, "vi"),
    );
  }, [data]);

  return (
    <label className="ta-teacher">
      Giáo viên:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
      >
        <option value="all">Tất cả giáo viên</option>

        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}
