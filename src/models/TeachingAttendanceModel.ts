import type { Timestamp } from "firebase/firestore";

export interface TeachingAttendanceEntry {
  hours: number | null;
  startTime: string | null;
}

export interface TeachingAttendanceModel {
  id: string;
  teacherId: string;
  childId: string;

  year: number;
  month: number;

  entries: Record<string, TeachingAttendanceEntry>;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
