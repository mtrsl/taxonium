import { MISSING_COLOR } from "../utils/metadata";
import prettifyName from "../utils/prettifyName";
import { useEffect, useMemo, useRef, useState } from "react";
import LegendDialog, { LegendEntry, legendEntryKey } from "./LegendDialog";
import type { Backend } from "../types/backend";
import classNames from "classnames";
import type { ColorRamp, ColorRamps } from "../types/common";

export interface KeyItem {
  value: string;
  missing?: boolean;
  count: number;
  color: [number, number, number];
}

interface KeyProps {
  keyStuff: KeyItem[];
  colorByField: string;
  colorByGene?: string;
  colorByPosition?: number | string;
  config: Record<string, unknown>;
  setCurrentColorSettingKey: (key: string) => void;
  setColorSettingOpen: (open: boolean) => void;
  hoveredKey: string | null;
  setHoveredKey: (key: string | null) => void;
  colorRamps?: ColorRamps;
  numericEmpty?: boolean;
  datasetIdentity?: Backend["getConfig"];
}

const ColorRamp = ({ ramp }: { ramp: ColorRamp }) => {
  const scale = ramp.scale;

  // Extract values and colors from the scale
  const values = scale.map(([value, color]) => value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Build the gradient string
  const colorStops = scale
    .map(([value, color]) => {
      const position = max === min ? 50 : ((value - min) / (max - min)) * 100;
      return `${color} ${position}%`;
    })
    .join(", ");

  const height = 100;

  const gradientStyle = {
    background: max === min ? scale[0][1] : `linear-gradient(to top, ${colorStops})`,
    width: "20px",
    height: `${height + 2}px`,
    border: "1px solid #ccc",
    marginTop: "-15px",
  };

  // Create evenly spaced labels
  const numLabels = max === min ? 1 : 5; // Adjust the number of labels as needed
  const labels = [];
  for (let i = 0; i < numLabels; i++) {
    const value = numLabels === 1 ? min : min + (i / (numLabels - 1)) * (max - min);
    const position = max === min ? 50 : ((value - min) / (max - min)) * 100;
    labels.push({ value, position });
  }

  return (
    <div className=" mt-5">
      <div className="ml-7 " style={{ display: "flex", alignItems: "center" }}>
        {/* Labels and Ticks Container */}
        <div
          style={{
            position: "relative",
            height: `${height}px`,
            marginRight: "5px",
            width: "auto",
          }}
        >
          {labels.map((label, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                bottom: `${label.position}%`,
                left: "-25px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {/* Label Text */}
              <div
                style={{
                  fontSize: "10px",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  marginRight: "3px",
                }}
              >
                {label.value.toFixed(2)}
              </div>
              {/* Tick */}
              <div
                style={{
                  width: "6px",
                  height: "1px",
                  backgroundColor: "#333",
                }}
              ></div>
            </div>
          ))}
        </div>
        {/* Gradient */}
        <div style={gradientStyle}></div>
      </div>
    </div>
  );
};

// Remount only the legend content when its meaning changes. The user's compact
// collapse preference survives field and dataset switches.
const Key = (props: KeyProps) => {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 800);
  const [dataset, setDataset] = useState({ identity: props.datasetIdentity, version: 0 });
  if (dataset.identity !== props.datasetIdentity)
    setDataset({ identity: props.datasetIdentity, version: dataset.version + 1 });
  const mode = props.numericEmpty ? "numeric-empty" : props.colorRamps?.[props.colorByField] ? "ramp" : "discrete";
  const scope = JSON.stringify([dataset.version, props.colorByField, props.colorByGene, props.colorByPosition, mode]);
  return <KeyContent key={scope} {...props} collapsed={collapsed} setCollapsed={setCollapsed} />;
};

function KeyContent({ keyStuff, colorByField, colorByGene, colorByPosition, config,
  setCurrentColorSettingKey, setColorSettingOpen, hoveredKey, setHoveredKey,
  colorRamps, numericEmpty, collapsed, setCollapsed,
}: KeyProps & { collapsed: boolean; setCollapsed: (value: boolean) => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const editorFrame = useRef<number | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const entries = useMemo(() => keyStuff.filter(item => item.value !== "")
    .sort((a, b) => b.count - a.count), [keyStuff]);
  const title = colorByField === "genotype" ? `${colorByGene}:${colorByPosition}` : prettifyName(colorByField, config);
  useEffect(() => () => {
    if (editorFrame.current !== null) cancelAnimationFrame(editorFrame.current);
    setHoveredKey(null);
  }, [setHoveredKey]);
  const edit = (value: string) => {
    setHoveredKey(null);
    setCurrentColorSettingKey(value);
    setColorSettingOpen(true);
  };
  const close = () => { setDialogOpen(false); setHoveredKey(null); };
  const editFromDialog = (value: string) => {
    close();
    // Let the dialog release its focus trap before the existing editor mounts.
    editorFrame.current = requestAnimationFrame(() => {
      editorFrame.current = null;
      opener.current?.focus();
      edit(value);
    });
  };
  if (colorByField === "None" || (!entries.length && !numericEmpty && !colorRamps?.[colorByField] && !dialogOpen)) return null;
  return <>
    <div aria-label="Colour legend" className={classNames(
      "px-2 border-right border bg-white border-gray-200 opacity-90 absolute bottom-2 left-2 pt-1 pb-2",
      collapsed ? "w-20" : "w-32"
    )} style={{ zIndex: 10, cursor: "default" }}>
      <h3><button type="button" className="font-bold text-gray-600 text-xs cursor-pointer text-left w-full"
        aria-label={collapsed ? "Expand colour legend" : "Collapse colour legend"} aria-expanded={!collapsed}
        onClick={() => { setCollapsed(!collapsed); close(); }}>
        {collapsed ? "Key" : title}<span aria-hidden="true" className="float-right">{collapsed ? "▲" : "▼"}</span>
      </button></h3>
      {!collapsed && (numericEmpty ? <div className="text-xs">No valid numeric values</div> : colorRamps?.[colorByField] ? (
        <div><ColorRamp ramp={colorRamps[colorByField]} />
          {keyStuff.some(item => item.missing) && <div className="text-xs mt-2"><span className="circle w-2 h-2 mr-2 inline-block" style={{ background: `rgb(${MISSING_COLOR.join(",")})` }} />Missing</div>}
        </div>
      ) : <>
        {entries.slice(0, 10).map(item => <LegendEntry key={legendEntryKey(item)} item={item}
          hoveredKey={hoveredKey} setHoveredKey={setHoveredKey} onActivate={edit} />)}
        {entries.length > 10 && <button ref={opener} type="button" aria-haspopup="dialog"
          className="text-xs text-blue-700 underline mt-1 text-left" onClick={() => { setHoveredKey(null); setDialogOpen(true); }}>
          Show all {entries.length.toLocaleString()} categories
        </button>}
      </>)}
    </div>
    {dialogOpen && <LegendDialog title={title} entries={entries} onClose={close} onActivate={editFromDialog}
      hoveredKey={hoveredKey} setHoveredKey={setHoveredKey} />}
  </>;
}

export default Key;
