export type RoleName =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "PARENT"
  | "STUDENT";

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  schoolId: string | null;
  mustChangePassword?: boolean;
  roles: RoleName[];
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorBody | string;
}

export interface DashboardStats {
  totalSchools: number;
  activeSchools: number;
  inactiveSchools?: number;
  totalStudents: number;
  totalTeachers: number;
  totalBranches: number;
  totalParents?: number;
  monthlyRevenue?: number;
  overdueInvoices?: number;
  aiRequests?: number;
  aiEstimatedCost?: number;
  notificationsSent?: number;
}

export interface School {
  id: string;
  name: string;
  code: string;
  email: string;
  phone?: string;
  address?: string;
  status: string;
  city?: string;
  country?: string;
  createdAt: string;
  _count?: { branches: number; students: number; teachers?: number; parents?: number };
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  status: string;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  admissionNumber: string;
  status: string;
  branch?: { id: string; name: string };
  grade?: { id: string; name: string };
  section?: { id: string; name: string };
  enrollments?: Enrollment[];
}

export interface Teacher {
  id: string;
  employeeCode: string;
  status: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  branch?: { id: string; name: string };
}

export interface TeacherClassAssignment {
  id?: string;
  sectionId: string;
  subjectId: string;
  academicYearId: string;
  branchId: string;
  role?: "TEACHER" | "ASSISTANT";
  section?: { id: string; name: string; grade?: { id: string; name: string } };
  subject?: { id: string; name: string };
  academicYear?: { id: string; name: string };
  branch?: { id: string; name: string };
}

export interface TeacherClass {
  sectionId: string;
  sectionName: string;
  gradeName: string;
  gradeId?: string;
  subjectId: string;
  subjectName: string;
  academicYearId: string;
  branchId: string;
  role?: "TEACHER" | "ASSISTANT";
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  branchId?: string | null;
}

export interface Grade {
  id: string;
  name: string;
  level: number;
  _count?: { sections: number; enrollments: number };
  sections?: Section[];
}

export interface Section {
  id: string;
  name: string;
  gradeId: string;
  branchId: string;
  capacity?: number | null;
  grade?: Grade;
  branch?: Branch;
  _count?: { enrollments: number; classSubjects?: number };
  classSubjects?: ClassSubject[];
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  gradeId?: string | null;
  grade?: Grade;
}

export interface TeacherUserRef {
  firstName: string;
  lastName: string;
  email?: string;
}

export interface TeacherRef {
  id: string;
  user: TeacherUserRef;
}

export interface ClassSubject {
  id: string;
  sectionId: string;
  subjectId: string;
  teacherId?: string | null;
  assistantTeacherId?: string | null;
  academicYearId: string;
  branchId: string;
  subject?: Subject;
  section?: Section;
  academicYear?: AcademicYear;
  teacher?: TeacherRef | null;
  assistantTeacher?: TeacherRef | null;
}

export interface Enrollment {
  id: string;
  studentId: string;
  academicYearId: string;
  gradeId: string;
  sectionId: string;
  status: string;
  enrollmentDate: string;
  student?: Student;
  grade?: Grade;
  section?: Section;
  academicYear?: AcademicYear;
}

export interface Lesson {
  id: string;
  date: string;
  status: string;
  chapterName?: string;
  topicName?: string;
  teacherNotes?: string;
  aiSummary?: string;
  aiKeyPoints?: string[];
  section?: { id: string; name: string };
  subject?: { id: string; name: string };
  grade?: { id: string; name: string };
}

export interface QuizQuestion {
  id: string;
  questionText: string;
  type: string;
  marks: number;
  options?: string[];
  correctAnswer?: string;
  included: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  status: string;
  dueAt?: string;
  createdAt: string;
  questions?: QuizQuestion[];
  section?: { id: string; name: string };
  subject?: { id: string; name: string };
}

export interface Parent {
  id: string;
  relationship?: string;
  phone?: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    username?: string | null;
    phone?: string;
  };
  students?: Array<{
    relationship?: string;
    student: { id: string; firstName: string; lastName: string; studentCode?: string };
  }>;
}

export interface PricingPlan {
  id: string;
  name: string;
  pricePerStudent: number;
  minimumMonthlyFee: number;
  currency: string;
  active: boolean;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  school?: { id: string; name: string };
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor?: { firstName: string; lastName: string; email: string };
  school?: { name: string };
}

export interface FeeStructure {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  active: boolean;
}

export interface StudentFee {
  id: string;
  periodLabel: string;
  amount: number;
  paidAmount: number;
  balance?: number;
  dueDate: string;
  status: string;
  student?: { id: string; firstName: string; lastName: string; studentCode: string };
  feeStructure?: FeeStructure;
  section?: { id: string; name: string };
}

export interface HomeDiary {
  id: string;
  date: string;
  title: string;
  lessonSummary: string;
  homeworkNotes: string;
  teacherRemarks?: string;
  section?: { id: string; name: string; grade?: { name: string } };
}

export interface ReportCard {
  id: string;
  termLabel: string;
  overallPercentage: number;
  attendanceRate: number;
  remarks?: string;
  generatedAt: string;
  student?: Student;
  grade?: Grade;
  section?: Section;
  academicYear?: AcademicYear;
  lines?: Array<{
    average: number;
    quizzesTaken: number;
    gradeLetter: string;
    subject: { name: string };
  }>;
}

export interface IdCard {
  id: string;
  cardNumber: string;
  holderType: string;
  student?: Student & { enrollments?: Array<{ grade?: Grade; section?: Section }> };
  teacher?: Teacher;
  school?: { name: string; code: string; city?: string };
  branch?: { name: string };
}

export interface SearchResults {
  students: Array<{ id: string; name: string; studentCode: string; className?: string; sectionName?: string }>;
  parents: Array<{ id: string; name: string; email: string; phone?: string; children: string[] }>;
  teachers: Array<{ id: string; name: string; email: string; employeeCode: string }>;
  classes: Array<{ id: string; name: string; sections: Array<{ id: string; name: string }> }>;
}
