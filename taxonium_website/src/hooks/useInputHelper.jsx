import { useState, useRef, useCallback, useEffect } from "react";

export function guessType(file) {
  const extension = file.name.toLowerCase().replace(/\.gz$/, "").split(".").pop();
  if (["nwk", "newick", "contree", "tree", "tre", "nh", "phy", "nw", "treefile", "rooted"].includes(extension)) return "nwk";
  return ({ nexus: "nexus", nex: "nexus", jsonl: "jsonl", dot: "dot", csv: "meta_csv", tsv: "meta_tsv", json: "nextstrain", pb: "unsupported" })[extension] || "unknown";
}

export function validateInputs(inputs) {
  if (!inputs.length) return "Choose a tree or Taxonium JSONL file to begin.";
  if (inputs.some(input => input.filetype === "unsupported")) return "Taxonium V1 protobuf files are not supported. Remove the file and select a supported tree format.";
  if (inputs.some(input => input.filetype === "unknown")) return "Select the type of each unrecognised file.";
  const count = type => inputs.filter(input => type.includes(input.filetype)).length;
  const trees = count(["nwk", "nexus", "nextstrain"]);
  const jsonl = count(["jsonl"]);
  const metadata = count(["meta_csv", "meta_tsv"]);
  if (trees + jsonl > 1) return "Choose only one tree or Taxonium JSONL file.";
  if (metadata > 1) return "Choose only one metadata file.";
  if (count(["dot"]) > 1) return "Choose only one DOT embedding file.";
  if (jsonl && metadata) return "Taxonium JSONL accepts only an optional DOT embedding file.";
  if (!trees && !jsonl) return "Add a tree or Taxonium JSONL file to go with these attachments.";
  return "";
}

export function useInputHelper({ setUploadedData }) {
  const [inputs, setInputs] = useState([]);
  const [status, setStatus] = useState({ phase: "staging" });
  const generation = useRef(0);
  const reader = useRef(null);
  const busy = useRef(false);
  useEffect(() => () => { generation.current++; reader.current?.abort(); }, []);

  const addFiles = files => {
    if (busy.current) return;
    const batch = Array.from(files).map(file => ({ file, name: file.name, size: file.size, filetype: guessType(file), ladderize: true }));
    setInputs(previous => [...previous, ...batch]);
    setStatus({ phase: "staging" });
  };
  const validityMessage = validateInputs(inputs);
  const finaliseInputs = async () => {
    if (validityMessage || busy.current) return;
    busy.current = true;
    const current = ++generation.current;
    setUploadedData(null);
    setStatus({ phase: "reading", message: "Reading selected files" });
    const loaded = [];
    try {
      for (const input of inputs) {
        const data = await new Promise((resolve, reject) => {
          const nextReader = new FileReader();
          reader.current = nextReader;
          nextReader.onprogress = event => {
            if (generation.current === current) setStatus({ phase: "reading", message: `Reading ${input.name}`, percentage: event.lengthComputable ? event.loaded / event.total * 100 : undefined });
          };
          nextReader.onload = () => resolve(nextReader.result);
          nextReader.onerror = () => reject(new Error(`Unable to read ${input.name}: ${nextReader.error?.message || "file access failed"}`));
          nextReader.onabort = () => reject(new Error("File reading cancelled"));
          nextReader.readAsArrayBuffer(input.file);
        });
        if (generation.current !== current) return;
        loaded.push({ filename: input.name, filetype: input.filetype, ladderize: input.ladderize, status: "loaded", data });
      }
      const tree = loaded.find(input => ["nwk", "nexus", "nextstrain", "jsonl"].includes(input.filetype));
      setStatus({ phase: "processing", message: "Preparing dataset" });
      setUploadedData({ ...tree, metadata: loaded.find(input => input.filetype.startsWith("meta_")), embedding: loaded.find(input => input.filetype === "dot"), transferOwnership: true });
    } catch (error) {
      if (generation.current === current) {
        busy.current = false;
        setStatus({ phase: "error", message: error.message });
      }
    } finally { if (generation.current === current) reader.current = null; }
  };
  const onImportStatus = useCallback(next => {
    if (next.phase === "error") { busy.current = false; setUploadedData(null); }
    setStatus(next);
  }, [setUploadedData]);
  const returnToFiles = (clear = false) => {
    generation.current++;
    reader.current?.abort();
    reader.current = null;
    busy.current = false;
    setUploadedData(null);
    if (clear) setInputs([]);
    setStatus({ phase: "staging" });
  };
  return { inputs, setInputs, addFiles, removeInput: index => setInputs(previous => previous.filter((_, i) => i !== index)), validityMessage, finaliseInputs, status, onImportStatus, returnToFiles };
}
