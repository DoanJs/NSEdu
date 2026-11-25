import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import moment from "moment";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentUploadUrlResponse } from "./type";
import LoadingOverlay from "../../../components/LoadingOverLay";
import { handleTimeStampFirestore } from "../../../constants/convertTimeStamp";
import {
  handleToastError,
  handleToastSuccess,
} from "../../../constants/handleToast";
import { db, functions } from "../../../firebase.config";
import { useUserStore, useChildStore, useTeacherStore } from "../../../zustand";

type FirestoreDate =
  | number
  | Date
  | {
      seconds?: number;
      nanoseconds?: number;
      toDate?: () => Date;
    }
  | null;

interface ChildDocumentModel {
  id: string;
  childId: string;
  teacherIds: string[];
  name: string;
  originalName: string;
  description: string;
  key: string;
  extension: string;
  contentType: string;
  fileSize: number;
  status: "active" | "deleted";
  createAt: FirestoreDate;
  createBy: string;
  updateAt: FirestoreDate;
  updateBy: string;
  url?: string;
}

interface SelectedDocument {
  id: string;
  file: File;
  description: string;
}

interface UploadUrlResponse {
  files: {
    key: string;
    uploadUrl: string;
    expiresIn: number;
  }[];
}

interface DownloadUrlResponse {
  files: {
    documentId: string;
    key: string;
    downloadUrl: string;
    expiresIn: number;
  }[];
}

type SortMode = "newest" | "oldest" | "name" | "size";

const MAX_DOCUMENT_SIZE = 30 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "zip",
  "rar",
];

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const getExtension = (fileName: string) =>
  fileName.split(".").pop()?.toLowerCase() ?? "file";

const getDocumentStyle = (extension: string) => {
  const ext = extension.toLowerCase();

  if (ext === "pdf") {
    return { icon: "bi-file-earmark-pdf", className: "type-pdf", label: "PDF" };
  }

  if (["doc", "docx"].includes(ext)) {
    return {
      icon: "bi-file-earmark-word",
      className: "type-word",
      label: "Word",
    };
  }

  if (["xls", "xlsx", "csv"].includes(ext)) {
    return {
      icon: "bi-file-earmark-excel",
      className: "type-excel",
      label: "Excel",
    };
  }

  if (["ppt", "pptx"].includes(ext)) {
    return {
      icon: "bi-file-earmark-ppt",
      className: "type-powerpoint",
      label: "PowerPoint",
    };
  }

  if (["zip", "rar"].includes(ext)) {
    return {
      icon: "bi-file-earmark-zip",
      className: "type-archive",
      label: "Tệp nén",
    };
  }

  if (ext === "txt") {
    return {
      icon: "bi-file-earmark-text",
      className: "type-text",
      label: "Văn bản",
    };
  }

  return {
    icon: "bi-file-earmark",
    className: "type-other",
    label: ext.toUpperCase(),
  };
};

const getCreatedDate = (value: FirestoreDate) => {
  const converted = handleTimeStampFirestore(value as never);
  const convertedMoment = moment(converted);

  if (convertedMoment.isValid()) return convertedMoment;

  const rawMoment = moment(value as never);
  return rawMoment.isValid() ? rawMoment : moment.invalid();
};

