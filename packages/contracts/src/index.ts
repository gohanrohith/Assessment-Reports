export const roles = [
  'PLATFORM_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'CLASS_TEACHER',
  'SUBJECT_TEACHER',
  'STUDENT',
  'GUARDIAN',
  'REVIEWER',
] as const;
export type Role = (typeof roles)[number];
export interface SchoolContext {
  id: string;
  displayName: string;
  role: Role;
}
export interface SessionResponse {
  accessToken: string;
  expiresIn: 900;
  active_school_id: string | null;
}
