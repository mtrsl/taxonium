import { useRef } from "react";
import { Button, Select } from "./Basic";

const prettyTypes = { jsonl: "Taxonium JSONL", nwk: "Newick tree", nexus: "Nexus tree", nextstrain: "Nextstrain JSON", meta_csv: "Metadata CSV", meta_tsv: "Metadata TSV", dot: "DOT embedding", unknown: "Choose file type", unsupported: "Unsupported protobuf" };

export default function InputSupplier({ inputHelper }) {
  const picker = useRef(null);
  const { inputs, setInputs, status } = inputHelper;
  const reading = status.phase === "reading";
  const change = (index, values) => setInputs(previous => previous.map((input, i) => i === index ? { ...input, ...values } : input));
  return <section aria-label="Local dataset files" className="max-w-3xl mx-auto w-full space-y-4">
    <div className="border-2 border-dashed border-sky-500 rounded-lg bg-sky-50 p-6 sm:p-10 text-center">
      <h1 className="font-bold text-xl mb-3">Open a local dataset</h1>
      <p className="mb-4">Drop your tree and optional metadata and DOT embedding files here.</p>
      <button type="button" disabled={reading} className="tx-button border rounded px-4 py-2 bg-white disabled:opacity-50" onClick={() => picker.current.click()}>Choose files</button>
      <input ref={picker} aria-label="Choose local files" type="file" multiple className="hidden" onChange={event => { inputHelper.addFiles(event.target.files); event.target.value = ""; }} />
      <p className="text-sm text-gray-600 mt-4">Newick, Nexus, Nextstrain JSON or Taxonium JSONL, with optional CSV/TSV metadata and DOT coordinates. Gzip files are supported.</p>
    </div>
    <fieldset disabled={reading} className="space-y-3 min-w-0">
      {inputs.length > 0 && <legend className="font-semibold mb-2">Selected files</legend>}
      {inputs.map((input, index) => <div key={index} className="border rounded p-3 text-sm space-y-2">
        <p className="break-all font-medium">{input.name} <span className="text-gray-500 font-normal">({new Intl.NumberFormat().format(input.size)} bytes)</span></p>
        <div className="flex flex-wrap gap-2 items-center">
          <Select aria-label={`File type for ${input.name}`} value={input.filetype} disabled={input.filetype === "unsupported"} onChange={event => change(index, { filetype: event.target.value })}>
            {Object.entries(prettyTypes).filter(([type]) => type !== "unsupported" || input.filetype === "unsupported").map(([type, name]) => <option key={type} value={type}>{name}</option>)}
          </Select>
          <Button aria-label={`Remove ${input.name}`} onClick={() => inputHelper.removeInput(index)}>Remove</Button>
        </div>
        {input.filetype === "nwk" && <label className="block"><input type="checkbox" checked={input.ladderize} onChange={event => change(index, { ladderize: event.target.checked })} className="mr-2" />Ladderize tree</label>}
        {input.filetype.startsWith("meta_") && <p>The first metadata column must contain the sample names used in the tree.</p>}
      </div>)}
      {inputs.length > 0 && inputHelper.validityMessage && <p role="alert" className="text-red-700">{inputHelper.validityMessage}</p>}
      <button type="button" disabled={!!inputHelper.validityMessage} onClick={inputHelper.finaliseInputs} className="tx-button border rounded px-4 py-2 bg-sky-100 disabled:opacity-50">Open dataset</button>
    </fieldset>
  </section>;
}
