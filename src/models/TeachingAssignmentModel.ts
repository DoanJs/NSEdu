import { Timestamp } from "firebase/firestore";

export interface TeachingAssignmentModel {
  id: string;
  teacherId: string;
  childId: string;
  session: 'day' | 'night'
  status: "active" | "inactive";
  defaultHours : number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
