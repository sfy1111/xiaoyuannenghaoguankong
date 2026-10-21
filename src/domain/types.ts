export type EnergyType = 'electricity' | 'water' | 'gas' | 'heat' | 'cooling' | 'hotWater';

export type Quality = 'valid' | 'missing' | 'estimated' | 'invalid' | 'manual_corrected';

export type ReadingType = 'cumulative' | 'interval' | 'instantaneous';

export type Direction = 'import' | 'export' | 'internal';

export type PointRole = 'main' | 'submeter' | 'plantOutput' | 'public';

export type DayType = 'teaching' | 'weekend' | 'exam' | 'vacation' | 'holiday' | 'special';

export type BuildingCategory =
  | 'teaching' | 'lab' | 'library' | 'dormitory' | 'canteen'
  | 'office' | 'gym' | 'datacenter' | 'logistics' | 'plant';

export interface Campus {
  id: string; code: string; name: string; address: string;
  area: number; teachingArea: number; dormArea: number;
  inUseDate: string; status: string; studentCount: number;
  energyEntrances: string[];
}

export interface Building {
  id: string; code: string; name: string; campusId: string; category: BuildingCategory;
  buildingArea: number; assessmentArea: number; floors: number; builtYear: number;
  departmentId: string; coolingMode: string; heatingMode: string;
  hasGas?: boolean; hasCentralCooling?: boolean; hasHotWater?: boolean; hotWaterMode?: string;
  status: 'active' | 'inactive'; openHoursId?: string; remark?: string;
}

export interface Floor { id: string; buildingId: string; floorNo: number; rooms: number; area: number; usage: string; }

export interface Department {
  id: string; code: string; name: string; parent: string | null;
  type: string; manager: string; phone: string; campusIds: string[];
  costCenter: string; validFrom: string;
}

export interface BuildingDeptRelation {
  id: string; buildingId: string; departmentId: string; share: number;
  basis: string; validFrom: string; status: string;
}

export interface Meter {
  id: string; name: string; energyType: EnergyType; meterNo: string; model: string;
  accuracy: string; installDate: string; lastCheck: string; nextCheck: string | null;
  status: 'active' | 'replaced' | 'inactive'; billing: boolean;
  location: string; deviceId: string; ratioText: string;
  swap?: { replacedAt: string; terminalReading: number; reason: string; newMeterId: string };
  swapNote?: string;
}

export interface MeteringPoint {
  id: string; code: string; name: string; meterId: string; iotPropertyId: string | null;
  energyType: EnergyType; campusId: string; buildingId: string | null;
  direction: Direction; role: PointRole; usage: string;
  readingType: ReadingType; unit: string; validFrom: string; validTo?: string;
  subitem?: string; equipmentTag?: string; alwaysOn?: boolean;
}

export interface MeterRelation {
  id: string; parentId: string; childId: string;
  relationType: 'contains' | 'supplies'; validFrom: string;
}

export interface IotCandidate {
  id: string; deviceId: string; deviceName: string; gatewayId: string; campusId: string;
  code: string; name: string; valueType: 'cumulative' | 'instantaneous';
  readingType: string; unit: string; energyType: EnergyType;
  online: boolean; lastSeen: string; boundPointId: string | null; remark?: string;
}

export interface IotGateway {
  id: string; name: string; campusId: string; location: string;
  online: boolean; lastHeartbeat: string;
}

export interface Semester {
  id: string; academicYearId: string; name: string; start: string; end: string;
  type: 'term' | 'winterBreak' | 'summerBreak';
}

export interface ExamWeek { id: string; name: string; start: string; end: string; }

export interface SpecialDay {
  id: string; date: string; end: string; type: 'holiday' | 'special'; name: string;
}

export interface OpenHoursRule {
  id: string; category: string; weekdays: number[];
  start: string; end: string; examExtension: string;
  breakStart: string; breakEnd: string; remark: string;
}

export interface CampusCalendarData {
  academicYears: { id: string; name: string; start: string; end: string }[];
  semesters: Semester[];
  examWeeks: ExamWeek[];
  specialDays: SpecialDay[];
  openHours: OpenHoursRule[];
}

export interface PriceSegment { key: string; name: string; start: string; end: string; price: number; }

export interface PricePlan {
  id: string; code: string; name: string; energyType: EnergyType; supplier: string;
  validFrom: string; validTo: string; status: 'active' | 'inactive';
  applicableScope: string; currency: string; billingUnit: string;
  segments?: PriceSegment[];
  waterBase?: number; sewageFee?: number; price?: number;
  note: string; version: number;
}

