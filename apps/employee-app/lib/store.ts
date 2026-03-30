// =============================================================================
// Employee App -- Zustand Store
// =============================================================================

import { create } from "zustand";

interface EmployeeState {
  isAuthenticated: boolean;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  position: string | null;
  hotelSlug: string | null;
  hotelId: string | null;
  hotelName: string | null;
  lang: "pl" | "en";
  isClockedIn: boolean;
  setAuthenticated: (auth: boolean) => void;
  setEmployee: (data: { id: string; name: string; department?: string; position?: string }) => void;
  setHotel: (data: { slug: string; id: string; name: string }) => void;
  setLang: (lang: "pl" | "en") => void;
  setClockedIn: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  isAuthenticated: false,
  employeeId: null,
  employeeName: null,
  department: null,
  position: null,
  hotelSlug: null,
  hotelId: null,
  hotelName: null,
  lang: "pl" as const,
  isClockedIn: false,
};

export const useAppStore = create<EmployeeState>((set) => ({
  ...initialState,
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setEmployee: (data) => set({
    employeeId: data.id,
    employeeName: data.name,
    department: data.department ?? null,
    position: data.position ?? null,
  }),
  setHotel: (data) => set({
    hotelSlug: data.slug,
    hotelId: data.id,
    hotelName: data.name,
  }),
  setLang: (lang) => set({ lang }),
  setClockedIn: (isClockedIn) => set({ isClockedIn }),
  reset: () => set(initialState),
}));
