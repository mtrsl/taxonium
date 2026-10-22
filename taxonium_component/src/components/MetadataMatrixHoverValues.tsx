import type { TreeViewLayout } from "../utils/treeLayout";
import type { HoverInfo } from "../types/common";
import type { Node } from "../types/node";
import type { MetadataMatrix } from "../types/metadataMatrix";
import {
  formatMetadataMatrixHoverValue,
  darkenMetadataColor,
} from "../utils/metadataMatrix";

interface MetadataMatrixHoverValuesProps {
  hoverInfo: HoverInfo<Node> | null;
  metadataMatrix: MetadataMatrix;
  layout: TreeViewLayout;
}

const MetadataMatrixHoverValues = ({
  hoverInfo,
  metadataMatrix,
  layout,
}: MetadataMatrixHoverValuesProps) => {
  if (!hoverInfo || !hoverInfo.object || !metadataMatrix.isEnabled) {
    return null;
  }

  return (
    <div
      aria-label="Metadata values for hovered node"
      style={{
        position: "absolute",
        top: layout.rotated ? layout.metadata.y : hoverInfo.y,
        left: layout.rotated ? Math.max(0, Math.min(hoverInfo.x, layout.tree.width - 120)) : layout.metadata.x,
        width: layout.rotated ? 120 : layout.metadata.width,
        height: layout.rotated ? layout.metadata.height : 0,
        overflow: layout.rotated ? "hidden" : undefined,
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {metadataMatrix.matrixFields.map((field, index) => {
        const value = formatMetadataMatrixHoverValue(
          field.kind,
          hoverInfo.object[field.field]
        );
        return (
          <div
            key={field.field}
            aria-label={`${field.label}: ${value}`}
            style={{
              position: "absolute",
              left: layout.rotated ? 0 : 12 + index * metadataMatrix.columnWidth,
              top: layout.rotated ? 12 + index * metadataMatrix.columnWidth : 0,
              width: layout.rotated ? 120 : metadataMatrix.columnWidth,
              height: layout.rotated ? metadataMatrix.columnWidth : 0,
              overflow: "visible",
              whiteSpace: "nowrap",
              textAlign: "center",
              display: "flex",
              justifyContent: layout.rotated ? "flex-start" : "center",
              alignItems: layout.rotated ? "center" : "flex-end",
              color: `rgb(${darkenMetadataColor(metadataMatrix.getValueColor(field, hoverInfo.object[field.field]) ?? field.color).join(", ")})`,
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: "inline-block",
                writingMode: layout.rotated ? "horizontal-tb" : "vertical-rl",
                transform: layout.rotated ? undefined : "rotate(180deg)",
                maxWidth: layout.rotated ? 120 : undefined,
                overflow: layout.rotated ? "hidden" : undefined,
                textOverflow: "ellipsis",
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                borderRadius: "2px",
                boxShadow: "0 0 2px rgba(0, 0, 0, 0.25)",
                lineHeight: 1,
                textAlign: "left",
                textShadow: "0 0 2px rgba(255, 255, 255, 0.9)",
              }}
            >
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default MetadataMatrixHoverValues;
