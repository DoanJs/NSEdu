import { FieldValue } from "firebase/firestore";

export interface ViolationModel {
  id: string;
  teacherId: string;
  date: string;
  types: ViolationType[];
  imgs: string[];
  note: string;

  createAt: FieldValue | number;
  updateAt: FieldValue | number;
}

type ViolationType = "clothes" | "time" | "dirty" | 'document' | 'phone' | 'baby';
