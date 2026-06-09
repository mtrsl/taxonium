import { useRef, useState } from "react";
import type { MouseEvent } from "react";
import { SketchPicker } from "react-color";
import type { MetadataMatrixColor } from "../types/metadataMatrix";

interface RGBColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

interface ColorSwatchPickerProps {
  color: MetadataMatrixColor;
  setColor: (color: MetadataMatrixColor) => void;
  title?: string;
  className?: string;
}

const PICKER_WIDTH = 220;
const PICKER_HEIGHT = 320;
const VIEWPORT_MARGIN = 8;

const listToRgb = (list: MetadataMatrixColor): RGBColor => ({
  r: list[0],
  g: list[1],
  b: list[2],
});

const rgbToList = (rgb: RGBColor): MetadataMatrixColor => [
  rgb.r,
  rgb.g,
  rgb.b,
];

function ColorSwatchPicker({
  color,
  setColor,
  title = "Edit color",
  className = "",
}: ColorSwatchPickerProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [pickerPosition, setPickerPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const rgbColor = listToRgb(color);

  const closePicker = () => {
    setPickerPosition(null);
  };

  const togglePicker = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (pickerPosition) {
      closePicker();
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setPickerPosition({
      top: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.bottom + 6, window.innerHeight - PICKER_HEIGHT)
      ),
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(
          rect.right - PICKER_WIDTH,
          window.innerWidth - PICKER_WIDTH - VIEWPORT_MARGIN
        )
      ),
    });
  };

  const handleColorChange = (newColor: { rgb: RGBColor }) => {
    setColor(rgbToList(newColor.rgb));
  };

  return (
    <span className={`inline-block shrink-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={title}
        title={title}
        className="block w-3 h-3 rounded-sm border border-gray-300 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
        style={{
          backgroundColor: `rgb(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b})`,
        }}
        onClick={togglePicker}
      />
      {pickerPosition && (
        <>
          <span
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 20,
            }}
            onClick={closePicker}
          />
          <span
            style={{
              position: "fixed",
              top: `${pickerPosition.top}px`,
              left: `${pickerPosition.left}px`,
              zIndex: 21,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <SketchPicker
              color={rgbColor}
              onChange={handleColorChange}
              presetColors={[]}
              disableAlpha={true}
            />
          </span>
        </>
      )}
    </span>
  );
}

export default ColorSwatchPicker;
