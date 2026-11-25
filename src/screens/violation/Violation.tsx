import {
  CalendarDays,
  Check,
  Clock3,
  Cloud,
  Filter,
  ImagePlus,
  Plus,
  Search,
  Shirt,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getDocsData } from "../../constants/firebase/getDocsData";
import { SpinnerComponent } from "../../components";
import { useUserStore } from "../../zustand";
import "./styles.css";

type Teacher = {
  id: string;
  fullName: string;
  shortName?: string;
  avatar?: string;
  role?: string;
  position?: string;
};

type ViolationType = "clothes" | "time";

type ViolationImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type ViolationForm = {
  date: string;
  types: ViolationType[];
  imgs: ViolationImage[];
  note: string;
};

type SavedViolation = {
  id: string;
  teacherId: string;
  date: string;
  types: ViolationType[];
  note: string;
  images: string[];
  createAt: number;
};

const getToday = (): string => new Date().toISOString().split("T")[0];

const createInitialForm = (): ViolationForm => ({
  date: getToday(),
  types: [],
  imgs: [],
  note: "",
});

function Violation() {
  const { user } = useUserStore();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | undefined>();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(getToday().slice(0, 7));
  const [violations, setViolations] = useState<SavedViolation[]>([]);
  const [form, setForm] = useState<ViolationForm>(createInitialForm);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;

    getDocsData({
      nameCollect: "users",
      setData: (data: Teacher[]) => {
        setTeachers(data);
        setSelectedTeacher((current) => current ?? data[0]);
      },
    });
  }, [user]);

  const filteredTeachers = useMemo(() => {
    const text = search.trim().toLowerCase();

    if (!text) return teachers;

    return teachers.filter((item) =>
      [item.fullName, item.shortName, item.id, item.role, item.position]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text),
    );
  }, [search, teachers]);

  const selectedTeacherViolations = useMemo(() => {
    if (!selectedTeacher?.id) return [];

    return violations.filter(
      (item) =>
        item.teacherId === selectedTeacher.id && item.date.startsWith(month),
    );
  }, [violations, selectedTeacher?.id, month]);

  const currentYear = String(new Date().getFullYear());

  const selectedTeacherYearViolations = useMemo(() => {
    if (!selectedTeacher?.id) return [];

    return violations.filter(
      (item) =>
        item.teacherId === selectedTeacher.id &&
        item.date.startsWith(currentYear),
    );
  }, [violations, selectedTeacher?.id, currentYear]);

  const monthLabel = month ? month.split("-").reverse().join("/") : "";

  const uniformCount = selectedTeacherViolations.filter((item) =>
    item.types.includes("clothes"),
  ).length;

  const lateCount = selectedTeacherViolations.filter((item) =>
    item.types.includes("time"),
  ).length;

  const revokeFormPreviewUrls = (images: ViolationImage[]) => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  };

  const resetForm = () => {
    revokeFormPreviewUrls(form.imgs);
    setForm(createInitialForm());

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSelectTeacher = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    resetForm();
  };

  const handleToggleType = (type: ViolationType) => {
    setForm((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((item) => item !== type)
        : [...prev.types, type],
    }));
  };

  const handleSelectImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );

    if (files.length === 0) return;

    const newImages: ViolationImage[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setForm((prev) => ({
      ...prev,
      imgs: [...prev.imgs, ...newImages],
    }));

    event.target.value = "";
  };

  const handleRemoveImage = (imageId: string) => {
    setForm((prev) => {
      const imageToRemove = prev.imgs.find((image) => image.id === imageId);

      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.previewUrl);
      }

      return {
        ...prev,
        imgs: prev.imgs.filter((image) => image.id !== imageId),
      };
    });
  };

  const handleSaveViolation = () => {
    if (!selectedTeacher?.id) {
      window.alert("Vui lòng chọn giáo viên trước khi lưu.");
      return;
    }

    if (!form.date) {
      window.alert("Vui lòng chọn ngày ghi nhận lỗi.");
      return;
    }

    if (form.types.length === 0) {
      window.alert("Vui lòng chọn ít nhất một loại lỗi.");
      return;
    }

    if (form.imgs.length === 0) {
      window.alert("Vui lòng thêm ít nhất một hình ảnh minh chứng.");
      return;
    }

    const newViolation: SavedViolation = {
      id: crypto.randomUUID(),
      teacherId: selectedTeacher.id,
      date: form.date,
      types: [...form.types],
      note: form.note.trim(),
      images: form.imgs.map((image) => image.previewUrl),
      createAt: Date.now(),
    };

    setViolations((prev) => [newViolation, ...prev]);
    setForm(createInitialForm());

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    window.alert("Đã lưu ghi nhận lỗi thành công.");
  };

  const handleDeleteViolation = (id: string) => {
    const isConfirmed = window.confirm(
      "Bạn có chắc chắn muốn xóa ghi nhận lỗi này?",
    );

    if (!isConfirmed) return;

    setViolations((prev) => prev.filter((item) => item.id !== id));
  };

  if (teachers.length === 0) return <SpinnerComponent />;

  return (
    <div className="content-grid">
      <section className="teacher-panel card">
        <div className="section-heading">
          <span>🌿</span>
          <h2>Danh sách giáo viên</h2>
          <Cloud className="soft-cloud" />
        </div>

        <div className="toolbar">
          <label className="search-box" style={{ padding: "10px" }}>
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm kiếm giáo viên..."
            />
          </label>

          <button type="button" className="filter-btn">
            <Filter size={17} />
            {filteredTeachers.length}
          </button>
        </div>

        <div className="teacher-table-wrap">
          <table className="teacher-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Họ và tên</th>
              </tr>
            </thead>

            <tbody>
              {filteredTeachers.map((teacher, index) => (
                <tr
                  key={teacher.id}
                  className={
                    selectedTeacher?.id === teacher.id ? "selected" : ""
                  }
                  onClick={() => handleSelectTeacher(teacher)}
                >
                  <td data-label="STT">{index + 1}</td>
                  <td data-label="Giáo viên">
                    <div className="teacher-cell">
                      <div
                        className={`avatar avatar-${(index % 5) + 1}`}
                        style={{ overflow: "hidden" }}
                      >
                        <img
                          src={teacher.avatar || "/HBMEdu-icon-512x512.png"}
                          alt={teacher.fullName}
                          style={{
                            height: "68px",
                            width: "68px",
                            objectFit: "cover",
                          }}
                        />
                      </div>

                      <div>
                        <strong>{teacher.fullName}</strong>
                        <small>{teacher.id}</small>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-panel card">
        <div className="profile-hero">
          <div className="profile-main">
            <div className="profile-avatar" style={{ overflow: "hidden" }}>
              <img
                src={
                  selectedTeacher?.avatar || "/HBMEdu-icon-512x512.png"
                }
                alt={selectedTeacher?.fullName || "Giáo viên"}
                style={{
                  height: "90px",
                  width: "90px",
                  objectFit: "cover",
                }}
              />
            </div>

            <div>
              <h2>{selectedTeacher?.fullName}</h2>
              <span className="teacher-tag">
                {selectedTeacher?.position ||
                  selectedTeacher?.role ||
                  "Giáo viên"}
              </span>
              <p>
                <UserCog size={16} /> Mã GV: {selectedTeacher?.id}
              </p>
            </div>
          </div>

          <div className="hero-cloud">☁</div>

          <StatCard
            label={`Tổng số lỗi trong tháng ${monthLabel}`}
            value={selectedTeacherViolations.length}
          />

          <StatCard
            label={`Tổng số lỗi trong năm ${currentYear}`}
            value={selectedTeacherYearViolations.length}
          />
        </div>

        <div className="violation-area">
          <div className="violation-topline">
            <h3>
              Ghi nhận lỗi <span>🌱</span>
            </h3>
          </div>

          <div className="month-row">
            <label>Chọn tháng</label>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </div>

          <div className="violation-table">
            <div className="violation-head">
              <span>Ngày / Loại lỗi</span>
              <span>Minh chứng (hình ảnh)</span>
              <span>Ghi chú</span>
              <span>Thao tác</span>
            </div>

            <div className="violation-row violation-form-row">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div className="date-cell">
                  <span className="mobile-field-label">Ngày ghi nhận</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        date: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="type-cell">
                  <span className="mobile-field-label">Loại lỗi</span>

                  <label>
                    <CheckBox
                      checked={form.types.includes("clothes")}
                      onClick={() => handleToggleType("clothes")}
                    />
                    <span>Sai đồng phục</span>
                    <Shirt size={18} className="pink" />
                  </label>

                  <label>
                    <CheckBox
                      checked={form.types.includes("time")}
                      onClick={() => handleToggleType("time")}
                    />
                    <span>Đi làm trễ</span>
                    <Clock3 size={18} className="navy" />
                  </label>
                </div>
              </div>

              <div className="evidence-wrap">
                <span className="mobile-field-label">Minh chứng</span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleSelectImages}
                />

                <div className="selected-images">
                  {form.imgs.map((image) => (
                    <div className="evidence" key={image.id}>
                      <img
                        src={image.previewUrl}
                        alt="Minh chứng lỗi"
                        className="evidence-preview"
                      />

                      <button
                        type="button"
                        className="remove-image"
                        onClick={() => handleRemoveImage(image.id)}
                        aria-label="Xóa ảnh"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="add-image-card"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus size={28} />
                    <span>Thêm ảnh</span>
                  </button>
                </div>
              </div>

              <div className="note-wrap">
                <span className="mobile-field-label">Ghi chú</span>
                <textarea
                  value={form.note}
                  placeholder="Nhập ghi chú..."
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      note: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="reset-btn"
                  onClick={resetForm}
                >
                  Nhập lại
                </button>

                <button
                  type="button"
                  className="save-btn"
                  onClick={handleSaveViolation}
                >
                  <Plus size={17} />
                  Lưu ghi nhận
                </button>
              </div>
            </div>

            {selectedTeacherViolations.map((item) => (
              <div
                className="violation-row saved-violation-row"
                key={item.id}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div className="date-cell">
                    <span className="mobile-field-label">Ngày ghi nhận</span>
                    <strong>{item.date}</strong>
                  </div>

                  <div className="type-cell">
                    <span className="mobile-field-label">Loại lỗi</span>

                    {item.types.includes("clothes") && (
                      <label>
                        <CheckBox checked />
                        <span>Sai đồng phục</span>
                        <Shirt size={18} className="pink" />
                      </label>
                    )}

                    {item.types.includes("time") && (
                      <label>
                        <CheckBox checked />
                        <span>Đi làm trễ</span>
                        <Clock3 size={18} className="navy" />
                      </label>
                    )}
                  </div>
                </div>

                <div className="evidence-wrap">
                  <span className="mobile-field-label">Minh chứng</span>
                  <div className="selected-images">
                    {item.images.map((imageUrl, index) => (
                      <div
                        className="evidence"
                        key={`${item.id}-${index}`}
                      >
                        <img
                          src={imageUrl}
                          alt={`Minh chứng ${index + 1}`}
                          className="evidence-preview"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="note-wrap">
                  <span className="mobile-field-label">Ghi chú</span>
                  <p>{item.note || "Không có ghi chú"}</p>
                </div>

                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => handleDeleteViolation(item.id)}
                  aria-label="Xóa ghi nhận lỗi"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>

          {/* <div className="summary-box">
            <div className="summary-icon">📋</div>

            <div>
              <h3>Tổng kết lỗi</h3>
              <strong>Trong tháng {monthLabel}</strong>
              <p>
                <Shirt size={17} />
                Sai đồng phục: <b>{uniformCount} lỗi</b>
              </p>
              <p>
                <Clock3 size={17} />
                Đi làm trễ: <b>{lateCount} lỗi</b>
              </p>
            </div>

            <div className="year-summary">
              <strong>Trong năm {currentYear}</strong>
              <p>
                <Shirt size={17} />
                Sai đồng phục:{" "}
                <b>
                  {
                    selectedTeacherYearViolations.filter((item) =>
                      item.types.includes("clothes"),
                    ).length
                  }{" "}
                  lỗi
                </b>
              </p>
              <p>
                <Clock3 size={17} />
                Đi làm trễ:{" "}
                <b>
                  {
                    selectedTeacherYearViolations.filter((item) =>
                      item.types.includes("time"),
                    ).length
                  }{" "}
                  lỗi
                </b>
              </p>
            </div>

            <div className="year-total">
              <span>Tổng cộng trong năm</span>
              <small>TỔNG QUAN</small>
              <b>
                {selectedTeacherYearViolations.length} <em>lỗi</em>
              </b>
            </div>

            <div className="plant">🪴</div>
          </div> */}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <CalendarDays size={19} />
      <div>
        <span>{label}</span>
        <strong>
          {value} <em>lỗi</em>
        </strong>
      </div>
    </div>
  );
}

function CheckBox({
  checked = false,
  onClick,
}: {
  checked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`check-box ${checked ? "checked" : ""}`}
      onClick={onClick}
    >
      {checked && <Check size={14} />}
    </button>
  );
}

export default Violation;
