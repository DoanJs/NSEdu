import { FieldValue } from "firebase/firestore";

export const CENTER_NAME = "TRUNG TÂM TÂM LÝ GIÁO DỤC NGÔI SAO XANH";
export const FIRST_NAME = "TRUNG TÂM TÂM LÝ GIÁO DỤC";
export const LAST_NAME = "NGÔI SAO XANH";
export const activeCategoryDefault = "72yiP0hy8JvWNzkfRvFC"; //HoaBanMaiEdu-Mobile
export const indexedDBName = "NSXEdu";
export const ADMINID = "lEb3FS0MGxYa6kanefDy3hSY94s2";
export const fieldOrder = [
  "72yiP0hy8JvWNzkfRvFC", //Tiền ngôn ngữ
  "bwqVFGozJmfXnIwChrcD", //Nhận thức
  "RypjxfEWSiDlkhyfvMRt", //Ngôn ngữ hiểu
  "sGrlMWhpSN1GXBAfztHL", //Ngôn ngữ diễn đạt
  "Pu6SZQyd27wikZzkvLRi", //Vận động thô
  "ecp6XI9D7tjbmcPiolmg", //Vận động tinh
  "lAKIPjnNFfdWoK0bS4vd", //Hành vi
  "vevLNEOgpsIPimRgnLqS", //Phát âm
  "iaQrRpHfqbeGIJ5qSKjR", //Giác quan
  "uhOtRMlYeF1yO3aRMfey", //Kỹ năng xã hội
  "wVgUYmEzLBLSEIqjOfIK", //Kỹ năng chơi
  "L2EtGPafBpvAZZw0OJO7", //Tiền học đường
  "3KxQC0DZigFe1XI3OgnN", //Lớp 1
  "KtTmY35r5T5jHSeq2mxS", //Lớp 2
  "kODftziCORJlSqJPckY9", //Lớp 3
  "i4r70ufAyoTgeEpCNISQ", //Lớp 4
  "k0fzrSkuy94WqW7penmY", //Lớp 5
  "D9X7OJTeJaM35bAmjBXW", //ABLLS
];

export const teachlefttop = '/teachlefttop.png'
export const teachrighttop = '/teachrighttop.png'
export const teachleftbot = '/teachleftbot.png'
export const teachrightbot = '/teachrightbot.png'
export const icon512 = '/NSXEdu-icon-512x512.png'


// functions
export const getRangeByKeyword = (
  monthYear: string,
  keyword: string
): { start: string; end: string } => {
  // monthYear: "07/2026"
  // keyword: "1-2" | "3-4"

  const [month, year] = monthYear.split("/").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const format = (day: number) =>
    `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;

  switch (keyword) {
    case "1-2":
      return {
        start: format(1),
        end: format(14),
      };

    case "3-4":
      return {
        start: format(15),
        end: format(daysInMonth),
      };

    default:
      throw new Error("Keyword không hợp lệ");
  }
}

export const normalizeIntervention = (value: any): string[] => {
  if (Array.isArray(value)) return value;
  return ["-1", "-1"];
};
export const getChildAge = (timestamp: any) => {
  if (!timestamp) return "";

  let birth: Date;

  if (timestamp instanceof Date) {
    birth = timestamp;
  } else if (typeof timestamp?.toDate === "function") {
    birth = timestamp.toDate();
  } else if (typeof timestamp?.seconds === "number") {
    birth = new Date(timestamp.seconds * 1000);
  } else {
    birth = new Date(timestamp);
  }

  if (Number.isNaN(birth.getTime())) return "";

  const today = new Date();

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  if (today.getDate() < birth.getDate()) {
    months--;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const totalMonths = years * 12 + months;

  return totalMonths >= 0 ? `${totalMonths} tháng` : "";
};

export const convertTimestampToDateInput = (value: any): string => {
  if (!value) return "";

  let date: Date;

  // Firestore Timestamp
  if (typeof value?.toDate === "function") {
    date = value.toDate();
  }
  // Object { seconds, nanoseconds }
  else if (typeof value?.seconds === "number") {
    date = new Date(value.seconds * 1000);
  }
  // Date object
  else if (value instanceof Date) {
    date = value;
  }
  // String yyyy-MM-dd
  else if (typeof value === "string") {
    return value.split("T")[0];
  }
  // fallback
  else {
    date = new Date(value);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};
export const getPreviousMonth = () => {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const month = String(previous.getMonth() + 1).padStart(2, "0");
  const year = previous.getFullYear();

  return `${month}/${year}`;
};
export const getCurrentMonth = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  return `${month}/${year}`;
};
export const getNextMonth = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const month = String(next.getMonth() + 1).padStart(2, "0");
  const year = next.getFullYear();

  return `${month}/${year}`;
};
export const formatDateSearch = (time: any) => {
  const timeMs = getTimeMs(time);

  if (!timeMs) return "";

  const date = new Date(timeMs);

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year} ${month}/${year} ${year}`;
};