export default function DocumentUpload() {
  const { user } = useUserStore();
  const isParent = user && user?.role === "parent";
  const isAdmin = user && user?.role === "admin";
  const { child } = useChildStore();
  const { teachers } = useTeacherStore();

  const inputRef = useRef<HTMLInputElement | null>(null);

  const [documents, setDocuments] = useState<ChildDocumentModel[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedDocument[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [documentToDelete, setDocumentToDelete] =
    useState<ChildDocumentModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeExtension, setActiveExtension] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [isDragging, setIsDragging] = useState(false);

  const teacherMap = useMemo(() => {
    return Object.fromEntries(teachers.map((teacher) => [teacher.id, teacher]));
  }, [teachers]);

  const extensionOptions = useMemo(() => {
    const counts = documents.reduce<Record<string, number>>((result, item) => {
      const extension = item.extension?.toLowerCase() || "other";
      result[extension] = (result[extension] ?? 0) + 1;
      return result;
    }, {});

    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([extension, count]) => ({ extension, count }));
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    const result = documents.filter((item) => {
      const matchesType =
        activeExtension === "all" || item.extension === activeExtension;
      const matchesSearch =
        keyword.length === 0 ||
        item.name.toLowerCase().includes(keyword) ||
        item.originalName.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword);

      return matchesType && matchesSearch;
    });

    return [...result].sort((a, b) => {
      if (sortMode === "name") {
        return a.name.localeCompare(b.name, "vi");
      }

      if (sortMode === "size") {
        return b.fileSize - a.fileSize;
      }

      const dateA = getCreatedDate(a.createAt).valueOf();
      const dateB = getCreatedDate(b.createAt).valueOf();

      return sortMode === "oldest" ? dateA - dateB : dateB - dateA;
    });
  }, [documents, searchText, activeExtension, sortMode]);

  const totalSize = useMemo(
    () => documents.reduce((sum, item) => sum + (item.fileSize || 0), 0),
    [documents],
  );

  useEffect(() => {
    if (!user?.id || !child?.id) return;

    const loadDocuments = async () => {
      try {
        setIsLoading(true);

        const documentQuery = query(
          collection(db, "childDocuments"),
          where("teacherIds", "array-contains", user.id),
          where("childId", "==", child.id),
          orderBy("createAt", "desc"),
        );

        const snapshot = await getDocs(documentQuery);
        const firestoreDocuments = snapshot.docs.map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        })) as ChildDocumentModel[];

        if (firestoreDocuments.length === 0) {
          setDocuments([]);
          return;
        }

        const getDocumentDownloadUrls = httpsCallable<
          { documentIds: string[] },
          DownloadUrlResponse
        >(functions, "getDocumentDownloadUrls");

        try {
          const response = await getDocumentDownloadUrls({
            documentIds: firestoreDocuments.map((item) => item.id),
          });

          const urlMap = Object.fromEntries(
            response.data.files.map((item) => [
              item.documentId,
              item.downloadUrl,
            ]),
          );

          setDocuments(
            firestoreDocuments.map((item) => ({
              ...item,
              url: urlMap[item.id] ?? "",
            })),
          );
        } catch (downloadError) {
          console.warn("Không thể tải URL tài liệu:", downloadError);
          setDocuments(firestoreDocuments);
        }
      } catch (error) {
        console.error("loadDocuments error:", error);
        handleToastError("Không thể tải danh sách tài liệu.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadDocuments();
  }, [user?.id, child?.id]);

  const validateFiles = (files: File[]) => {
    const accepted: File[] = [];

    files.forEach((file) => {
      const extension = getExtension(file.name);

      if (!ACCEPTED_EXTENSIONS.includes(extension)) {
        handleToastError(`Không hỗ trợ định dạng .${extension}`);
        return;
      }

      if (file.size > MAX_DOCUMENT_SIZE) {
        handleToastError(`${file.name} vượt quá giới hạn 30MB.`);
        return;
      }

      accepted.push(file);
    });

    return accepted;
  };

  const appendFiles = (files: File[]) => {
    const validFiles = validateFiles(files);

    if (validFiles.length === 0) return;

    setSelectedFiles((current) => {
      const existingKeys = new Set(
        current.map((item) => `${item.file.name}-${item.file.size}`),
      );

      const uniqueFiles = validFiles.filter(
        (file) => !existingKeys.has(`${file.name}-${file.size}`),
      );

      return [
        ...current,
        ...uniqueFiles.map((file) => ({
          id: crypto.randomUUID(),
          file,
          description: "",
        })),
      ];
    });
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    appendFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    appendFiles(Array.from(event.dataTransfer.files));
  };

  // Document Upload
  const handleUploadDocuments = async () => {
    if (isParent || !user?.id || !child?.id || selectedFiles.length === 0)
      return;

    try {
      setIsLoading(true);

      const getDocumentUploadUrls = httpsCallable<
        {
          childId: string;
          files: {
            extension: string;
            contentType: string;
            fileSize: number;
          }[];
        },
        DocumentUploadUrlResponse
      >(functions, "getDocumentUploadUrls");

      const response = await getDocumentUploadUrls({
        childId: child.id,

        files: selectedFiles.map(({ file }) => ({
          extension: getExtension(file.name),

          contentType: file.type || "application/octet-stream",

          fileSize: file.size,
        })),
      });

      if (response.data.files.length !== selectedFiles.length) {
        throw new Error("Số URL tải lên không khớp với số tài liệu đã chọn.");
      }

      const uploadResults = await Promise.allSettled(
        selectedFiles.map(async (selectedFile, index) => {
          const signedFile = response.data.files[index];

          const contentType =
            selectedFile.file.type || "application/octet-stream";

          const uploadResponse = await fetch(signedFile.uploadUrl, {
            method: "PUT",

            headers: {
              "Content-Type": contentType,
            },

            body: selectedFile.file,
          });

          if (!uploadResponse.ok) {
            const responseText = await uploadResponse.text();

            throw new Error(
              `Không thể tải ${selectedFile.file.name}. ` +
                `Status: ${uploadResponse.status}. ` +
                responseText,
            );
          }

          return {
            ...selectedFile,
            key: signedFile.key,
          };
        }),
      );

      /*
       * =============================================
       * 1. Lọc các file upload R2 thành công
       * =============================================
       */
      const successfulUploads = uploadResults
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<
            SelectedDocument & {
              key: string;
            }
          > => result.status === "fulfilled",
        )
        .map((result) => result.value);

      const failedUploads = uploadResults.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );

      /*
       * =============================================
       * 2. Lưu metadata vào Firestore
       * =============================================
       */
      if (successfulUploads.length > 0) {
        const batch = writeBatch(db);

        const now = Date.now();

        const newDocuments: ChildDocumentModel[] = [];

        successfulUploads.forEach(({ file, description, key }) => {
          const documentRef = doc(collection(db, "childDocuments"));

          const extension = getExtension(file.name);

          const originalName = file.name;

          const nameWithoutExtension = file.name.replace(/\.[^/.]+$/, "");

          const documentData = {
            id: documentRef.id,

            childId: child.id,

            teacherIds: child.teacherIds,

            /*
             * Tên hiển thị không có đuôi file
             */
            name: nameWithoutExtension,

            /*
             * Tên gốc đầy đủ để tải xuống
             */
            originalName,

            description: description.trim(),

            /*
             * Key thật trên R2
             */
            key,

            extension,

            contentType: file.type || "application/octet-stream",

            /*
             * Dung lượng byte
             */
            fileSize: file.size,

            status: "active" as const,

            createAt: serverTimestamp(),

            createBy: user.id,

            updateAt: serverTimestamp(),

            updateBy: user.id,
          };

          batch.set(documentRef, documentData);

          /*
           * Dữ liệu dùng để cập nhật UI ngay
           */
          newDocuments.push({
            ...documentData,

            createAt: now,

            updateAt: now,
          });
        });

        const metaRef = doc(db, "Meta", "childDocuments");

        batch.set(
          metaRef,
          {
            lastUpdated: serverTimestamp(),
          },
          {
            merge: true,
          },
        );

        await batch.commit();

        /*
         * Đưa tài liệu mới lên đầu danh sách
         */
        setDocuments((current) => [...newDocuments, ...current]);
      }

      /*
       * =============================================
       * 3. Thông báo kết quả
       * =============================================
       */
      if (successfulUploads.length > 0) {
        handleToastSuccess(
          `Đã tải lên ${successfulUploads.length} tài liệu thành công.`,
        );
      }

      if (failedUploads.length > 0) {
        console.error(
          "Các tài liệu tải lên thất bại:",
          failedUploads.map((item) => item.reason),
        );

        handleToastError(`${failedUploads.length} tài liệu tải lên thất bại.`);
      }

      /*
       * Chỉ đóng modal khi có ít nhất một file thành công
       */
      if (successfulUploads.length > 0) {
        setSelectedFiles([]);
        setShowUpload(false);
      }

      setSelectedFiles([]);
      setShowUpload(false);
    } catch (error) {
      console.error("uploadDocuments error:", error);
      handleToastError(
        error instanceof Error
          ? error.message
          : "Tải tài liệu thất bại. Vui lòng thử lại.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (isParent || !documentToDelete) return;

    try {
      setIsLoading(true);

      const deleteDocumentFile = httpsCallable<
        {
          documentId: string;
        },
        {
          success: boolean;
          message?: string;
        }
      >(functions, "deleteDocumentFile");

      const response = await deleteDocumentFile({
        documentId: documentToDelete.id,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || "Không thể xóa tài liệu.");
      }

      setDocuments((current) =>
        current.filter((item) => item.id !== documentToDelete.id),
      );

      setDocumentToDelete(null);

      handleToastSuccess(
        response.data.message || "Đã xóa tài liệu thành công.",
      );
    } catch (error: unknown) {
      console.error("deleteDocument error:", error);

      handleToastError(
        error instanceof Error
          ? error.message
          : "Xóa tài liệu thất bại. Vui lòng thử lại.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // const openDocument = (documentItem: ChildDocumentModel) => {
  //   if (!documentItem.url) {
  //     handleToastError("URL tài liệu chưa sẵn sàng. Vui lòng reload lại trang");
  //     return;
  //   }

  //   window.open(documentItem.url, "_blank", "noopener,noreferrer");
  // };

  const openDocument = (documentItem: ChildDocumentModel) => {
  if (!documentItem.url) {
    handleToastError(
      "URL tài liệu chưa sẵn sàng. Vui lòng reload lại trang",
    );
    return;
  }

  const extension = documentItem.extension?.toLowerCase();

  // PDF: mở xem bình thường
  if (extension === "pdf") {
    window.open(
      documentItem.url,
      "_blank",
      "noopener,noreferrer",
    );
    return;
  }

  // Word: tải file về
  if (extension === "doc" || extension === "docx") {
    const link = document.createElement("a");

    link.href = documentItem.url;
    link.download = documentItem.originalName;
    link.rel = "noopener noreferrer";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return;
  }

  // Các loại file khác: mở bình thường
  window.open(
    documentItem.url,
    "_blank",
    "noopener,noreferrer",
  );
};

  return (
    <>
      <style>{css}</style>

      <main className="document-page">
        <header className="document-head">
          <div className="document-title">
            <div className="document-title-icon">
              <i className="bi bi-file-earmark-arrow-up" />
            </div>

            <div>
              <h2>Tài liệu tải lên</h2>
              <p>
                Quản lý giáo trình, phiếu đánh giá và tài liệu hỗ trợ trong quá
                trình can thiệp của trẻ.
              </p>
            </div>
          </div>

          {!isParent && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setShowUpload(true)}
            >
              <i className="bi bi-cloud-arrow-up" />
              Thêm tài liệu
            </button>
          )}
        </header>

        <section className="document-stats">
          <article className="stat-card blue-stat">
            <div className="stat-icon">
              <i className="bi bi-files" />
            </div>
            <div>
              <span>Tổng tài liệu</span>
              <strong>{documents.length}</strong>
            </div>
          </article>

          <article className="stat-card orange-stat">
            <div className="stat-icon">
              <i className="bi bi-hdd" />
            </div>
            <div>
              <span>Dung lượng</span>
              <strong>{formatFileSize(totalSize)}</strong>
            </div>
          </article>

          <article className="stat-card green-stat">
            <div className="stat-icon">
              <i className="bi bi-clock-history" />
            </div>
            <div>
              <span>Cập nhật gần nhất</span>
              <strong>
                {documents[0]
                  ? getCreatedDate(documents[0].createAt).format("DD/MM/YYYY")
                  : "Chưa có"}
              </strong>
            </div>
          </article>
        </section>

        <section className="document-panel">
          <div className="document-toolbar">
            <div className="search-box">
              <i className="bi bi-search" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Tìm theo tên hoặc mô tả tài liệu..."
              />
              {searchText && (
                <button type="button" onClick={() => setSearchText("")}>
                  <i className="bi bi-x-circle-fill" />
                </button>
              )}
            </div>

            <div className="toolbar-actions">
              <select
                value={activeExtension}
                onChange={(event) => setActiveExtension(event.target.value)}
                aria-label="Lọc loại tài liệu"
              >
                <option value="all">Tất cả định dạng</option>
                {extensionOptions.map((item) => (
                  <option key={item.extension} value={item.extension}>
                    {item.extension.toUpperCase()} ({item.count})
                  </option>
                ))}
              </select>

              <select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as SortMode)
                }
                aria-label="Sắp xếp tài liệu"
              >
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="name">Theo tên</option>
                <option value="size">Theo dung lượng</option>
              </select>
            </div>
          </div>

          <div className="list-heading">
            <div>
              <h3>Danh sách tài liệu</h3>
              <p>{filteredDocuments.length} tài liệu đang hiển thị</p>
            </div>
          </div>

          {filteredDocuments.length > 0 ? (
            <div className="document-list">
              {filteredDocuments.map((item) => {
                const style = getDocumentStyle(item.extension);
                const createdAt = getCreatedDate(item.createAt);

                return (
                  <article className="document-row" key={item.id}>
                    <button
                      type="button"
                      className={`file-type-icon ${style.className}`}
                      onClick={() => openDocument(item)}
                      aria-label={`Mở ${item.originalName}`}
                    >
                      <i className={`bi ${style.icon}`} />
                    </button>

                    <div className="document-info">
                      <div className="document-name-line">
                        <button
                          type="button"
                          className="document-name"
                          onClick={() => openDocument(item)}
                        >
                          {item.originalName}
                        </button>
                        <span className={`document-badge ${style.className}`}>
                          {style.label}
                        </span>
                      </div>

                      <p>
                        {item.description || "Chưa có mô tả cho tài liệu này."}
                      </p>

                      <div className="document-meta">
                        <span>
                          <i className="bi bi-calendar3" />
                          {createdAt.isValid()
                            ? createdAt.format("HH:mm • DD/MM/YYYY")
                            : "Không rõ thời gian"}
                        </span>
                        <span>
                          <i className="bi bi-person" />
                          {teacherMap[item.createBy]?.fullName || "Giáo viên"}
                        </span>
                        <span>
                          <i className="bi bi-hdd" />
                          {formatFileSize(item.fileSize)}
                        </span>
                      </div>
                    </div>

                    <div className="document-actions">
                      <button
                        type="button"
                        className="soft-action view-action"
                        onClick={() => openDocument(item)}
                        title="Xem tài liệu"
                      >
                        <i className="bi bi-box-arrow-up-right" />
                        <span>Xem</span>
                      </button>

                      {isAdmin && (
                        <button
                          type="button"
                          className="soft-action delete-action"
                          onClick={() => setDocumentToDelete(item)}
                          title="Xóa tài liệu"
                        >
                          <i className="bi bi-trash3" />
                          <span>Xóa</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <i className="bi bi-folder2-open" />
              </div>
              <h3>Chưa tìm thấy tài liệu</h3>
              <p>
                Hãy thay đổi bộ lọc hoặc tải lên tài liệu mới cho hồ sơ của trẻ.
              </p>
              {!isParent && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setShowUpload(true)}
                >
                  <i className="bi bi-plus-lg" />
                  Thêm tài liệu đầu tiên
                </button>
              )}
            </div>
          )}
        </section>
      </main>

      {!isParent && showUpload && (
        <Modal
          title="Tải tài liệu lên hệ thống"
          onClose={() => {
            setShowUpload(false);
            setSelectedFiles([]);
          }}
        >
          <p className="modal-description">
            Có thể chọn nhiều tài liệu cùng lúc. Hỗ trợ PDF, Word, Excel,
            PowerPoint, TXT, CSV và tệp nén; tối đa 30MB mỗi tệp.
          </p>

          <div
            className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="drop-icon">
              <i className="bi bi-cloud-arrow-up" />
            </div>
            <h4>Kéo thả tài liệu vào đây</h4>
            <p>hoặc chọn nhiều tệp từ thiết bị</p>
            <button
              type="button"
              className="choose-file-btn"
              onClick={() => inputRef.current?.click()}
            >
              <i className="bi bi-folder2-open" />
              Chọn tài liệu
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
              multiple
              hidden
              onChange={handleFileInputChange}
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="selected-section">
              <div className="selected-heading">
                <div>
                  <h4>Tài liệu đã chọn</h4>
                  <p>{selectedFiles.length} tệp chờ tải lên</p>
                </div>
                <button
                  type="button"
                  className="clear-files-btn"
                  onClick={() => setSelectedFiles([])}
                >
                  Xóa tất cả
                </button>
              </div>

              <div className="selected-list">
                {selectedFiles.map((item) => {
                  const extension = getExtension(item.file.name);
                  const style = getDocumentStyle(extension);

                  return (
                    <div className="selected-row" key={item.id}>
                      <div className={`small-file-icon ${style.className}`}>
                        <i className={`bi ${style.icon}`} />
                      </div>

                      <div className="selected-info">
                        <div>
                          <strong>{item.file.name}</strong>
                          <span>{formatFileSize(item.file.size)}</span>
                        </div>
                        <input
                          value={item.description}
                          onChange={(event) =>
                            setSelectedFiles((current) =>
                              current.map((selectedItem) =>
                                selectedItem.id === item.id
                                  ? {
                                      ...selectedItem,
                                      description: event.target.value,
                                    }
                                  : selectedItem,
                              ),
                            )
                          }
                          placeholder="Nhập mô tả ngắn cho tài liệu..."
                        />
                      </div>

                      <button
                        type="button"
                        className="remove-selected-btn"
                        onClick={() =>
                          setSelectedFiles((current) =>
                            current.filter(
                              (selectedItem) => selectedItem.id !== item.id,
                            ),
                          )
                        }
                        aria-label={`Bỏ ${item.file.name}`}
                      >
                        <i className="bi bi-x-lg" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={() => {
                setShowUpload(false);
                setSelectedFiles([]);
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              className="primary-btn"
              disabled={selectedFiles.length === 0}
              onClick={handleUploadDocuments}
            >
              <i className="bi bi-cloud-check" />
              Tải lên{" "}
              {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""}
            </button>
          </div>
        </Modal>
      )}

      {!isParent && documentToDelete && (
        <Modal
          title="Xóa tài liệu"
          onClose={() => setDocumentToDelete(null)}
          compact
        >
          <div className="delete-confirmation">
            <div className="delete-confirmation-icon">
              <i className="bi bi-trash3" />
            </div>
            <p>
              Bạn có chắc muốn xóa tài liệu
              <strong> “{documentToDelete.originalName}”</strong>? Hành động này
              không thể hoàn tác.
            </p>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={() => setDocumentToDelete(null)}
            >
              Giữ lại
            </button>
            <button
              type="button"
              className="danger-btn"
              onClick={handleDeleteDocument}
            >
              <i className="bi bi-trash3" />
              Xóa tài liệu
            </button>
          </div>
        </Modal>
      )}

      <LoadingOverlay show={isLoading} />
    </>
  );
}

function Modal({
  title,
  children,
  onClose,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className="document-modal-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className={`document-modal ${compact ? "compact-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>TÀI LIỆU</span>
            <h3>{title}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const css = `
:root {
  --doc-green: #168B5C;
  --doc-green-dark: #0F704A;
  --doc-green-deep: #AD2837;
  --doc-green-soft: #FFF1F3;
  --doc-green-soft-2: #faf4f4;
  --doc-border: #DFF4E9;
  --doc-yellow: #f5b400;
  --doc-yellow-soft: #fff7d6;
  --doc-red: #168B5C;
  --doc-red-soft: #FFF1F3;
  --doc-blue: #3b82f6;
  --doc-blue-soft: #eff6ff;
  --doc-text: #334155;
  --doc-muted: #64748B;
  --doc-white: #ffffff;
  --doc-shadow: 0 14px 36px rgba(99,13,13, 0.07);
}

* { box-sizing: border-box; }

.document-page {
  min-height: 100%;
  color: var(--doc-text);
  font-family: "Inter", "Segoe UI", Arial, sans-serif;
  padding: 28px 0 36px;
}

button, input, select { font: inherit; }
button { cursor: pointer; }

/* ===== PAGE HEADER - cùng ngôn ngữ với Bank ===== */
.document-head {
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.document-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.document-title-icon {
  width: 54px;
  height: 54px;
  flex: 0 0 54px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--doc-green), var(--doc-green-dark));
  color: #fff;
  font-size: 25px;
  box-shadow: 0 12px 24px rgba(131,26,26, 0.18);
}

.document-title h2 {
  margin: 0;
  color: var(--doc-green-deep);
  font-size: 34px;
  font-weight: 950;
  letter-spacing: -0.7px;
}

.document-title p {
  margin: 5px 0 0;
  max-width: 760px;
  color: var(--doc-muted);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.55;
}

.primary-btn,
.cancel-btn,
.danger-btn,
.choose-file-btn {
  min-height: 46px;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 15px;
  font-size: 13px;
  font-weight: 900;
  transition: 0.18s ease;
}

.primary-btn {
  border: 1px solid var(--doc-green);
  background: linear-gradient(135deg, var(--doc-green), var(--doc-green-dark));
  color: #fff;
  box-shadow: 0 10px 22px rgba(131,26,26, 0.17);
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  background: linear-gradient(135deg, #8e1919, var(--doc-green-dark));
  box-shadow: 0 14px 28px rgba(131,26,26, 0.23);
}

.primary-btn:disabled { cursor: not-allowed; opacity: .55; box-shadow: none; }

/* ===== STATS ===== */
.document-stats {
  margin-bottom: 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  min-width: 0;
  min-height: 102px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  border: 1px solid var(--doc-border);
  border-radius: 22px;
  background: rgba(255,255,255,.96);
  box-shadow: var(--doc-shadow);
  overflow: hidden;
  position: relative;
}

.stat-card::after {
  content: "";
  position: absolute;
  width: 78px;
  height: 78px;
  border-radius: 50%;
  right: -26px;
  top: -28px;
  background: rgba(131,26,26, .06);
}

.stat-icon {
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  display: grid;
  place-items: center;
  border-radius: 17px;
  font-size: 25px;
}

.blue-stat .stat-icon { background: var(--doc-green-soft); color: var(--doc-green-dark); }
.orange-stat .stat-icon { background: var(--doc-yellow-soft); color: #b77900; }
.green-stat .stat-icon { background: #DFF4E9; color: #0F704A; }

.stat-card span {
  display: block;
  margin-bottom: 5px;
  color: var(--doc-muted);
  font-size: 12px;
  font-weight: 750;
}

.stat-card strong {
  display: block;
  color: var(--doc-green-deep);
  font-size: 22px;
  font-weight: 950;
}

/* ===== MAIN PANEL ===== */
.document-panel {
  overflow: hidden;
  border: 1px solid var(--doc-border);
  border-radius: 24px;
  background: rgba(255,255,255,.98);
  box-shadow: var(--doc-shadow);
}

.document-toolbar {
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid var(--doc-border);
  background: linear-gradient(180deg, #ffffff 0%, #fef9f9 100%);
}

.search-box {
  width: min(560px, 100%);
  min-height: 48px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--doc-border);
  border-radius: 16px;
  background: #fff;
  transition: .18s ease;
}

.search-box:focus-within {
  border-color: var(--doc-green);
  box-shadow: 0 0 0 .2rem rgba(131,26,26, .10);
}

.search-box > i { color: var(--doc-green); }
.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; color: var(--doc-text); background: transparent; font-weight: 650; }
.search-box input::placeholder { color: #a4888b; }
.search-box button { padding: 0; border: 0; background: transparent; color: #a68a8c; }

.toolbar-actions { display: flex; align-items: center; gap: 10px; }
.toolbar-actions select {
  min-height: 48px;
  padding: 0 38px 0 14px;
  border: 1px solid var(--doc-border);
  border-radius: 16px;
  outline: 0;
  background: #fff;
  color: var(--doc-green-deep);
  font-size: 12px;
  font-weight: 800;
}
.toolbar-actions select:focus { border-color: var(--doc-green); box-shadow: 0 0 0 .2rem rgba(131,26,26, .10); }

.list-heading { padding: 22px 20px 10px; }
.list-heading h3 { margin: 0; color: var(--doc-green-deep); font-size: 22px; font-weight: 950; }
.list-heading p { margin: 4px 0 0; color: var(--doc-muted); font-size: 12px; font-weight: 650; }

.document-list { padding: 6px 14px 18px; display: grid; gap: 10px; }

.document-row {
  min-width: 0;
  padding: 15px;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  border: 1px solid rgba(230,205,207, .72);
  border-radius: 18px;
  background: #fff;
  transition: .18s ease;
}

.document-row:hover {
  border-color: #d2a3a7;
  background: linear-gradient(135deg, #fff 0%, #fef7f7 100%);
  box-shadow: 0 12px 26px rgba(99,13,13, .08);
  transform: translateY(-1px);
}

.file-type-icon {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 16px;
  font-size: 27px;
}

.type-pdf { background: #FFF1F3 !important; color: #e5484d !important; }
.type-word { background: #eef6ff !important; color: #3478c7 !important; }
.type-excel { background: #f7ebec !important; color: #7e1e1e !important; }
.type-powerpoint { background: #fff2e8 !important; color: #dc6b2f !important; }
.type-archive { background: #f5efff !important; color: #7855b7 !important; }
.type-text, .type-other { background: #f5f1f2 !important; color: #765c5c !important; }

.document-info { min-width: 0; }
.document-name-line { display: flex; align-items: center; gap: 9px; }
.document-name {
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--doc-green-deep);
  font-size: 14px;
  font-weight: 900;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.document-name:hover { color: var(--doc-green); }

.document-badge {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .3px;
  text-transform: uppercase;
}

.document-info > p {
  margin: 7px 0 9px;
  overflow: hidden;
  color: var(--doc-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.document-meta span { display: inline-flex; align-items: center; gap: 6px; color: #8f7173; font-size: 11px; font-weight: 650; }
.document-meta i { color: var(--doc-yellow); }

.document-actions { display: flex; align-items: center; gap: 8px; }
.soft-action {
  min-height: 38px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 13px;
  font-size: 11px;
  font-weight: 850;
  transition: .18s ease;
}
.view-action { border: 1px solid #e1c2c4; background: var(--doc-green-soft); color: var(--doc-green-dark); }
.delete-action { border: 1px solid #f4cccc; background: var(--doc-red-soft); color: var(--doc-red); }
.soft-action:hover { transform: translateY(-1px); }

.empty-state { min-height: 360px; padding: 40px 20px; display: flex; align-items: center; justify-content: center; flex-direction: column; text-align: center; }
.empty-icon { width: 82px; height: 82px; display: grid; place-items: center; border-radius: 24px; background: var(--doc-yellow-soft); color: #b77900; font-size: 38px; }
.empty-state h3 { margin: 18px 0 7px; color: var(--doc-green-deep); font-size: 21px; font-weight: 950; }
.empty-state p { max-width: 440px; margin: 0 0 20px; color: var(--doc-muted); font-size: 13px; line-height: 1.6; }

/* ===== MODAL ===== */
.document-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  padding: 24px;
  display: grid;
  place-items: center;
  overflow-y: auto;
  background: rgba(68,8,8, .45);
  backdrop-filter: blur(5px);
}

.document-modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  border: 1px solid rgba(230,205,207,.95);
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(68,8,8, .22);
}
.compact-modal { width: min(500px, 100%); }

.modal-head { padding: 20px 22px 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; border-bottom: 1px solid rgba(230,205,207,.55); }
.modal-head span { display: block; margin-bottom: 3px; color: var(--doc-green); font-size: 10px; font-weight: 900; letter-spacing: 1.3px; }
.modal-head h3 { margin: 0; color: var(--doc-green-deep); font-size: 22px; font-weight: 950; }
.modal-head > button { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--doc-border); border-radius: 12px; background: var(--doc-green-soft-2); color: var(--doc-green-dark); }

.modal-description { margin: 0; padding: 16px 22px; color: var(--doc-muted); font-size: 12px; font-weight: 600; line-height: 1.55; }

.drop-zone {
  margin: 0 22px;
  padding: 32px 20px;
  display: flex;
  align-items: center;
  flex-direction: column;
  border: 1.5px dashed #c79296;
  border-radius: 20px;
  background: linear-gradient(180deg, #fffbfc 0%, #f9f0f1 100%);
  text-align: center;
  transition: .18s ease;
}
.drop-zone.is-dragging { border-color: var(--doc-yellow); background: var(--doc-yellow-soft); transform: scale(1.006); }
.drop-icon { width: 65px; height: 65px; display: grid; place-items: center; border-radius: 20px; background: #fff; color: var(--doc-green); font-size: 31px; box-shadow: 0 10px 25px rgba(99,13,13,.10); }
.drop-zone h4 { margin: 15px 0 5px; color: var(--doc-green-deep); font-size: 17px; font-weight: 950; }
.drop-zone p { margin: 0 0 15px; color: var(--doc-muted); font-size: 12px; }
.choose-file-btn { border: 1px solid var(--doc-border); background: #fff; color: var(--doc-green-dark); box-shadow: 0 7px 18px rgba(99,13,13,.07); }
.choose-file-btn:hover { background: var(--doc-green-soft); }

.selected-section { margin: 20px 22px 0; }
.selected-heading { margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.selected-heading h4 { margin: 0; color: var(--doc-green-deep); font-size: 14px; font-weight: 950; }
.selected-heading p { margin: 3px 0 0; color: var(--doc-muted); font-size: 11px; }
.clear-files-btn { padding: 0; border: 0; background: transparent; color: var(--doc-red); font-size: 11px; font-weight: 850; }
.selected-list { max-height: 310px; padding-right: 3px; display: grid; gap: 8px; overflow-y: auto; }
.selected-row { padding: 11px; display: grid; grid-template-columns: 43px minmax(0, 1fr) 34px; align-items: center; gap: 10px; border: 1px solid var(--doc-border); border-radius: 14px; background: #fff; }
.small-file-icon { width: 43px; height: 43px; display: grid; place-items: center; border-radius: 11px; font-size: 21px; }
.selected-info { min-width: 0; }
.selected-info > div { margin-bottom: 7px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.selected-info strong { min-width: 0; overflow: hidden; color: var(--doc-green-deep); font-size: 11px; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }
.selected-info span { flex: 0 0 auto; color: var(--doc-muted); font-size: 10px; }
.selected-info input { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--doc-border); border-radius: 10px; outline: 0; color: var(--doc-text); font-size: 11px; }
.selected-info input:focus { border-color: var(--doc-green); box-shadow: 0 0 0 3px rgba(131,26,26,.07); }
.remove-selected-btn { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--doc-border); border-radius: 10px; background: #fff; color: var(--doc-red); }

.modal-actions { padding: 18px 22px 22px; display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.cancel-btn { border: 1px solid var(--doc-border); background: #fff; color: var(--doc-green-deep); }
.cancel-btn:hover { background: var(--doc-green-soft-2); }
.danger-btn { border: 1px solid #dc3a3a; background: linear-gradient(135deg, #ef5350, #d9363e); color: #fff; box-shadow: 0 10px 22px rgba(217,54,62,.18); }
.delete-confirmation { padding: 18px 22px 4px; display: flex; align-items: flex-start; gap: 13px; }
.delete-confirmation-icon { width: 47px; height: 47px; flex: 0 0 47px; display: grid; place-items: center; border-radius: 14px; background: var(--doc-red-soft); color: var(--doc-red); font-size: 21px; }
.delete-confirmation p { margin: 2px 0 0; color: var(--doc-muted); font-size: 13px; font-weight: 600; line-height: 1.65; }
.delete-confirmation strong { color: var(--doc-green-deep); }

@media (max-width: 991px) {
  .document-head, .document-toolbar { align-items: stretch; flex-direction: column; }
  .document-head .primary-btn { align-self: flex-start; }
  .document-stats { grid-template-columns: 1fr; }
  .search-box { width: 100%; }
  .toolbar-actions { width: 100%; }
  .toolbar-actions select { flex: 1; }
}

@media (max-width: 680px) {
  .document-page { padding-top: 16px; }
  .document-title { align-items: flex-start; }
  .document-title-icon { width: 46px; height: 46px; flex-basis: 46px; border-radius: 14px; font-size: 22px; }
  .document-title h2 { font-size: 28px; }
  .document-title p { font-size: 12px; }
  .toolbar-actions { flex-direction: column; }
  .toolbar-actions select { width: 100%; }
  .document-row { grid-template-columns: 49px minmax(0, 1fr); }
  .file-type-icon { width: 49px; height: 49px; font-size: 24px; }
  .document-actions { grid-column: 1 / -1; justify-content: flex-end; padding-top: 4px; }
  .document-meta { gap: 9px; }
  .document-modal-backdrop { padding: 12px; }
  .document-modal { max-height: calc(100vh - 24px); border-radius: 18px; }
}

@media (max-width: 480px) {
  .document-head .primary-btn { width: 100%; }
  .stat-card { min-height: 92px; }
  .stat-icon { width: 50px; height: 50px; flex-basis: 50px; }
  .document-toolbar, .list-heading { padding-left: 14px; padding-right: 14px; }
  .document-list { padding-left: 7px; padding-right: 7px; }
  .document-row { padding: 11px; gap: 10px; }
  .document-info > p { white-space: normal; }
  .soft-action span { display: none; }
  .soft-action { width: 38px; padding: 0; justify-content: center; }
  .drop-zone { margin-left: 14px; margin-right: 14px; padding: 25px 14px; }
  .modal-description { padding-left: 14px; padding-right: 14px; }
  .selected-section { margin-left: 14px; margin-right: 14px; }
  .modal-head, .modal-actions { padding-left: 14px; padding-right: 14px; }
  .selected-row { grid-template-columns: 38px minmax(0, 1fr) 32px; }
  .small-file-icon { width: 38px; height: 38px; }
  .selected-info > div { align-items: flex-start; flex-direction: column; gap: 2px; }
  .modal-actions { flex-direction: column-reverse; }
  .modal-actions .primary-btn, .modal-actions .cancel-btn, .modal-actions .danger-btn { width: 100%; }
}
`;
