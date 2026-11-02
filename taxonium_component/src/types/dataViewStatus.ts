export interface DataViewStatus {
  total?: number;
  valid?: number;
  ignored?: number;
  busy: boolean;
  fit?: () => void;
}
export type ReportViewStatus = (status: DataViewStatus) => void;
