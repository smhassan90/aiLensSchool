export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiErrorBody {
  success?: false;
  message?: string;
  code?: string;
  statusCode?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  email: string;
  username?: string | null;
  firstName: string;
  lastName: string;
  schoolId: string | null;
  mustChangePassword?: boolean;
  roles: string[];
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  tokenType: string;
  expiresIn: string;
}

export interface MeResponse extends AuthUser {
  phone?: string | null;
  school?: { id: string; name: string; code: string; status: string } | null;
  parentProfile?: { id: string } | null;
}

export interface StudentEnrollment {
  id: string;
  status: string;
  grade: { id: string; name: string };
  section: { id: string; name: string };
  academicYear: { id: string; name: string };
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  status: string;
  branch?: { id: string; name: string };
  enrollments?: StudentEnrollment[];
}

export interface ChildLink {
  relationship: string;
  isPrimary: boolean;
  student: Student;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
}

export interface Section {
  id: string;
  name: string;
}

export interface Homework {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  publishedAt?: string | null;
  lessonId?: string | null;
  subject?: Subject;
  section?: Section;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  totalMarks?: number;
  publishedAt?: string | null;
  dueAt?: string | null;
  subject?: Subject;
  section?: Section;
  questions?: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  questionText: string;
  type: string;
  marks: number;
  included: boolean;
  correctAnswer?: string | null;
  options?: { id: string; optionText: string; isCorrect: boolean }[];
}

export interface QuizAnswer {
  id: string;
  questionId: string;
  answerText?: string | null;
  optionId?: string | null;
  isCorrect?: boolean | null;
  marksAwarded?: number | null;
  question?: {
    id: string;
    questionText: string;
    type: string;
    marks: number;
    correctAnswer?: string | null;
  };
}

export interface QuizResult {
  id: string;
  quizId: string;
  studentId: string;
  score: number;
  totalMarks: number;
  percentage: number;
  submittedAt: string;
  summary?: string | null;
  quiz?: { id: string; title: string; subjectId?: string; totalMarks?: number };
  attempt?: { id: string; submittedAt?: string | null; answers?: QuizAnswer[] };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink?: string | null;
  readAt?: string | null;
  createdAt: string;
  data?: Record<string, unknown> | null;
}

export interface EventItem {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  startDate: string;
  endDate: string;
  location?: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  publishAt?: string | null;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  studentId: string;
  sectionId: string;
  notes?: string | null;
  remarks?: string | null;
}

export interface HomeDiary {
  id: string;
  date: string;
  title: string;
  lessonSummary?: string | null;
  homeworkNotes?: string | null;
  teacherRemarks?: string | null;
  section?: { id: string; name: string; grade?: { id: string; name: string } };
}

export interface StudentFee {
  id: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  status: string;
  periodLabel?: string | null;
  feeStructure?: { id: string; name: string };
  section?: { id: string; name: string };
}

export interface ReportCard {
  id: string;
  termLabel: string;
  overallPercentage?: number | null;
  attendanceRate?: number | null;
  remarks?: string | null;
  generatedAt: string;
  grade?: { id: string; name: string };
  section?: { id: string; name: string };
  academicYear?: { id: string; name: string };
  lines?: { average?: number | null; gradeLetter?: string | null; subject?: { name: string } }[];
}

export interface LessonSummary {
  id: string;
  date: string;
  topicName?: string | null;
  chapterName?: string | null;
  aiSummary?: string | null;
  subject?: Subject;
  status?: string;
}
