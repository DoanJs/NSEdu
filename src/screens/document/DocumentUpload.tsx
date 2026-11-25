import React, { DragEvent, useMemo, useRef, useState } from "react";
import "./documentUpload.css";

type DocumentItem = {
  id: string;
  name: string;
  type: string;
  size: string;
  author: string;
  date: string;
};

const mockDocs: DocumentItem[] = [
  {
    id: "1",
    name: "Kế hoạch tháng 08.docx",
    type: "DOCX",
    size: "1.2 MB",
    author: "Cô Ny",
    date: "04/08/2026",
  },
  {
    id: "2",
    name: "Báo cáo 6 tháng.pdf",
    type: "PDF",
    size: "3.8 MB",
    author: "Cô Trà",
    date: "02/08/2026",
  },
  {
    id: "3",
    name: "VB-MAPP.xlsx",
    type: "XLSX",
    size: "540 KB",
    author: "Cô Lài",
    date: "29/07/2026",
  },
  {
    id: "4",
    name: "Video hướng dẫn.pdf",
    type: "PDF",
    size: "2.4 MB",
    author: "Admin",
    date: "20/07/2026",
  },
];

export default function DocumentUpload() {
  const [docs, setDocs] = useState<DocumentItem[]>(mockDocs);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const pdf = docs.filter((item) => item.type.toUpperCase() === "PDF").length;
    const office = docs.filter((item) =>
      ["DOC", "DOCX", "XLS", "XLSX"].includes(item.type.toUpperCase()),
    ).length;

    return [
      {
        label: "Tổng tài liệu",
        value: docs.length,
        icon: "bi-folder2-open",
        tone: "green",
      },
      {
        label: "Tài liệu PDF",
        value: pdf,
        icon: "bi-file-earmark-pdf",
        tone: "red",
      },
      {
        label: "Word / Excel",
        value: office,
        icon: "bi-file-earmark-spreadsheet",
        tone: "yellow",
      },
    ];
  }, [docs]);

  const handleChooseFiles = () => fileInputRef.current?.click();

  const addFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    if (!nextFiles.length) return;

    setSelectedFiles((current) => [...current, ...nextFiles]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const handleDelete = (id: string) => {
    setDocs((current) => current.filter((item) => item.id !== id));
  };

  const handleRemoveSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index));
  };

  return (
    <div className="document-page">
      <section className="document-page-title">
        <div>
          <span className="document-eyebrow">
            <i className="bi bi-folder2-open" /> Hồ sơ học sinh
          </span>
          <h1>Tài liệu tải lên</h1>
          <p>Quản lý tài liệu, biểu mẫu và hồ sơ đã tải lên của trẻ.</p>
        </div>

        <div className="document-top-actions">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <button
            type="button"
            className="document-btn document-btn-soft"
            onClick={handleChooseFiles}
          >
            <i className="bi bi-plus-lg" />
            Chọn tài liệu
          </button>

          <button
            type="button"
            className="document-btn document-btn-primary"
            disabled={!selectedFiles.length}
          >
            <i className="bi bi-cloud-arrow-up-fill" />
            Tải lên
            {selectedFiles.length > 0 && (
              <span className="document-btn-count">{selectedFiles.length}</span>
            )}
          </button>
        </div>
      </section>

      <section className="document-stats-grid">
        {stats.map((item) => (
          <article className="document-stat-card" key={item.label}>
            <div className={`document-stat-icon ${item.tone}`}>
              <i className={`bi ${item.icon}`} />
            </div>

            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="document-panel">
        <div className="document-panel-head">
          <div>
            <h3>Danh sách tài liệu</h3>
            <p>{docs.length} tài liệu đang được lưu trong hồ sơ.</p>
          </div>

          <div className="document-search">
            <i className="bi bi-search" />
            <input placeholder="Tìm tên tài liệu..." />
          </div>
        </div>

        {docs.length > 0 ? (
          <div className="document-table-wrap">
            <table className="document-table">
              <thead>
                <tr>
                  <th>Tên tài liệu</th>
                  <th>Loại</th>
                  <th>Dung lượng</th>
                  <th>Người tải</th>
                  <th>Ngày tải</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>

              <tbody>
                {docs.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="document-file-name">
                        <span className={`document-file-icon ${item.type.toLowerCase()}`}>
                          <i className={getFileIcon(item.type)} />
                        </span>
                        <div>
                          <strong>{item.name}</strong>
                          <span>Tài liệu hồ sơ học sinh</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`document-type-badge ${item.type.toLowerCase()}`}>
                        {item.type}
                      </span>
                    </td>
                    <td>{item.size}</td>
                    <td>
                      <span className="document-author">
                        <i className="bi bi-person-circle" /> {item.author}
                      </span>
                    </td>
                    <td>{item.date}</td>
                    <td>
                      <div className="document-row-actions">
                        <button type="button" title="Xem tài liệu">
                          <i className="bi bi-eye" />
                        </button>
                        <button type="button" title="Tải xuống">
                          <i className="bi bi-download" />
                        </button>
                        <button
                          type="button"
                          className="danger"
                          title="Xóa tài liệu"
                          onClick={() => handleDelete(item.id)}
                        >
                          <i className="bi bi-trash3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="document-empty-state">
            <i className="bi bi-folder2-open" />
            <h4>Chưa có tài liệu</h4>
            <p>Chọn hoặc kéo thả tài liệu vào khu vực bên dưới để bắt đầu.</p>
          </div>
        )}
      </section>

      <section
        className={`document-drop-zone ${isDragging ? "dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={handleChooseFiles}
      >
        <div className="document-upload-icon">
          <i className="bi bi-cloud-arrow-up-fill" />
        </div>
        <h3>Kéo thả tài liệu vào đây</h3>
        <p>Hoặc nhấn để chọn tài liệu từ thiết bị của bạn.</p>
        <span>PDF, Word, Excel và các định dạng tài liệu thông dụng</span>
      </section>

      {selectedFiles.length > 0 && (
        <section className="document-selected-panel">
          <div className="document-panel-head compact">
            <div>
              <h3>Tài liệu chờ tải lên</h3>
              <p>Kiểm tra lại trước khi nhấn “Tải lên”.</p>
            </div>
            <span className="document-selected-count">
              {selectedFiles.length} tài liệu
            </span>
          </div>

          <div className="document-selected-list">
            {selectedFiles.map((file, index) => (
              <div className="document-selected-item" key={`${file.name}-${index}`}>
                <span className="document-file-icon generic">
                  <i className="bi bi-file-earmark-text" />
                </span>
                <div className="document-selected-info">
                  <strong>{file.name}</strong>
                  <span>{formatFileSize(file.size)}</span>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveSelectedFile(index);
                  }}
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function getFileIcon(type: string) {
  switch (type.toUpperCase()) {
    case "PDF":
      return "bi bi-file-earmark-pdf-fill";
    case "DOC":
    case "DOCX":
      return "bi bi-file-earmark-word-fill";
    case "XLS":
    case "XLSX":
      return "bi bi-file-earmark-excel-fill";
    default:
      return "bi bi-file-earmark-text-fill";
  }
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
