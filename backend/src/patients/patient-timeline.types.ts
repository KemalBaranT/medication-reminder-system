/**
 * Bir hastanin klinik seyrindeki tek bir olay. Sekil, onceden bicimlendirilmis
 * bir cumle yerine kasitli olarak genel tutulmustur (`type` + opsiyonel
 * yapilandirilmis alanlar); boylece web paneli backend'in sunum veya dil
 * ayarindan haberdar olmasina gerek kalmadan her kaydi (TR/EN) render edip
 * cevirebilir.
 */
export type TimelineEntryType =
  | 'admission'
  | 'discharge'
  | 'readmission'
  | 'prescription_created'
  | 'prescription_cancelled'
  | 'dose_administered'
  | 'dose_withheld';

export interface TimelineActor {
  fullName: string;
  title: string | null;
}

export interface TimelineEntry {
  type: TimelineEntryType;
  timestamp: Date;
  actor: TimelineActor | null;
  medicationName?: string;
  dosage?: string;
  reason?: string | null;
}
