export type Shift = "morning" | "afternoon";
export type Action = "checkIn" | "checkOut";
export interface Staff {
  uid: string;
  name: string;
  role: string;
  branchId: string;
  initials: string;
  color: string;
  avatar?: string;
}
export interface ClockIn {
  id: string;
  at: string;
  branchId: string;
  gpsAccuracyMeters: number;
  lat: number;
  lng: number;
  score: number | null;
  photoKey: string;
  sessionId?: string;
}
export interface Attendance {
  uid: string;
  date: string;
  morning: ClockIn | null; // Vào sáng (tương thích dữ liệu cũ)
  afternoon: ClockIn | null; // Vào chiều
  morningOut: ClockIn | null;
  afternoonOut: ClockIn | null;
}
export interface Branch {
  id: string;
  name: string;
  address: string;
  radiusMeters: number;
  enabled: boolean;
  lat: number;
  lng: number;
}
export interface MonthlySummary {
  uid: string;
  morningShifts: number;
  afternoonShifts: number;
  fullDays: number;
  halfDays: number;
  daysWithAttendance: number;
  totalShifts: number;
  workDays: number;
  totalTurns: number;
  completeShifts: number;
  totalMinutes: number;
}
export interface AttendanceDataset {
  staff: Staff[];
  attendances: Attendance[];
  branches: Branch[];
  summaries: MonthlySummary[];
}
