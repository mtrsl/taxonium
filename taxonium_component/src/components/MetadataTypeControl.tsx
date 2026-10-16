import type { MetadataController } from "../hooks/useMetadata";
import type { MetadataTypeChoice } from "../utils/metadata";

export default function MetadataTypeControl({ field, metadata }: {
  field: string; metadata?: MetadataController;
}) {
  if (!metadata?.specs[field]) return null;
  const spec = metadata.specs[field];
  return <span className="flex flex-wrap items-center gap-1 text-xs">
    <select aria-label={`Type for ${field}`} value={metadata.overrides[field]?.type ?? "auto"}
      onChange={event => metadata.setType(field, event.target.value as MetadataTypeChoice)}>
      <option value="auto">Auto{metadata.overrides[field]?.type ? "" : ` (${spec.kind})`}</option>
      <option value="numeric">Numeric</option>
      <option value="categorical">Categorical</option>
    </select>
    {spec.kind === "categorical" && <button type="button" className="border rounded px-1"
      aria-label={`Reshuffle colours for ${field}`} onClick={() => metadata.reshuffle(field)}
      title="Replace all colours for this column, including custom colours">Reshuffle colours</button>}
    {spec.kind === "categorical" && <span className="text-gray-500">Replaces custom colours</span>}
  </span>;
}
