import {
  collection,
  doc,
  serverTimestamp
} from "firebase/firestore";
import {
  CalendarDays,
  Check,
  Clock3,
  Cloud,
  FilePenLine,
  Filter,
  ImagePlus,
  Plus,
  Search,
  Shirt,
  Trash2,
  UserCog,
  X, Smartphone,
  Baby,
  NotebookText
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { SpinnerComponent } from "../../../components";
import LoadingOverlay from "../../../components/LoadingOverLay";
import { addDocData } from "../../../constants/firebase/addDocData";
import { deleteDocData } from "../../../constants/firebase/deleteDocData";
import { getDocsData } from "../../../constants/firebase/getDocsData";
import {
  handleToastError,
  handleToastSuccess,
  handleToastWarn,
} from "../../../constants/handleToast";
import { uploadViolationImages } from "../../../constants/uploadAvatar";
import { db } from "../../../firebase.config";
import { useUserStore, useViolationStore } from "../../../zustand";
import "./styles.css";

type Teacher = {
  id: string;
  fullName: string;
  shortName?: string;
  avatar?: string;
  role?: string;
  position?: string;
};

type ViolationType = "clothes" | "time" | 'dirty' | 'document' | 'baby' | 'phone';

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

// type SavedViolation = {
//   id: string;
//   teacherId: string;
//   date: string;
//   types: ViolationType[];
//   note: string;
//   images: string[];
//   createAt: FieldValue | number;
//   updateAt: FieldValue | number;
// };

const getToday = (): string => new Date().toISOString().split("T")[0];

const createInitialForm = (): ViolationForm => ({
  date: getToday(),
  types: [],
  imgs: [],
  note: "",
});

const typeMap: Record<string, string> = {
  time: "Đi làm muộn",
  baby: "Để trẻ 1 mình",
  phone: "Sử dụng điện thoại khi làm việc",
  clothes: "Không mặc đồng phục",
  dirty: "Không hoàn thành công việc được giao",
  document: "Nộp kế hoạch - báo cáo muộn"
};

function Violation() {
  const { user } = useUserStore();

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | undefined>();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(getToday().slice(0, 7));
  const [form, setForm] = useState<ViolationForm>(createInitialForm);
  const { addViolation, removeViolation } = useViolationStore();
  const [isLoading, setIsLoading] = useState(false);
  const { violations } = useViolationStore();
  const [showDelete, setShowDelete] = useState(false);
  const [violation, setViolation] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // useEffect(() => {
  //   if (!user) return;

  //   getDocsData({
  //     nameCollect: "users",
  //     setData: (data: Teacher[]) => {
  //       setTeachers(data);
  //       setSelectedTeacher((current) => current ?? data[0]);
  //     },
  //   });
  // }, [user]);
  const teacherMap = useMemo(() => {
    const map: any = {};
    teachers.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [teachers]);

  useEffect(() => {
    if (!user) return;

    if (user.role === "admin") {
      getDocsData({
        nameCollect: "users",
        setData: (data: Teacher[]) => {
          setTeachers(data);
          setSelectedTeacher((current) => current ?? data[0]);
        },
      });
    } else {
      const teacher = user as Teacher;

      setTeachers([teacher]);
      setSelectedTeacher(teacher);
    }
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

  const monthLabel = month ? month.split("-").reverse().join("/") : "";

  const totalViolationsInMonth = useMemo(() => {
    return selectedTeacherViolations.reduce(
      (total, item) => total + item.types.length,
      0,
    );
  }, [selectedTeacherViolations]);

  const selectedTeacherYearViolations = useMemo(() => {
    const currentYear = String(new Date().getFullYear());

    return violations.filter(
      (item) =>
        item.teacherId === selectedTeacher?.id &&
        item.date.startsWith(currentYear),
    );
  }, [violations, selectedTeacher?.id]);

  const totalViolationsInYear = useMemo(() => {
    return selectedTeacherYearViolations.reduce(
      (total, item) => total + item.types.length,
      0,
    );
  }, [selectedTeacherYearViolations]);

  const uniformCount = selectedTeacherViolations.filter((item) =>
    item.types.includes("clothes"),
  ).length;

  const lateCount = selectedTeacherViolations.filter((item) =>
    item.types.includes("time"),
  ).length;

  const dirtyCount = selectedTeacherViolations.filter((item) =>
    item.types.includes("dirty"),
  ).length;

  const documentCount = selectedTeacherViolations.filter((item) =>
    item.types.includes("document"),
  ).length;

  const formatDate = (date: string): string => {
    const [year, month, day] = date.split("-");
    return `${day}-${month}-${year}`;
  };

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

  const handleSaveViolation = async () => {
    if (!selectedTeacher?.id) {
      handleToastWarn("Vui lòng chọn giáo viên trước khi lưu.");
      return;
    }

    if (!form.date) {
      handleToastWarn("Vui lòng chọn ngày ghi nhận lỗi.");
      return;
    }

    if (form.types.length === 0) {
      handleToastWarn("Vui lòng chọn ít nhất một loại lỗi.");
      return;
    }

    // if (form.imgs.length === 0) {
    //   handleToastWarn("Vui lòng thêm ít nhất một hình ảnh minh chứng.");
    //   return;
    // }

    setIsLoading(true);
    const violationRef = doc(collection(db, "violations"));

    const newViolation: any = {
      id: violationRef.id,
      teacherId: selectedTeacher.id,
      date: form.date,
      types: [...form.types],
      note: form.note.trim(),
      imgs: form.imgs.map((image) => image.file),

      createAt: serverTimestamp(),
      updateAt: serverTimestamp(),
    };

    let images = newViolation.imgs;

    if (images.length > 0) {
      const resultAvatar = await uploadViolationImages(images);

      images = resultAvatar.urls;
    }

    try {
      addDocData({
        nameCollect: "violations",
        value: {
          ...newViolation,
          imgs: images,

          createAt: serverTimestamp(),
          updateAt: serverTimestamp(),
        },
        metaDoc: "violations",
        customId: violationRef.id,
      })
        .then((result) => {
          addViolation({
            ...newViolation,
            imgs: form.imgs.map((image) => image.previewUrl),
          });
          handleToastSuccess(`Thêm lỗi mới thành công ! (${result.id}) `);
        })
        .catch((eror) => {
          console.log(eror);
          handleToastError("Thêm lỗi mới thất bại !");
        });
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
      setForm(createInitialForm());
    }
  };

  const handleDeleteViolation = () => {
    setIsLoading(true);

    try {
      deleteDocData({
        nameCollect: "violations",
        id: violation.id,
        metaDoc: "violations",
      })
        .then((result) => {
          removeViolation(violation.id);
          handleToastSuccess(`Xóa lỗi thành công ! (${violation.id}) `);
        })
        .catch((eror) => {
          console.log(eror);
          handleToastError("Xóa lỗi thất bại !");
        });
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
      setForm(createInitialForm());
      setViolation(null)
    }
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

        <div className="toolbar d-flex" style={{padding: '0 14px 14px', border: 'none'}}>
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
                          src={teacher.avatar || "/NSXEdu-icon-512x512.png"}
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
                src={selectedTeacher?.avatar || "/NSXEdu-icon-512x512.png"}
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
            value={totalViolationsInMonth}
          />

          <StatCard
            label={`Tổng số lỗi trong năm ${currentYear}`}
            value={totalViolationsInYear}
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

            {user && user?.role === "admin" && (
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
                      <span>Không mặc đồng phục</span>
                      <Shirt size={18} className="pink" />
                    </label>

                    <label>
                      <CheckBox
                        checked={form.types.includes("phone")}
                        onClick={() => handleToggleType("phone")}
                      />
                      <span>Sử dụng điện thoại khi làm việc</span>
                      
                      <Smartphone size={18} className="navy" style={{color: 'green'}}/>
                    </label>

                    <label>
                      <CheckBox
                        checked={form.types.includes("baby")}
                        onClick={() => handleToggleType("baby")}
                      />
                      <span>Để trẻ 1 mình</span>
                      <Baby size={18} className="navy" style={{color: 'orange'}}/>
                    </label>
                    
                    <label>
                      <CheckBox
                        checked={form.types.includes("time")}
                        onClick={() => handleToggleType("time")}
                      />
                      <span>Đi làm muộn</span>
                      <Clock3 size={18} className="navy" />
                    </label>

                    <label>
                      <CheckBox
                        checked={form.types.includes("dirty")}
                        onClick={() => handleToggleType("dirty")}
                      />
                      <span>Không hoàn thành công việc được giao</span>
                      <NotebookText size={18} className="brown"  style={{color: 'red'}}/>
                    </label>

                    <label>
                      <CheckBox
                        checked={form.types.includes("document")}
                        onClick={() => handleToggleType("document")}
                      />
                      <span>Nộp kế hoạch - báo cáo muộn</span>
                      <FilePenLine size={18} className="brown" style={{color: 'blue'}}/>
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
            )}

            {selectedTeacherViolations.map((item) => (
              <div className="violation-row saved-violation-row" key={item.id}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div className="date-cell">
                    <span className="mobile-field-label">Ngày ghi nhận</span>
                    <strong>{formatDate(item.date)}</strong>
                  </div>

                  <div className="type-cell">
                    <span className="mobile-field-label">Loại lỗi</span>

                    {item.types.includes("clothes") && (
                      <label>
                        <CheckBox checked />
                        <span>Không mặc đồng phục</span>
                        <Shirt size={18} className="pink" />
                      </label>
                    )}

                    {item.types.includes("phone") && (
                      <label>
                        <CheckBox checked />
                        <span>Sử dụng điện thoại khi làm việc</span>
                        <Smartphone size={18} className="navy" style={{color: 'green'}}/>
                      </label>
                    )}

                    {item.types.includes("baby") && (
                      <label>
                        <CheckBox checked />
                        <span>Để trẻ 1 mình</span>
                        <Baby size={18} className="navy" style={{color: 'orange'}}/>
                      </label>
                    )}

                    {item.types.includes("time") && (
                      <label>
                        <CheckBox checked />
                        <span>Đi làm muộn</span>
                        <Clock3 size={18} className="navy" />
                      </label>
                    )}

                    {item.types.includes("dirty") && (
                      <label>
                        <CheckBox checked />
                        <span>Không hoàn thành công việc được giao</span>
                        <Trash2 size={18} style={{color: 'red'}} />
                      </label>
                    )}

                    {item.types.includes("document") && (
                      <label>
                        <CheckBox checked />
                        <span>Nộp kế hoạch - báo cáo muộn</span>
                        <FilePenLine size={18} className="brown" style={{color: 'blue'}}/>
                      </label>
                    )}
                  </div>
                </div>

                <div className="evidence-wrap">
                  <span className="mobile-field-label">Minh chứng</span>
                  <div className="selected-images">
                    {item.imgs.map((imageUrl, index) => (
                      <div className="evidence" key={`${item.id}-${index}`}>
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

                {user && user.role === "admin" && (
                  <button
                    type="button"
                    className="delete-btn"
                    onClick={() => {
                      setShowDelete(true);
                      setViolation(item);
                    }}
                    aria-label="Xóa ghi nhận lỗi"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="summary-box">
            <div className="summary-icon">
              <img style={{width: '100%'}} src="/icons/violation-total.png" alt="Tổng kết lỗi" />
            </div>

            <div>
              <h3>Tổng kết lỗi</h3>
              <strong>Trong tháng {monthLabel}</strong>
              <p>
                <Shirt size={17} />
                Không mặc đồng phục: <b>{uniformCount} lỗi</b>
              </p>
              <p>
                <Clock3 size={17} />
                Đi làm muộn: <b>{lateCount} lỗi</b>
              </p>
              <p>
                <Trash2 size={18} />
                Không hoàn thành công việc được giao: <b>{dirtyCount} lỗi</b>
              </p>
              <p>
                <FilePenLine size={18} />
                Nộp kế hoạch - báo cáo muộn: <b>{documentCount} lỗi</b>
              </p>
            </div>

            <div className="year-summary">
              <strong>Trong năm {currentYear}</strong>
              <p>
                <Shirt size={17} />
                Không mặc đồng phục:{" "}
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
                Đi làm muộn:{" "}
                <b>
                  {
                    selectedTeacherYearViolations.filter((item) =>
                      item.types.includes("time"),
                    ).length
                  }{" "}
                  lỗi
                </b>
              </p>
              <p>
                <Trash2 size={18} />
                Không hoàn thành công việc được giao:{" "}
                <b>
                  {
                    selectedTeacherYearViolations.filter((item) =>
                      item.types.includes("dirty"),
                    ).length
                  }{" "}
                  lỗi
                </b>
              </p>
              <p>
                <FilePenLine size={18} />
                Nộp kế hoạch - báo cáo muộn:{" "}
                <b>
                  {
                    selectedTeacherYearViolations.filter((item) =>
                      item.types.includes("document"),
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
                {totalViolationsInYear} <em>lỗi</em>
              </b>
            </div>

            <div className="plant">
              <img style={{width: '100%'}} src="/icons/violation-tree.png" alt="violation-tree" />
            </div>
          </div>
        </div>
      </section>

      {showDelete && violation && (
        <div className="custom-modal-backdrop">
          <div className="custom-modal">
            {/* Title */}
            <h5 className="fw-black text-danger mb-2">Xác nhận xoá lỗi</h5>

            {/* Description */}
            <p className="text-green-muted small">
              Hành động này sẽ xoá toàn bộ nội dung lỗi và không thể khôi phục.
            </p>

            {/* Plan info */}
            <div className="plan-delete-box mt-2">
              <div className="small">
                <strong>Cô:</strong> {teacherMap[violation.teacherId]?.fullName}
              </div>
              <div className="small">
                <strong>Lỗi:</strong>{" "}
                {violation.types
                  .map((type: any) => typeMap[type] ?? type)
                  .join(", ")}
              </div>
              <div className="small">
                <strong>Mã lỗi:</strong> {violation.id}
              </div>
            </div>

            {/* Actions */}
            <div className="d-flex gap-2 justify-content-end mt-3">
              <button
                className="btn action-btn-soft"
                onClick={() => setShowDelete(false)}
              >
                Huỷ
              </button>

              <button
                className="btn action-btn-danger"
                onClick={handleDeleteViolation}
              >
                <i className="bi bi-trash me-2" />
                Xoá lỗi
              </button>
            </div>
          </div>
        </div>
      )}

      <LoadingOverlay show={isLoading} />
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
