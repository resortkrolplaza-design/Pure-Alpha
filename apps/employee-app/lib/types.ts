// =============================================================================
// Employee App -- TypeScript Types
// =============================================================================

// -- API Response Envelope ----------------------------------------------------

export interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  errorMessage?: string;
  errors?: Record<string, string[]>;
}

// -- Shift Data ---------------------------------------------------------------

export interface ShiftData {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  status: string;
  department: string;
  position: string | null;
  isOwnShift: boolean;
}

// -- Dashboard Data -----------------------------------------------------------

export interface DashboardData {
  todayShift: ShiftData | null;
  upcomingShifts: ShiftData[];
  weekStats: {
    scheduledHours: number;
    completedShifts: number;
    totalShifts: number;
  };
  isClockedIn: boolean;
}

// -- Leave Request ------------------------------------------------------------

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveType = "vacation" | "sick" | "personal" | "unpaid" | "parental" | "other";

export interface LeaveRequest {
  id: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface LeaveBalance {
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  pendingDays: number;
}

export interface LeaveData {
  balance: LeaveBalance;
  requests: LeaveRequest[];
}

