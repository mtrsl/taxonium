import { useState, useEffect, Suspense } from "react";
import { Tooltip as ReactTooltip } from "react-tooltip";
import AboutOverlay from "./components/AboutOverlay";
import TaxoniumBit from "./components/TaxoniumBit";
import { CgListTree } from "react-icons/cg";
import { BsInfoSquare } from "react-icons/bs";
import { FaGithub } from "react-icons/fa";
import useQueryAsState from "./hooks/useQueryAsState";
import { useInputHelper } from "./hooks/useInputHelper";
import InputSupplier from "./components/InputSupplier";

export default function App() {
  const [uploadedData, setUploadedData] = useState(null);
  const [query, updateQuery] = useQueryAsState();
  const [title, setTitle] = useState(null);
  const [beingDragged, setBeingDragged] = useState(false);
  const [aboutEnabled, setAboutEnabled] = useState(false);
  const [overlayContent, setOverlayContent] = useState(null);
  const inputHelper = useInputHelper({ setUploadedData });
  const { status } = inputHelper;
  const busy = status.phase === "reading" || status.phase === "processing";
  useEffect(() => { document.title = title || "Taxonium"; }, [title]);
  const returnToFiles = clear => {
    inputHelper.returnToFiles(clear);
    setTitle(null);
    setOverlayContent(null);
    setAboutEnabled(false);
  };
  return <>
    <AboutOverlay enabled={aboutEnabled} setEnabled={setAboutEnabled} overlayContent={overlayContent} />
    <ReactTooltip id="global-tooltip" delayHide={400} className="infoTooltip" />
    <div className="h-screen w-screen flex flex-col overflow-hidden" onDragOver={event => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = uploadedData || busy ? "none" : "copy";
      setBeingDragged(!uploadedData && !busy);
    }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setBeingDragged(false); }} onDrop={event => {
      event.preventDefault(); setBeingDragged(false);
      if (!uploadedData && !busy) inputHelper.addFiles(event.dataTransfer.files);
    }}>
      <header className="from-gray-500 to-gray-600 bg-gradient-to-bl shadow-md flex justify-between items-center px-3 gap-2 flex-shrink-0 h-16 text-white">
        <a href="/" className="flex items-center min-w-0" title={title || "Taxonium"}><CgListTree className="h-6 w-6 mr-2 shrink-0" /><span className="font-bold truncate">{title || "Taxonium"}</span></a>
        <div className="flex items-center gap-3 shrink-0">
          {uploadedData && <button className="text-sm underline" onClick={() => returnToFiles(true)}>Open another dataset</button>}
          <button onClick={() => setAboutEnabled(true)} title="Info" aria-label="Info"><BsInfoSquare className="w-5 h-5" /></button>
          <a href="https://github.com/theosanderson/taxonium" title="Source code" aria-label="Source code"><FaGithub className="w-5 h-5" /></a>
        </div>
      </header>
      {beingDragged && <div role="status" className="bg-sky-200 p-3 text-center">Drop files to add to this dataset</div>}
      {(busy || status.phase === "error") && <div className="p-3 bg-gray-50 border-b" role={status.phase === "error" ? "alert" : "status"} aria-live="polite">
        <p>{status.message}</p>
        {busy && <progress aria-label="Dataset loading progress" max="100" value={status.percentage} className="w-full max-w-md" />}
        <div className="flex gap-4 mt-2">
          {status.phase === "error" && <button className="underline" onClick={inputHelper.finaliseInputs}>Retry</button>}
          <button className="underline" onClick={() => returnToFiles(false)}>Return to files</button>
        </div>
      </div>}
      {uploadedData ? <div className="flex-1 min-h-0"><Suspense fallback={<p className="p-5" role="status">Loading viewer…</p>}>
        <TaxoniumBit sourceData={uploadedData} onImportStatus={inputHelper.onImportStatus} query={query} updateQuery={updateQuery} setOverlayContent={setOverlayContent} onSetTitle={setTitle} overlayContent={overlayContent} setAboutEnabled={setAboutEnabled} />
      </Suspense></div> : <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8"><InputSupplier inputHelper={inputHelper} /></main>}
    </div>
  </>;
}
