import type { DataViewOptions } from "../hooks/useDataViewOptions";
import { coordinateFields } from "../utils/geography";
import { FaChartBar, FaTable, FaGlobe } from "react-icons/fa";
import type { TimelineSettings } from "../hooks/useTimeline";
import MetadataTypeControl from "./MetadataTypeControl";
import SearchTopLayerItem from "./SearchTopLayerItem";
import { RiAddCircleLine, RiArrowLeftUpLine } from "react-icons/ri";
import { BiPalette } from "react-icons/bi";
import { Button } from "../components/Basic";
import { BsBoxArrowInUpRight, BsQuestionCircle } from "react-icons/bs";
import { MdArrowForward, MdArrowDownward, MdAddCircleOutline } from "react-icons/md";
import { Tooltip as ReactTooltip } from "react-tooltip";
const ReactTooltipAny: any = ReactTooltip;
import prettifyName from "../utils/prettifyName";
import { SearchState } from "../types/search";
import type { Config, Backend } from "../types/backend";
import type { ColorHook, ColorBy } from "../types/color";
import type { MetadataMatrix } from "../types/metadataMatrix";
import type { Settings } from "../types/settings";
import type { SelectedDetails, OverlayContent } from "../types/ui";
import type { TreenomeState } from "../types/treenome";
import type { View } from "../hooks/useView";

import { FaSearch, FaShare } from "react-icons/fa";

import { Select } from "./Basic";
import ColorSwatchPicker from "./ColorSwatchPicker";
import ListOutputModal from "./ListOutputModal";

import { useState, useMemo, useEffect, ChangeEvent } from "react";

import classNames from "classnames";

import SearchDisplayToggle from "./SearchDisplayToggle";
import {
  MAX_METADATA_MATRIX_COLUMN_WIDTH,
  MIN_METADATA_MATRIX_COLUMN_WIDTH,
} from "../utils/metadataMatrix";

const prettify_x_types = { x_dist: "Distance", x_time: "Time" };

const formatNumber = (num: number | null) => {
  return num !== null && typeof num === "number" ? num.toLocaleString() : "";
};

const formatNumberIfNumber = (possNum: number | string) => {
  return typeof possNum === "number" ? possNum.toLocaleString() : possNum;
};
const fixName = (name: string) => {
  return name;
  //return typeof name == "string"
  //  ? name.replace("hCoV-19/", "hCoV-19/\n")
  //  : name;
};

const fixAuthors = (authors: string) => {
  // make sure comma is always followed by space
  return authors.replace(/,([^\s])/g, ", $1");
};

interface SearchPanelProps {
  search: SearchState;
  colorBy: ColorBy;
  metadataMatrix: MetadataMatrix;
  timeline?: TimelineSettings;
  dataViewOptions?: DataViewOptions;
  config: Config;
  selectedDetails: SelectedDetails;
  overlayContent: OverlayContent["content"];
  setAboutEnabled: (enabled: boolean) => void;
  colorHook: ColorHook;
  xType: string;
  setxType: (val: string) => void;
  settings: Settings;
  backend: Backend;
  className?: string;
  treenomeState: TreenomeState;
  view: View;
  perNodeFunctions: any;
  toggleSidebar: () => void;
  placeSequencesUrl?: string;
  onOpenAnotherDataset?: () => void;
}