export const handleCommentTotal = (array: any[]) => {
  // eslint-disable-next-line
  let isComment: boolean = false;
  array.map((_: any) => {
    if (_.comment && _.status === "pending") {
      isComment = true;
    }
  });

  return isComment;
};
export const parseVNDate = (dateStr: string) => {
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day); // month - 1 vì JS đếm từ 0
};
export const calculateAgeDetail = (birthStr: string) => {
  const birth = parseVNDate(birthStr);
  const now = new Date();

  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
};

type TimeAtModel = {
  seconds: number;
  nanoseconds: number;
};

export const getTimeValue = (time: number | TimeAtModel | FieldValue) => {
  if (typeof time === "number") {
    return time;
  }

  if (time && typeof time === "object" && "seconds" in time) {
    return time.seconds * 1000 + time.nanoseconds / 1_000_000;
  }

  return 0;
};

export const getTimeMs = (time: any): number => {
  if (!time) return 0;

  // Firestore Timestamp instance
  if (typeof time.toMillis === "function") {
    return time.toMillis();
  }

  // Firestore Timestamp có toDate()
  if (typeof time.toDate === "function") {
    return time.toDate().getTime();
  }

  // Dạng { seconds, nanoseconds }
  if (
    typeof time === "object" &&
    "seconds" in time &&
    typeof time.seconds === "number"
  ) {
    return time.seconds * 1000 + (time.nanoseconds ?? 0) / 1_000_000;
  }

  // Date.now() hoặc timestamp number
  if (typeof time === "number") {
    return time;
  }

  // string date nếu có
  const parsed = new Date(time).getTime();

  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Lấy ngày đầu tháng và cuối tháng từ chuỗi MM/YYYY
 * @param {string} monthYear - Ví dụ: "6/2026" hoặc "06/2026"
 * @returns {{firstDay: string, lastDay: string}}
 */
export const getMonthRange = (monthYear: string) => {
  const [month, year] = monthYear.split("/").map(Number);

  const firstDate = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0);

  return {
    firstDay: formatDate(firstDate),
    lastDay: formatDate(lastDate),
  };
};

/**
 * Format Date thành dd/MM/yyyy
 * @param {Date} date
 * @returns {string}
 */
export const formatDate = (date: Date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
};

export const getOnlineStatus = (status: any) => {
  if (!status) return "Chưa xác định";

  if (status.online === true) return "🟢 Đang online";

  if (!status.lastSeen) return "Chưa xác định";

  const lastSeen =
    typeof status.lastSeen === "number"
      ? status.lastSeen
      : status.lastSeen?.toDate
        ? status.lastSeen.toDate().getTime()
        : null;

  if (!lastSeen) return "Chưa xác định";

  const diff = Date.now() - lastSeen;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "⚪ Vừa offline";
  if (minutes < 60) return `⚪ Offline ${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `⚪ Offline ${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  return `⚪ Offline ${days} ngày trước`;
};
