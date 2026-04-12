// =============================================================================
// Employee App -- Zustand Store (persisted via AsyncStorage)
// =============================================================================

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  isBiometricEnrolled: boolean;
  isHotelOnboarded: boolean;
  pushEnabled: boolean;
  pendingClockIn: { qrToken: string; latitude: number; longitude: number; gpsAccuracy?: number } | null;
  setAuthenticated: (auth: boolean) => void;
  setEmployee: (data: { id: string; name: string; department?: string; position?: string }) => void;
  setHotel: (data: { slug: string; id: string; name: string }) => void;
  setLang: (lang: "pl" | "en") => void;
  setClockedIn: (value: boolean) => void;
  setBiometricEnrolled: (v: boolean) => void;
  setHotelOnboarded: (v: boolean) => void;
  setPushEnabled: (v: boolean) => void;
  setPendingClockIn: (data: { qrToken: string; latitude: number; longitude: number; gpsAccuracy?: number } | null) => void;
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
  isBiometricEnrolled: false,
  isHotelOnboarded: false,
  pushEnabled: false,
  pendingClockIn: null,
};

export const useAppStore = create<EmployeeState>()(
  persist(
    (set) => ({
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
      setBiometricEnrolled: (isBiometricEnrolled) => set({ isBiometricEnrolled }),
      setHotelOnboarded: (isHotelOnboarded) => set({ isHotelOnboarded }),
      setPushEnabled: (pushEnabled) => set({ pushEnabled }),
      setPendingClockIn: (pendingClockIn) => set({ pendingClockIn }),
      reset: () => set(initialState),
    }),
    {
      name: "employee-app-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        employeeId: state.employeeId,
        employeeName: state.employeeName,
        department: state.department,
        position: state.position,
        hotelSlug: state.hotelSlug,
        hotelId: state.hotelId,
        hotelName: state.hotelName,
        lang: state.lang,
        isBiometricEnrolled: state.isBiometricEnrolled,
        isHotelOnboarded: state.isHotelOnboarded,
        pushEnabled: state.pushEnabled,
        // NOT persisted: isClockedIn (re-fetched from API), pendingClockIn (ephemeral)
      }),
    },
  ),
);
