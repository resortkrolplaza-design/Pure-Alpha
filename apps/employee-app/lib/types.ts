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
  department: string | null;
  position: string | null;
  isOwnShift?: boolean;
}

// -- Dashboard Data -----------------------------------------------------------

interface ActiveShift {
  id: string;
  clockInTime: string;
  startTime: string;
  endTime: string;
  department: string;
  shiftType: string;
  scheduledHours: number;
}

export interface DashboardData {
  todayShift: ShiftData | null;
  upcomingShifts: ShiftData[];
  weekStats: {
    scheduledHours: number;
    completedShifts: number;
    totalShifts: number;
  };
  isClockedIn: boolean;
  activeShift: ActiveShift | null;
  leaveBalance: LeaveBalance;
  stats: {
    hoursThisMonth: number;
    scheduledHoursThisMonth: number;
    overtimeThisMonth: number;
    earningsThisMonth: number | null;
    earningsProjected: number | null;
    hourlyRateNet: number | null;
    pendingLeaveRequests: number;
    vacationRemaining: number;
  };
  serverTime: string;
}

// -- Leave Request ------------------------------------------------------------

// Backend returns UPPERCASE enums, frontend form uses lowercase -- accept both
type LeaveStatus =
  | "pending" | "approved" | "rejected" | "cancelled"
  | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type LeaveType =
  | "vacation" | "sick" | "personal" | "unpaid" | "parental" | "other"
  | "childcare" | "compassionate" | "training" | "blood_donation" | "maternity" | "paternity" | "sick_childcare"
  | "VACATION" | "SICK" | "ON_DEMAND" | "UNPAID" | "OTHER" | "COMPASSIONATE" | "TRAINING"
  | "PARENTAL" | "CHILDCARE_LEAVE" | "MATERNITY" | "PATERNITY" | "SICK_CHILDCARE" | "BLOOD_DONATION";

export interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  workDays?: number;
  reason: string | null;
  status: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  requestedAt?: string;
  createdAt: string;
}

export interface LeaveBalance {
  year?: number;
  totalDays: number;
  usedDays: number;
  plannedDays?: number;
  remainingDays: number;
  pendingRequests?: number;
  onDemandEntitlement?: number;
  onDemandUsed?: number;
  sickDaysUsed?: number;
}