export interface EnergyBill {
  id: string; period: string; energyType: EnergyType; campusId: string; supplier: string;
  billingPointIds: string[]; billNo: string;
  usageDeltaPct: number; extraFee: number; extraFeeNote: string | null;
  differenceReason: string | null;
  status: 'pending' | 'confirmed' | 'archived';
  confirmedBy: string | null; confirmedAt: string | null;
  /** 人工录入账单时的抄见量/账单金额（优先于推算值） */
  billedUsageOverride?: number;
  billedAmountOverride?: number;
  entryNote?: string;
}

export interface EnergyProject {
  id: string; name: string; buildings: string[]; type: string;
  status: 'completed' | 'inProgress' | 'planned';
  implementDate: string;
  baseline: { from: string; to: string; note: string } | null;
  measure: string; investment: number; plannedSaving: number;
  owner: string; evaluation: string; evidence: string;
}

export interface BudgetAdjustment {
  id: string; month: string;
  energyType: 'electricity' | 'water' | 'gas';
  amount: number; reason: string;
  adjustedBy: string; adjustedAt: string;
}

export interface AlarmTimelineItem { time: string; actor: string; action: string; note: string; }

export interface Alarm {
  id: string; code: string; title: string; time: string;
  campusId: string; buildingId: string | null; pointId: string | null;
  energyType: EnergyType; ruleId: string; severity: 'critical' | 'major' | 'minor';
  detectedValue: string; threshold: string;
  status: 'pending' | 'processing' | 'reviewing' | 'closed' | 'suspended';
  handler: string | null; isFalse: boolean; workOrderId: string | null;
  timeline: AlarmTimelineItem[];
}

export interface AlarmRule {
  id: string; name: string; description: string; objectScope: string;
  threshold: string; duration: string; enabled: boolean;
  excludeSpecialDays: boolean; notifyRoles: string[];
  approver: string; lastApprovedAt: string | null;
  whitelist?: string; note?: string;
}

export interface WorkOrderAction { time: string; actor: string; action: string; note: string; }

export interface WorkOrder {
  id: string; code: string; title: string; source: string; alertId: string | null;
  type: string; campusId: string; buildingId: string | null; pointId: string | null;
  assignee: string; assigneeDept: string; priority: 'high' | 'medium' | 'low';
  deadline: string;
  status: 'assigned' | 'processing' | 'reviewing' | 'completed' | 'rejected';
  createdAt: string; startedAt: string | null; completedAt: string | null;
  actions: WorkOrderAction[];
  result: string | null; reviewer: string | null; reviewNote: string | null; reviewedAt: string | null;
}

export interface DataCorrection {
  id: string; pointId: string; start: string; end: string; values: number[];
  quality: Quality; source: string; reason: string; evidence: string;
  applicant: string; appliedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer: string | null; reviewNote: string | null; reviewedAt: string | null;
}

export interface AuditLog {
  id: string; time: string; actor: string; module: string; action: string;
  objectId: string; detail: string; before: string; after: string;
}

export interface TargetEntry {
  id: string; year: number;
  scopeType: 'campus' | 'category' | 'building'; scopeId: string | null; scopeName: string;
  indicator: string; unit: string; target: number; direction: 'lower' | 'higher';
  basis: string; status: string; owner: string; note: string;
}

export interface Role {
  id: string; name: string; description: string;
  canView: string[]; canEdit: string[]; canApprove: string[];
  allowedCampusIds: string[]; departmentId?: string;
  restrictions: string[];
}

export interface User {
  id: string; account: string; name: string; title: string;
  roleId: string; departmentId: string; phone: string;
  status: string; lastLogin: string; authType: string;
}

export interface IntegrationEndpoint {
  id: string; name: string; type: string; schedule: string; lastRun: string;
  status: 'success' | 'warning' | 'error'; pointCount: number;
  errorCount: number; retryCount: number; lastError: string | null;
  backlogWindows?: { pointId: string; from: string; to: string; reason: string }[];
}

export interface TelemetryEvent {
  id: string; pointId: string;
  type: 'missing' | 'estimated' | 'invalid' | 'surge' | 'nightSurge' | 'swap';
  start?: string; end?: string; at?: string; newBase?: number;
  hours?: number[]; factor?: number; dayHoursOnly?: boolean;
  reason: string;
}

export interface Sample {
  timestamp: string; value: number | null; quality: Quality;
}

export interface PeriodUsage {
  total: number | null;
  coverage: number;
  counted: number;
  expected: number;
  hasMissing: boolean;
  hasEstimated: boolean;
  hasInvalid: boolean;
  hasManualCorrected: boolean;
  incomplete: boolean;
  partial: boolean;
}