function SearchPanel({
  search,
  colorBy,
  metadataMatrix,
  timeline,
  dataViewOptions,
  config,
  selectedDetails,
  overlayContent,
  setAboutEnabled,
  colorHook,
  xType,
  setxType,
  settings,
  backend,
  className,
  treenomeState,
  view,
  perNodeFunctions,
  toggleSidebar,
  placeSequencesUrl,
  onOpenAnotherDataset,
}: SearchPanelProps) {
  const cfg = config as Record<string, any>;
  const selectedNodeDetails =
    selectedDetails.nodeDetails as Record<string, any> | null;
  const covSpectrumQuery = useMemo(() => {
    if (selectedNodeDetails && selectedNodeDetails.node_id) {
      return perNodeFunctions.getCovSpectrumQuery(
        selectedNodeDetails.node_id
      );
    } else {
      return null;
    }
  }, [selectedNodeDetails]);

  const [listOutputModalOpen, setListOutputModalOpen] = useState(false);

  const handleDownloadJson = () => {
    if (selectedNodeDetails) {
      const node_id = selectedNodeDetails.node_id as string | number;
      backend.getNextstrainJson(node_id, config);
    }
  };

  const formatMetadataItem = (key: string) => {
    // if matches a markdown link "[abc](https://abc.com)" then..
    if (key === "num_tips" && selectedNodeDetails && selectedNodeDetails[key] === 1)
      return;

    if (
      selectedNodeDetails &&
      selectedNodeDetails[key] &&
      (selectedNodeDetails[key] as any).match &&
      (selectedNodeDetails[key] as any).match(/\[.*\]\(.*\)/)
    ) {
      const [, text, url] = (selectedNodeDetails[key] as string).match(
        /\[(.*)\]\((.*)\)/
      )!;
      return (
        <div className="text-sm mt-1" key={key}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-800 underline"
          >
            {text} <BsBoxArrowInUpRight className="inline-block ml-1" />
          </a>
        </div>
      );
    }

    if (cfg.metadataTypes && cfg.metadataTypes[key] === "sequence") {
      return (
        <div className="text-sm mt-1" key={key}>
          <span className="font-semibold">{prettifyName(key, config)}:</span>{" "}
          <div className="text-xs font-mono break-all">
            {selectedNodeDetails ? selectedNodeDetails[key] : ""}
          </div>
        </div>
      );
    }

    return (
      <div className="text-sm mt-1" key={key}>
        <span className="font-semibold">{prettifyName(key, config)}:</span>{" "}
        {colorBy.colorByField === key ? (
          <span
            style={{
              color: colorHook.toRGBCSS(selectedNodeDetails ? selectedNodeDetails[key] : ""),
            }}
          >
            {selectedNodeDetails ? selectedNodeDetails[key] : ""}
          </span>
        ) : (
          formatNumberIfNumber(selectedNodeDetails ? selectedNodeDetails[key] : "")
        )}
        {key === "num_tips" && (
          <span className="ml-1">
            <a
              data-tooltip-id="menu_descendants"
              className="cursor-pointer"
            >
              {" "}
              <FaShare className="inline-block" />
            </a>
              <ReactTooltipAny
                id="menu_descendants"
                clickable={true}
                style={{
                  backgroundColor: "white",
                  color: "black",
                  border: "1px solid #ccc",
                  maxWidth: "300px",
                  zIndex: 9999
                }}
              >
                <div>
                  <h2 className="font-bold mb-2">For this clade:</h2>
                  <div className="mb-3">
                    <Button
                      className=""
                      onClick={() => {
                        if (
                    selectedNodeDetails && selectedNodeDetails.num_tips > 100000 &&
                          !(window as any).warning_shown
                        ) {
                          // pop up a warning and ask if we want to continue
                          alert(
                            "WARNING: This node has a large number of descendants. Displaying them all may take a while or crash this browser window. Are you sure you want to continue? If so press the button again."
                          );
                          (window as any).warning_shown = true;
                          return;
                        }
                        setListOutputModalOpen(true);
                      }}
                    >
                      List all tips
                    </Button>
                  </div>

                  {cfg.enable_ns_download &&
                    selectedNodeDetails && selectedNodeDetails[key] < 1000000 &&
                    !cfg.from_newick && (
                      <>
                        <div className="mb-3">
                          <Button className="" onClick={handleDownloadJson}>
                            Download Nextstrain JSON
                          </Button>
                        </div>

                        {backend.type === "server" &&
                          backend.backend_url &&
                          !backend.backend_url.includes("localhost") &&
                          selectedNodeDetails && selectedNodeDetails[key] < 20000 && (
                            <>
                              <div className="mb-3">
                                <Button
                                  className=""
                                  href={
                                    "https://nextstrain.org/fetch/" +
                                    backend
                                      .getNextstrainJsonUrl(
                                        selectedNodeDetails!.node_id,
                                        config
                                      )
                                      .replace("https://", "")
                                      .replace("http://", "")
                                  }
                                  target="_blank"
                                >
                                  View clade in Nextstrain
                                </Button>
                              </div>
                            </>
                          )}
                      </>
                    )}

                  {cfg.covspectrum_links && (
                    <div className="mb-3">
                      <Button
                        href={covSpectrumQuery}
                        className=""
                        target="_blank"
                      >
                        Find in CovSpectrum
                      </Button>
                    </div>
                  )}
                </div>
              </ReactTooltipAny>
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className={classNames(
        "tx-sidebar flex flex-col px-3 divide-y text-sm border-gray-200",
        className
      )}
    >
      <div className="flex items-center justify-between border-gray-200">
        <button onClick={toggleSidebar} className="border-gray-200">
          {window.innerWidth > 768 ? (
            <MdArrowForward className="mx-auto w-5 h-5 sidebar-toggle border-gray-200" />
          ) : (
            <MdArrowDownward className="mx-auto w-5 h-5 sidebar-toggle border-gray-200" />
          )}
        </button>
        {placeSequencesUrl && (
          <a
            href={placeSequencesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition flex items-center gap-1.5 no-underline my-2"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Place your own sequences on this tree using viral_usher"
          >
            <MdAddCircleOutline className="w-4 h-4" />
            <span>Place sequences</span>
          </a>
        )}
      </div>
      <div className="space-y-2 py-3 border-gray-200">
        {cfg.num_tips && (
          <>
            <p className="text-gray-500 text-sm">
              {overlayContent ? (
                <>
                  <span title={cfg.date_created ? cfg.date_created : ""}>
                    Displaying
                  </span>{" "}
                  <button
                    className="underline"
                    onClick={() => {
                      setAboutEnabled(true);
                    }}
                  >
                    {formatNumber(cfg.num_tips)}{" "}
                    {cfg.tipPluralNoun ? cfg.tipPluralNoun : "sequences"}
                  </button>{" "}
                  {cfg.source && ` from ${cfg.source}`}
                </>
              ) : (
                <>
                  Displaying {formatNumber(cfg.num_tips)}{" "}
                  {cfg.tipPluralNoun ? cfg.tipPluralNoun : "sequences"}
                  {cfg.source && ` from ${cfg.source}`}
                </>
              )}
            </p>
            {onOpenAnotherDataset && (
              <button
                type="button"
                className="text-blue-700 text-sm underline mt-1"
                onClick={onOpenAnotherDataset}
              >
                Open another dataset
              </button>
            )}
            {cfg.enabled_by_gisaid && (
              <span className="text-gray-500 mt-1">
                Enabled by data from{" "}
                <a
                  rel="noopener noreferrer"
                  href="https://www.gisaid.org"
                  target="_blank"
                >
                  <img
                    src="https://www.gisaid.org/fileadmin/gisaid/img/schild.png"
                    alt="gisaid-logo"
                    width="65"
                    className="inline-block"
                  />
                </a>
                .
              </span>
            )}
          </>
        )}
        {cfg.x_accessors && cfg.x_accessors.length > 1 && (
          <label className="space-x-2 text-sm block">
            <span className="text-gray-500 text-sm">Tree type:</span>
            <Select
              value={xType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setxType(e.target.value)
              }
              className="text-gray-500 text-xs py-0.5"
            >
              {cfg.x_accessors.map((x: keyof typeof prettify_x_types) => (
                <option key={x} value={x}>
                  {prettify_x_types[x]}
                </option>
              ))}
            </Select>
          </label>
        )}
        {(treenomeState as any).genome &&
          (treenomeState as any).genome.length > 0 &&
          window.location &&
          !window.location.href.includes("disabletreenome") && (
            <span>
              <span className="text-gray-500 text-sm">Treenome Browser:</span>
              <input
                name="treenomeEnabled"
                style={{ verticalAlign: "middle" }}
                type="checkbox"
                className="m-3 inline-block"
                checked={settings.treenomeEnabled}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  settings.setTreenomeEnabled(!settings.treenomeEnabled);
                }}
              />
              <button
                style={{ cursor: "default" }}
                data-tooltip-id="global-tooltip"
                data-tooltip-html="Display a browser with each genome's mutations alongside the tree.&nbsp;<a href='https://docs.taxonium.org/en/latest/treenome.html' class='tooltipLink' target='_blank'>Learn more</a>"
              >
                <span
                  style={{ display: "inline-block", verticalAlign: "middle" }}
                >
                  <BsQuestionCircle />
                </span>
              </button>
            </span>
          )}
      </div>
      <div className="py-1 border-gray-200">
        <details className="tx-disclosure">
          <summary><BiPalette />Colour by<span className="tx-summary">{prettifyName(colorBy.colorByField, config)}</span></summary>
          <div className="space-y-2">
        <div className="flex space-x-2">
            <Select
              aria-label="Colour by" value={colorBy.colorByField}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                colorBy.setColorByField?.(e.target.value)
              }
          >
              {colorBy.colorByOptions.map((item: string) => (
                <option key={item} value={item}>
                  {prettifyName(item, config)}
                </option>
              ))}
          </Select>
        </div>
        <MetadataTypeControl field={colorBy.colorByField} metadata={metadataMatrix.metadata} />
        {colorBy.colorByField === "genotype" && (
          <div className="space-x-2">
            <label className="space-x-2">
              <span>Gene</span>
              <Select
                value={colorBy.colorByGene}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  colorBy.setColorByGene?.(e.target.value)
                }
                className="w-20"
              >
                {config.genes &&
                    config.genes.map((item: string) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
              </Select>
            </label>
            <label className="space-x-2">
              <span>Residue</span>
              <input
                value={colorBy.colorByPosition}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  colorBy.setColorByPosition?.(
                    e.target.value !== "" ? parseInt(e.target.value) : 0
                  )
                }
                type="number"
                min="0"
                className="inline-block w-16 border py-1 px-1 text-grey-darkest text-sm"
              />
            </label>
          </div>
        )}
          </div>
        </details>
        {backend.type === "local" && <details className="tx-disclosure">
          <summary><FaGlobe />Map options</summary>
          <button type="button" className="tx-control" onClick={() => dataViewOptions?.map?.fit?.()} disabled={!dataViewOptions?.map?.fit}>Fit selection</button>
          <div className="text-xs text-gray-600">{(() => {
            const fields = coordinateFields(Object.keys(config.metadataSummaries ?? {}));
            return fields ? <>Latitude: {prettifyName(fields[0], config)}<br />Longitude: {prettifyName(fields[1], config)}</> : "No latitude/longitude columns available.";
          })()}</div>
          {dataViewOptions?.map && <ViewCounts status={dataViewOptions.map} mapped />}
          {colorBy.colorByField === "genotype" && <p className="text-xs">Neutral points: genotype colouring is not supported on the map.</p>}
        </details>}
        {backend.type === "local" && timeline && <details className="tx-disclosure">
          <summary><FaChartBar />Timeline display</summary>
          <label className="flex flex-col gap-1 text-xs text-gray-700">Date source
            <select className="rounded-sm border p-1" aria-label="Timeline date source" value={timeline.source} disabled={!timeline.sources.length}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => timeline.setSource(event.target.value)}>
              {!timeline.sources.length && <option value="">No usable dates</option>}
              {timeline.sources.map(source => <option key={source.id} value={source.id}>{source.label} ({source.precision})</option>)}
            </select>
          </label>
          {dataViewOptions?.timeline && <ViewCounts status={dataViewOptions.timeline} />}
          {colorBy.colorByField === "genotype" && <p className="text-xs">Neutral bars: genotype colouring is not supported.</p>}
          {timeline.error && <p role="alert">{timeline.error} <button type="button" onClick={timeline.retry}>Retry timeline</button></p>}
        </details>}
        <details className="tx-disclosure">
          <summary className="cursor-pointer font-bold text-gray-700">
            <FaTable />Metadata matrix
            {metadataMatrix.selectedFields.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                {metadataMatrix.selectedFields.length} columns
              </span>
            )}
          </summary>
          {metadataMatrix.availableFields.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <span>{settings.treeLayout === "rotated" && !settings.treenomeEnabled ? "Row thickness" : "Lane width"}</span>
              <input
                type="range"
                min={MIN_METADATA_MATRIX_COLUMN_WIDTH}
                max={MAX_METADATA_MATRIX_COLUMN_WIDTH}
                step="1"
                value={metadataMatrix.columnWidth}
                onChange={(event) =>
                  metadataMatrix.setColumnWidth(Number(event.target.value))
                }
                aria-label={settings.treeLayout === "rotated" && !settings.treenomeEnabled ? "Metadata matrix row thickness" : "Metadata matrix lane width"}
                className="flex-1"
              />
              <span className="w-12 text-right text-gray-500">
                {metadataMatrix.columnWidth}px
              </span>
            </label>
          )}
          {metadataMatrix.availableFields.length === 0 ? (
            <p className="text-xs text-gray-500">
              No metadata columns detected.
            </p>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 rounded-sm p-2">
                {metadataMatrix.availableFields.map((field) => {
                  const label = prettifyName(field, config);
                  return (
                    <div
                      key={field}
                      className="flex flex-col items-start gap-1 text-xs text-gray-700 border-b border-gray-100 pb-2"
                    >
                      <label className="flex items-center gap-2 min-w-0 w-full">
                        <input
                          type="checkbox"
                          aria-label={`Show ${label} in metadata matrix`}
                          checked={metadataMatrix.selectedFields.includes(field)}
                          onChange={() => metadataMatrix.toggleField(field)}
                        />
                        <span className="truncate">{label}</span>
                        {metadataMatrix.fieldInfo[field]?.kind === "numeric" && (
                          <span className="text-[10px] text-gray-400 shrink-0">
                            numeric
                          </span>
                        )}
                      </label>
                      <MetadataTypeControl field={field} metadata={metadataMatrix.metadata} />
                      {(metadataMatrix.fieldInfo[field]?.kind === "boolean" || !metadataMatrix.metadata?.specs[field]) && <ColorSwatchPicker
                        color={metadataMatrix.getFieldColor(field)}
                        setColor={(color) => metadataMatrix.setFieldColor(field, color)}
                        title={`Edit colour for ${label}`}
                      />}

                    </div>
                  );
                })}
              </div>
              {metadataMatrix.selectedFields.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500">
                    Display order
                  </div>
                  {metadataMatrix.selectedFields.map((field, index) => (
                    <div
                      key={field}
                      className="flex items-center justify-between gap-2 text-xs text-gray-700 border border-gray-200 rounded-sm px-2 py-1"
                    >
                      <span className="truncate">{prettifyName(field, config)}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <button
                          className="border rounded px-1 disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() => metadataMatrix.moveField(field, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="border rounded px-1 disabled:opacity-40"
                          disabled={index === metadataMatrix.selectedFields.length - 1}
                          onClick={() => metadataMatrix.moveField(field, 1)}
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </details>
      </div>
      <details className="tx-disclosure min-h-0">
        <summary><FaSearch />Search<span className="tx-summary">{search.searchSpec.length} {search.searchSpec.length === 1 ? "search" : "searches"}</span></summary>
        <div className="flex justify-end"><SearchDisplayToggle settings={settings} /></div>
        <div className="space-y-2 md:overflow-y-auto -mr-4 pr-4">
          {search.searchSpec.map((item) => (
            <SearchTopLayerItem
              key={item.key}
              singleSearchSpec={item}
              myKey={item.key}
              search={search}
              config={config}
            />
          ))}
          <Button
            className="mx-auto flex items-center font-medium leading-6 mt-2"
            onClick={search.addNewTopLevelSearch}
          >
            <RiAddCircleLine className="mr-1 h-4 w-4 text-gray-500" />
            <span>Add a new search</span>
          </Button>
        </div>
      </details>
      {selectedNodeDetails && (
        <div className="py-2 bg-white border-gray-200">
          <ListOutputModal
            nodeId={selectedNodeDetails.node_id}
            backend={backend}
            possibleKeys={["name", ...(cfg.keys_to_display as string[])]}
            listOutputModalOpen={listOutputModalOpen}
            setListOutputModalOpen={setListOutputModalOpen}
          />
          <header className="flex items-start justify-between">
            <h2 className="font-bold whitespace-pre-wrap text-sm">
              {selectedNodeDetails[cfg.name_accessor as string] !== "" ? (
                fixName(selectedNodeDetails[cfg.name_accessor as string])
              ) : (
                <i>
                  Internal node{" "}
                  <small>{selectedNodeDetails.node_id}</small>
                </i>
              )}
              {selectedNodeDetails.parent_id !== selectedNodeDetails.node_id && (
                <button
                  className="inline-block text-sm text-gray-700 hover:text-black ml-2"
                  title="Select parent"
                  onClick={() => {
                    selectedDetails.getNodeDetails(selectedNodeDetails.parent_id);
                  }}
                >
                  <RiArrowLeftUpLine className="inline-block mr-2" />
                </button>
              )}
            </h2>

            <button
              onClick={() => selectedDetails.clearNodeDetails()}
              className="text-gray-500"
            >
              close
            </button>
          </header>
          {selectedNodeDetails["meta_ThumbnailURL"] && (
            <img
              src={selectedNodeDetails["meta_ThumbnailURL"] as string}
              alt="thumbnail"
            />
          )}

          {colorBy.colorByField === "genotype" && (
            <span
              style={{
                color: colorHook.toRGBCSS(
                  colorBy.getNodeColorField(selectedNodeDetails as any)
                ),
              }}
            >
              {colorBy.colorByGene}:{colorBy.colorByPosition}
              {colorBy.getNodeColorField(selectedNodeDetails as any)}
            </span>
          )}
          {[...(cfg.keys_to_display as string[]), "num_tips"].map(
            (key) => selectedNodeDetails && selectedNodeDetails[key] && formatMetadataItem(key)
          )}
          {((config.mutations && config.mutations.length) || cfg.useHydratedMutations) &&
            selectedNodeDetails &&
            selectedNodeDetails.node_id !== selectedNodeDetails.parent_id && (
              <>
                <div className="text-xs font-bold mt-2 mb-0 text-gray-700 justify-between flex">
                  <div className="pt-1">Mutations at this node:</div>{" "}
                  {settings.miniMutationsMenu()}
                </div>
                <div className="text-xs leading-5 mt-1 text-gray-700">
                    {settings
                      .filterMutations(selectedNodeDetails.mutations)
                      .sort((a: any, b: any) => {
                        if (a.gene !== b.gene) {
                          return a.gene > b.gene ? 1 : -1;
                        }
                        return (a.residue_pos ?? 0) > (b.residue_pos ?? 0)
                          ? 1
                          : -1;
                      })
                      .map((mutation: any, i: number) => (
                      <span key={mutation.mutation_id}>
                        {i > 0 && <>, </>}
                        <div className="inline-block">
                          {mutation.gene}:{mutation.previous_residue}
                          {mutation.residue_pos}
                          {mutation.new_residue}
                        </div>
                      </span>
                    ))}
                  {selectedNodeDetails.mutations.length === 0 && (
                    <div className=" italic">
                      No{" "}
                      {settings.filterMutations([{ type: "nt" }]).length ===
                      0 ? (
                        <>coding</>
                      ) : (
                        <></>
                      )}{" "}
                      mutations
                    </div>
                  )}
                </div>
              </>
            )}

          <div>
            {selectedNodeDetails.acknowledgements && (
              <div className="text-xs mt-3  text-gray-700 mr-3">
                <div className="mt-1 justify">
                  <b className="font-semibold">Authors:</b>{" "}
                  {selectedNodeDetails.acknowledgements.authors}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchPanel;

function ViewCounts({ status, mapped = false }: { status: import("../types/dataViewStatus").DataViewStatus; mapped?: boolean }) {
  if (!status.busy && status.total === undefined) return null;
  return <p role="status" className="text-xs text-gray-600">{status.busy ? "Updating…" : status.total === undefined ? "" :
    <>{status.valid?.toLocaleString()} of {status.total.toLocaleString()} selected samples {mapped ? "mapped" : "dated"}
      <br />{status.ignored?.toLocaleString()} missing or invalid {mapped ? "coordinates" : "dates"} ignored</>}</p>;
}
