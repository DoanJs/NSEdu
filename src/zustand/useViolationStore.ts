import { create } from "zustand";
import { ViolationModel } from "../models/ViolationModel";

type ViolationUpdate = Partial<Omit<ViolationModel, "id">>;

interface ViolationState {
  violations: ViolationModel[];
  loading: boolean;
  error: string | null;

  setViolations: (violations: ViolationModel[]) => void;
  addViolation: (violation: ViolationModel) => void;
  editViolation: (
    id: string,
    updates: ViolationUpdate,
  ) => void;
  removeViolation: (id: string) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  getViolationById: (
    id: string,
  ) => ViolationModel | undefined;

//   getViolationsByTeacherId: (
//     teacherId: string,
//   ) => ViolationModel[];

  clearViolations: () => void;
}

const useViolationStore = create<ViolationState>((set, get) => ({
  violations: [],
  loading: false,
  error: null,

  setViolations: (violations) =>
    set({
      violations,
      error: null,
    }),

  addViolation: (violation) =>
    set((state) => {
      const isExisting = state.violations.some(
        (item) => item.id === violation.id,
      );

      if (isExisting) {
        return {
          violations: state.violations.map((item) =>
            item.id === violation.id ? violation : item,
          ),
        };
      }

      return {
        violations: [violation, ...state.violations],
      };
    }),

  editViolation: (id, updates) =>
    set((state) => ({
      violations: state.violations.map((item) =>
        item.id === id
          ? {
              ...item,
              ...updates,
              id: item.id,
            }
          : item,
      ),
    })),

  removeViolation: (id) =>
    set((state) => ({
      violations: state.violations.filter(
        (item) => item.id !== id,
      ),
    })),

  setLoading: (loading) =>
    set({
      loading,
    }),

  setError: (error) =>
    set({
      error,
    }),

  getViolationById: (id) =>
    get().violations.find((item) => item.id === id),

//   getViolationsByTeacherId: (teacherId) =>
//     get().violations.filter(
//       (item) => item.teacherId === teacherId,
//     ),

  clearViolations: () =>
    set({
      violations: [],
      loading: false,
      error: null,
    }),
}));

export default useViolationStore;