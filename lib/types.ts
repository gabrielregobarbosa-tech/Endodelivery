export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Profile {
  user_id: string;
  name: string;
  specialty: string;
  cro: string;
  phone: string;
  email: string;
  address: string;
  logo_data_url: string;
}

export interface Patient {
  id: string;
  user_id: string;
  name: string;
  referring_professional: string;
  birth_date: string;
  phone: string;
  notes: string;
  created_at: string;
}

export interface Canal {
  name: string;
  odontometry: string;
  laf: string;
  notes?: string;
}

export interface Visit {
  id: string;
  user_id: string;
  patient_id: string;
  attended_at: string;
  tooth: string;
  treatment: string;
  cement: string;
  irrigant: string;
  notes: string;
  canals: Canal[];
  created_at: string;
}

export type AppointmentStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface Appointment {
  id: string;
  user_id: string;
  patient_id: string | null;
  date: string;
  time: string;
  clinic: string;
  procedure: string;
  status: AppointmentStatus;
  created_at: string;
}

export interface Radiograph {
  id: string;
  user_id: string;
  patient_id: string;
  visit_id: string | null;
  filename: string;
  caption: string;
  created_at: string;
}

export type DocumentKind = "prescription" | "post_op";

export interface DocumentTemplate {
  id: string;
  user_id: string;
  title: string;
  kind: DocumentKind;
  content: string;
  created_at: string;
}

export interface ClinicalDocument {
  id: string;
  user_id: string;
  patient_id: string | null;
  template_id: string | null;
  title: string;
  content: string;
  kind: DocumentKind;
  created_at: string;
}
