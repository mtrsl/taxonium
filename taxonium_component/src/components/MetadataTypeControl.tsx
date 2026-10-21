import { Select } from "./Basic";
import type { MetadataController } from "../hooks/useMetadata";
import type { MetadataTypeChoice } from "../utils/metadata";

export default function MetadataTypeControl({ field, metadata }: {
  field: string; metadata?: MetadataController;
}) {
  if (!metadata?.specs[field]) return null;
  const spec = metadata.specs[field];
  return <span className="flex flex-wrap items-center gap-1 text-xs">
    <Select aria-label={`Type for ${field}`} value={metadata.overrides[field]?.type ?? "auto"}
      onChange={event => metadata.setType(field, event.target.value as MetadataTypeChoice)}>
      <option value="auto">Auto{metadata.overrides[field]?.type ? "" : ` (${spec.kind})`}</option>
      <option value="numeric">Numeric</option>
      <option value="categorical">Categorical</option>
    </Select>
    {spec.kind === "categorical" && <button type="button" className="border rounded px-1"
      aria-label={`Reshuffle colours for ${field}`} onClick={() => metadata.reshuffle(field)}
      title="Generate a new palette for this column">Reshuffle colours</button>}
  </span>;
}
