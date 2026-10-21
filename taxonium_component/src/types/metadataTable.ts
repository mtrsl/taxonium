export const METADATA_TABLE_PAGE_SIZE = 2000;
export const METADATA_TABLE_MAX_FIELDS = 32;

export interface MetadataTableRequest {
  selectedNodeId: string | number | null;
  pageIndex: number;
  fields: string[];
  nameField: string;
}
export interface MetadataTableRow {
  nodeId: number;
  name: unknown;
  values: unknown[];
}
export interface MetadataTablePage {
  total: number;
  pageIndex: number;
  fields: string[];
  rows: MetadataTableRow[];
}
export type MetadataTableResponse = MetadataTablePage | { error: string };
