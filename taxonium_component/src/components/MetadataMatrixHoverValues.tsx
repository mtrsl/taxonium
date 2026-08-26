import type { HoverInfo } from "../types/common";
import type { Node } from "../types/node";
import type { MetadataMatrix } from "../types/metadataMatrix";
import {
  formatMetadataMatrixHoverValue,
  getMetadataMatrixHoverRowOffset,
} from "../utils/metadataMatrix";

interface MetadataMatrixHoverValuesProps {
  hoverInfo: HoverInfo<Node> | null;
  metadataMatrix: MetadataMatrix;
  metadataViewX: number;
}

const MetadataMatrixHoverValues = ({
  hoverInfo,
  metadataMatrix,
  metadataViewX,
}: MetadataMatrixHoverValuesProps) => {
  if (!hoverInfo || !hoverInfo.object || !metadataMatrix.isEnabled) {
    return null;
  }

  return (
    <div
      aria-label="Metadata values for hovered node"
      style={{
        position: "absolute",
        top: `${hoverInfo.y}px`,
        left: `${metadataViewX}px`,
        width: `${metadataMatrix.panelWidth}px`,
        height: "18px",
        transform: "translateY(-50%)",
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
              left: `${12 + index * metadataMatrix.columnWidth}px`,
              top: `${getMetadataMatrixHoverRowOffset(index)}px`,
              width: `${metadataMatrix.columnWidth}px`,
              height: "18px",
              overflow: "visible",
              whiteSpace: "nowrap",
              textAlign: "center",
              lineHeight: "18px",
              color: `rgb(${field.color[0]}, ${field.color[1]}, ${field.color[2]})`,
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "0 3px",
                backgroundColor: "rgba(255, 255, 255, 0.88)",
                borderRadius: "2px",
                boxShadow: "0 0 2px rgba(0, 0, 0, 0.25)",
                lineHeight: "16px",
                textShadow: "0 0 1px rgba(255, 255, 255, 0.9)",
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
