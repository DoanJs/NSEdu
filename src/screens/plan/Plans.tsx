import moment from "moment";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { handleTimeStampFirestore } from "../../constants/convertTimeStamp";
import { formatDateSearch, getTimeValue } from "../../constants/info";
import { PlanModel } from "../../models";
import {
  usePlanStore,
  useSelectNavbarStore,
  useTeacherStore,
} from "../../zustand";

export default function PlanScreen() {
  const [keyword, setKeyword] = useState("");
  const { setSelectNavbar } = useSelectNavbarStore();
  const { plans } = usePlanStore();
  const [planNews, setPlanNews] = useState<PlanModel[]>([]);
  const { teachers } = useTeacherStore();

  useEffect(() => {
    if (plans) {
      const items = plans.filter((plan) => plan.status === "approved");
      setPlanNews(items);
    }
  }, [plans]);
  
  const teacherMap = useMemo(() => {
    const map: any = {};
    teachers.forEach((t) => {
      map[t.id] = t.fullName;
    });
    return map;
  }, [teachers]);

  const filteredPlans = useMemo(() => {
    const search = keyword.trim().toLowerCase();

    return planNews
      .filter((item: any) => {
        const teacherName = teacherMap[item.authorId] || "";

        const createdTime = formatDateSearch(item.createAt);
        const updatedTime = formatDateSearch(item.updateAt);

        const content = `
      ${item.title ?? ""}
      ${teacherName}
      ${createdTime}
      ${updatedTime}
    `.toLowerCase();

        return !search || content.includes(search);
      })
      .sort((a: any, b: any) => {
        return getTimeValue(b.createAt) - getTimeValue(a.createAt);
      });
  }, [planNews, keyword, teacherMap]);

  return (
    <>
      <style>{css}</style>

      <section className="page-head">
        <div>
          <h1>Kế hoạch can thiệp</h1>
          <p>
            Dùng để trích xuất mục tiêu, lập kế hoạch tháng và theo dõi tiến
            trình duyệt.
          </p>
        </div>

        <div className="head-actions">
          <Link
            to={"../cart"}
            className="primary-btn text-decoration-none"
            onClick={() => setSelectNavbar("cart")}
          >
            <i className="bi bi-plus-circle-fill"></i>
            Tạo kế hoạch mới
          </Link>

          <Link
            to={"../addreport"}
            onClick={() => setSelectNavbar("")}
            className="outline-btn text-decoration-none"
          >
            <i className="bi bi-file-earmark-plus"></i>
            Làm báo cáo
          </Link>
        </div>
      </section>

      <section className="filter-panel">
        <div className="search-box">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm tên KH, Gv thực hiện..."
          />
        </div>
        <div className="status-tabs">
          <button className={"active"}>
            <i className="bi bi-calendar2-check me-2"></i>
            {filteredPlans.length} Kế hoạch
          </button>
        </div>
      </section>

      <section className="plan-grid">
        {filteredPlans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            setSelectNavbar={setSelectNavbar}
            teacherMap={teacherMap}
          />
        ))}
      </section>
    </>
  );
}

