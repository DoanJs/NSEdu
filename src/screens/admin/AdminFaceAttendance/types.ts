export type Shift = "morning" | "afternoon";
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
  morning: ClockIn | null;
  afternoon: ClockIn | null;
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
}
export interface AttendanceDataset {
  staff: Staff[];
  attendances: Attendance[];
  branches: Branch[];
  summaries: MonthlySummary[];
}