function PlanCard({
  plan,
  setSelectNavbar,
  teacherMap
}: {
  plan: any;
  setSelectNavbar: (value: string) => void;
  teacherMap: any
}) {
  return (
    <article className="plan-card">
      <div className="plan-top">
        <div className="plan-icon">
          <i className="bi bi-calendar2-week-fill"></i>
        </div>

        <div>
          <h3>
            {plan.type} {plan.title}
          </h3>
          <p>
            <i className="bi bi-person-fill"></i>
            Giáo viên: {teacherMap[plan.authorId]}
          </p>
        </div>

        <StatusBadge status={plan.status} />
      </div>

      <div className="plan-meta">
        <div>
          <span>
            <i className="bi bi-send-fill"></i>
            Ngày gửi:
          </span>
          <strong>
            {typeof plan?.createAt === "number"
              ? moment(plan?.createAt).format("HH:mm:ss DD/MM/YYYY")
              : moment(handleTimeStampFirestore(plan?.createAt)).format(
                "HH:mm:ss DD/MM/YYYY",
              )}
          </strong>
        </div>

        <div>
          <span>
            <i className="bi bi-calendar-check"></i>
            Ngày duyệt:
          </span>
          <strong>
            {typeof plan?.updateAt === "number"
              ? moment(plan?.updateAt).format("HH:mm:ss DD/MM/YYYY")
              : moment(handleTimeStampFirestore(plan?.updateAt)).format(
                "HH:mm:ss DD/MM/YYYY",
              )}
          </strong>
        </div>
      </div>

      <div className="plan-actions">
        <Link
          to="../plandetail"
          className="view-btn btn"
          onClick={() => setSelectNavbar("")}
          state={{ plan }}
        >
          <i className="bi bi-eye-fill me-2"></i>
          Xem kế hoạch
        </Link>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const text =
    status === "approved"
      ? "Đã duyệt"
      : status === "pending"
        ? "Chờ duyệt"
        : status === "revision"
          ? "Cần sửa"
          : "Bản nháp";

  return (
    <span className={`status-badge ${status}`}>
      <i className="bi bi-check-circle-fill"></i>
      {text}
    </span>
  );
}

const css = `
:root {
  --green: #168B5C;
  --green-dark: #0F704A;
  --green-deep: #AD2837;
  --green-soft: #FFF1F3;
  --border: #DFF4E9;
  --red: #168B5C;
  --yellow: #f5b400;
  --text: #334155;
}

body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--text);
  background: #f8eff0;
}

.plan-page {
  min-height: 100vh;
  display: flex;
  background:
    radial-gradient(circle at top left, rgba(131,26,26, .13), transparent 30%),
    linear-gradient(135deg, #F7F9F8, #f7e9ea);
}

/* SIDEBAR */

.plan-sidebar {
  width: 300px;
  min-height: 100vh;
  padding: 22px 18px;
  background: rgba(255,255,255,.96);
  border-right: 1px solid var(--border);
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  z-index: 1200;
}

// .close-sidebar {
//   display: none;
// }

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 4px 24px;
}

.brand img {
  width: 58px;
  height: 58px;
  border-radius: 50%;
}

.brand h3 {
  margin: 0;
  color: var(--green-deep);
  font-size: 18px;
  font-weight: 950;
}

.brand p {
  margin: 2px 0 0;
  color: var(--green);
  font-size: 12px;
  font-weight: 800;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.menu-item {
  position: relative;
  height: 58px;
  border: 0;
  border-radius: 20px;
  background: transparent;
  color: #5a3434;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px;
  transition: .2s;
}

.menu-item span {
  width: 36px;
  height: 36px;
  border-radius: 13px;
  background: #fff7d6;
  color: #b7791f;
  display: grid;
  place-items: center;
  font-size: 17px;
}

.menu-item b {
  font-size: 15px;
}

.menu-item.active {
  background: linear-gradient(135deg, #FFF1F3, #F7F9F8);
  color: var(--green-deep);
  box-shadow: inset 5px 0 0 var(--green);
}

.menu-item.active span {
  color: var(--green);
  background: #DFF4E9;
}

.menu-item em {
  margin-left: auto;
  min-width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #DFF4E9;
  color: var(--red);
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 12px;
  font-weight: 900;
}

.sidebar-footer {
  margin-top: auto;
  padding: 28px 18px;
  border-radius: 24px;
  text-align: center;
  background:
    radial-gradient(circle at top, #ffffff, transparent 42%),
    linear-gradient(135deg, #fef9f9, #DFF4E9);
  border: 1px solid var(--border);
}

.heart {
  width: 64px;
  height: 64px;
  margin: auto;
  border-radius: 50%;
  background: white;
  color: var(--red);
  display: grid;
  place-items: center;
  font-size: 26px;
}

.sidebar-footer p {
  margin: 18px 0 2px;
  color: red;
  font-weight: 700;
}

.sidebar-footer strong {
  color: red;
}

.sidebar-overlay {
  display: none;
}

/* MAIN */

.plan-main {
  flex: 1;
  min-width: 0;
  padding: 0 26px 32px;
}

.topbar {
  height: 78px;
  display: grid;
  grid-template-columns: 54px 300px minmax(360px, 1fr) 290px;
  gap: 18px;
  align-items: center;
}

.menu-btn {
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 15px;
  background: #FFF1F3;
  color: var(--green);
  font-size: 22px;
}

.info-box,
.teacher-box {
  height: 62px;
  border-radius: 20px;
  background: white;
  border: 1px solid var(--border);
  box-shadow: 0 10px 28px rgba(99,13,13, .06);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
}

.info-box img {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  object-fit: cover;
}

.info-box strong,
.teacher-box strong {
  display: block;
  color: var(--green-deep);
  font-weight: 950;
}

.info-box span,
.teacher-box span {
  color: #7e6161;
  font-size: 13px;
  font-weight: 600;
}

.teacher-icon {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  background: #DFF4E9;
  color: var(--red);
  display: grid;
  place-items: center;
  font-size: 22px;
}

/* PAGE HEAD */

.page-head {
  padding: 28px 0 20px;
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.page-head h1 {
  margin: 0;
  color: var(--green-deep);
  font-size: 36px;
  font-weight: 950;
}

.page-head p {
  margin: 6px 0 0;
  color: #64748B;
  font-weight: 650;
}

.head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.primary-btn,
.outline-btn {
  height: 46px;
  border-radius: 15px;
  padding: 0 18px;
  font-weight: 900;
  display: flex;
  align-items: center;
  gap: 8px;
}

.primary-btn {
  border: 0;
  color: white;
  background: linear-gradient(135deg, var(--green), var(--green-dark));
}

.outline-btn {
  color: var(--green);
  background: white;
  border: 1px solid var(--green);
}

/* SUMMARY */

// .summary-grid {
//   display: grid;
//   grid-template-columns: repeat(4, 1fr);
//   gap: 16px;
//   margin-bottom: 22px;
// }

.summary-card {
  padding: 20px;
  border-radius: 24px;
  background: white;
  border: 1px solid var(--border);
  box-shadow: 0 14px 34px rgba(99,13,13, .07);
  display: flex;
  align-items: center;
  gap: 14px;
}

.summary-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: #FFF1F3;
  color: var(--green);
  display: grid;
  place-items: center;
  font-size: 24px;
}

.summary-card.warning .summary-icon {
  background: #fff7d6;
  color: var(--yellow);
}

.summary-card.danger .summary-icon {
  background: #DFF4E9;
  color: var(--red);
}

.summary-card p {
  margin: 0;
  color: #7e6161;
  font-weight: 800;
}

.summary-card h3 {
  margin: 2px 0 0;
  color: var(--green-deep);
  font-size: 30px;
  font-weight: 950;
}

/* FILTER */

.filter-panel {
  padding: 18px;
  border-radius: 24px;
  background: white;
  border: 1px solid var(--border);
  box-shadow: 0 14px 36px rgba(99,13,13, .07);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 18px;
  align-items: center;
}

.search-box {
  height: 50px;
  border-radius: 16px;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
}

.search-box i {
  color: var(--green);
}

.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  font-weight: 600;
}

.status-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-tabs button {
  height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 16px;
  background: #FFF1F3;
  color: var(--green-deep);
  font-weight: 900;
}

.status-tabs button.active {
  color: var(--green);
}

/* PLAN CARD */

.plan-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
}

.plan-card {
  padding: 20px;
  border-radius: 26px;
  background: white;
  border: 1px solid var(--border);
  box-shadow: 0 16px 40px rgba(99,13,13, .09);
  transition: .22s;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 22px 55px rgba(99,13,13, .15);
}

.plan-top {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.plan-icon {
  width: 66px;
  height: 66px;
  border-radius: 20px;
  background: #fef6f7;
  border: 2px solid #f5d0d3;
  color: #b7791f;
  display: grid;
  place-items: center;
  font-size: 28px;
  flex-shrink: 0;
}

.plan-top h3 {
  margin: 4px 0 6px;
  color: var(--green-deep);
  font-size: 20px;
  font-weight: 950;
}

.plan-top p {
  margin: 0;
  color: #64748B;
  font-size: 13px;
  font-weight: 650;
}

.plan-top p i {
  color: var(--red);
  margin-right: 4px;
}

.status-badge {
  margin-left: auto;
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 950;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.status-badge.approved {
  background: #DFF4E9;
  color: var(--green-deep);
}

.status-badge.pending {
  background: #fff3cd;
  color: #9a6700;
}

.status-badge.revision {
  background: #DFF4E9;
  color: #0F704A;
}

.status-badge.draft {
  background: #e5e7eb;
  color: #374151;
}

.plan-meta {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.plan-meta div {
  padding: 12px;
  border-radius: 16px;
  background: #faf0f1;
  border: 1px solid var(--border);
}

.plan-meta span {
  display: block;
  color: #64748B;
  font-size: 12px;
  font-weight: 850;
}

.plan-meta span i {
  color: var(--yellow);
  margin-right: 5px;
}

.plan-meta strong {
  color: var(--green-deep);
  font-size: 13px;
}

// .plan-stats {
//   margin-top: 16px;
//   padding: 14px;
//   border-radius: 18px;
//   background: #F7F9F8;
//   display: grid;
//   grid-template-columns: 1fr 1fr 1.4fr;
//   gap: 10px;
// }

// .plan-stats strong {
//   display: block;
//   color: var(--green-deep);
//   font-weight: 950;
// }

// .plan-stats span {
//   color: #7e6161;
//   font-size: 12px;
//   font-weight: 700;
// }

.plan-actions {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.view-btn,
.more-btn {
  height: 46px;
  border-radius: 15px;
  font-weight: 900;
}

.view-btn {
  border: 1px solid var(--border);
  background: white;
  color: var(--green-deep);
}

.more-btn {
  border: 0;
  color: white;
  background: var(--green);
}

.footer {
  margin-top: 28px;
  padding: 18px 22px;
  border-radius: 22px;
  background: rgba(255,255,255,.75);
  border: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  color: #64748B;
  font-weight: 650;
}

/* MODAL */

.modal-layer {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(68,8,8, .36);
  display: grid;
  place-items: center;
  padding: 20px;
}

.modal-card {
  width: min(760px, 100%);
  padding: 26px;
  border-radius: 28px;
  background: white;
  box-shadow: 0 30px 80px rgba(68,8,8, .25);
}

.modal-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.modal-head p {
  margin: 0;
  color: var(--green);
  font-weight: 900;
}

.modal-head h3 {
  margin: 2px 0 0;
  color: var(--green-deep);
  font-weight: 950;
}

.modal-head button {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 14px;
  color: var(--green);
  background: #FFF1F3;
}

.modal-card label {
  color: var(--green-deep);
  font-weight: 850;
  margin-bottom: 6px;
}

.modal-card .form-control,
.modal-card .form-select {
  border-radius: 14px;
  border: 1px solid var(--border);
  min-height: 46px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.modal-actions button {
  height: 44px;
  border-radius: 999px;
  padding: 0 18px;
  font-weight: 900;
}

.cancel-btn {
  border: 0;
  background: #f4eeef;
  color: #5a3434;
}

.save-btn {
  border: 0;
  color: white;
  background: var(--green);
}

.submit-btn {
  border: 0;
  color: white;
  background: var(--red);
}

/* RESPONSIVE */

@media (max-width: 1300px) {
  .plan-sidebar {
    position: fixed;
    left: -320px;
    top: 0;
    height: 100vh;
    transition: .28s ease;
    box-shadow: 20px 0 60px rgba(68,8,8, .18);
  }

  .plan-sidebar.show {
    left: 0;
  }

//   .close-sidebar {
//     display: grid;
//     place-items: center;
//     position: absolute;
//     right: -52px;
//     top: 18px;
//     width: 42px;
//     height: 42px;
//     border: 0;
//     border-radius: 14px;
//     background: white;
//     color: var(--green);
//     box-shadow: 0 10px 30px rgba(0,0,0,.15);
//   }

  .sidebar-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: rgba(68,8,8, .35);
  }

  .topbar {
    grid-template-columns: 54px 1fr 1fr;
  }

  .user-box {
    display: flex;
  }

  .plan-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  // .summary-grid {
  //   grid-template-columns: repeat(2, 1fr);
  // }
}

@media (max-width: 900px) {
  .plan-main {
    padding: 0 14px 24px;
  }

  .topbar {
    height: auto;
    grid-template-columns: 54px 1fr;
    padding: 14px 0;
  }

  .teacher-box {
    grid-column: 1 / -1;
  }

  .page-head {
    flex-direction: column;
  }

  .filter-panel {
    grid-template-columns: 1fr;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }

  .footer {
    flex-direction: column;
    gap: 8px;
  }
}

@media (max-width: 576px) {
  .topbar {
    grid-template-columns: 46px 1fr;
    gap: 10px;
  }

  .menu-btn {
    width: 42px;
    height: 42px;
  }

  .info-box,
  .teacher-box {
    height: auto;
    min-height: 58px;
    padding: 10px 12px;
  }

  .teacher-box {
    // display: flex;
  }

  .page-head h1 {
    font-size: 28px;
  }

  .head-actions {
    width: 100%;
  }

  .primary-btn,
  .outline-btn {
    width: 100%;
    justify-content: center;
  }

  // .summary-grid {
  //   grid-template-columns: 1fr;
  // }

  .plan-top {
    flex-wrap: wrap;
  }

  .status-badge {
    margin-left: 0;
  }

  .plan-meta {
    grid-template-columns: 1fr;
  }

  .modal-card {
    padding: 20px;
  }

  .modal-actions {
    flex-direction: column;
  }

  .modal-actions button {
    width: 100%;
  }
}
`;
