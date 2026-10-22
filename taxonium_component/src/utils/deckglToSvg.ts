import { orientPoint } from "./treeLayout";
import computeBounds from "./computeBounds";
import type { DeckSize } from "../types/common";
import type { ViewState } from "../types/view";


const getSVGfunction = (
  layers: any[],
  viewState: ViewState,
  metadataLayout?: { treeWidth: number; matrixWidth: number; treeHeight?: number; rotated?: boolean }
): { triggerSVGdownload: (deckSize?: DeckSize) => void } => {
  const accessOrConstant = <T, R>(accessor: ((node: T) => R) | R, node: T): R => {
    if (typeof accessor === "function") {
      return (accessor as (node: T) => R)(node);
    } else {
      return accessor as R;
    }
  };
  const normalise = (value: number, min: number, max: number): number => {
    return (value - min) / (max - min);
  };

  const getSVG = (
    layers: any[],
    viewState: ViewState,
    svgWidth: number,
    svgHeight: number
  ): string => {
    const rotated = metadataLayout?.rotated ?? false;
    const orient = (point: [number, number]) => orientPoint(point, rotated);
    const applyBounds = (point: [number, number]): [number, number] => {
      const minY = viewState.min_y as number;
      const maxY = viewState.max_y as number;
      const minX = viewState.min_x as number;
      const maxX = viewState.max_x as number;
      const initial = point;
      const x = normalise(initial[0], minX, maxX);
      const y = normalise(initial[1], minY, maxY);
      return orient([x * (metadataLayout?.treeWidth ?? svgWidth), y * svgHeight]);
    };
  
    let svgContent = `<svg xmlns='http://www.w3.org/2000/svg' width="${rotated ? svgHeight : svgWidth}" height="${rotated ? svgWidth : svgHeight}">`;

    const treeSize = orient([metadataLayout?.treeWidth ?? svgWidth, svgHeight]);
    svgContent += `<defs><clipPath id="tree-clip"><rect width="${treeSize[0]}" height="${treeSize[1]}" /></clipPath>`;
    if (metadataLayout) {
      const origin = orient([metadataLayout.treeWidth, 0]);
      const size = orient([metadataLayout.matrixWidth, svgHeight]);
      svgContent += `<clipPath id="metadata-clip"><rect x="${origin[0]}" y="${origin[1]}" width="${size[0]}" height="${size[1]}" /></clipPath>`;
    }
    svgContent += "</defs>";

    for (const layer of layers) {
      if (metadataLayout && layer.id.startsWith("metadata-matrix-")) {
        const matrixPoint = ([x, y]: [number, number]) =>
          orient([metadataLayout.treeWidth + x, normalise(y, viewState.min_y!, viewState.max_y!) * svgHeight]);
        const css = (color: number[]) => `rgba(${color.slice(0, 3).join(",")},${(color[3] ?? 255) / 255})`;
        // Clip the matrix to its viewport, just as Deck does on screen.
        svgContent += `<g clip-path="url(#metadata-clip)">`;
        if (layer.layerType === "PolygonLayer") {
          for (const cell of layer.data) {
            const points = layer.getPolygon(cell).map(matrixPoint).map((p: number[]) => p.join(",")).join(" ");
            const fill = css(accessOrConstant(layer.getFillColor, cell));
            const stroke = layer.stroked ? css(accessOrConstant(layer.getLineColor, cell)) : "none";
            const width = layer.stroked ? accessOrConstant(layer.getLineWidth, cell) : 0;
            svgContent += `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" />`;
          }
        } else if (layer.layerType === "BitmapLayer" && layer.image) {
          const [x0, y0, x1, y1] = layer.bounds;
          // Map image top-left (maximum sample Y), top-right and bottom-left.
          // The same affine mapping handles standard and swapped sample axes.
          const origin = matrixPoint([x0, Math.max(y0, y1)]);
          const right = matrixPoint([x1, Math.max(y0, y1)]);
          const bottom = matrixPoint([x0, Math.min(y0, y1)]);
          svgContent += `<image width="1" height="1" preserveAspectRatio="none" transform="matrix(${right[0] - origin[0]} ${right[1] - origin[1]} ${bottom[0] - origin[0]} ${bottom[1] - origin[1]} ${origin[0]} ${origin[1]})" href="${layer.image.toDataURL()}" />`;
        }
        svgContent += "</g>";
        continue;
      }
      // unless layer id starts with "main"
      if (!layer.id.startsWith("main")) {
        continue;
      }

      svgContent += '<g clip-path="url(#tree-clip)">';
      switch (layer.layerType) {
        case "ScatterplotLayer":
          for (const point of layer.data) {
            const [x, y] = applyBounds(layer.getPosition(point));
            // if either is null, skip this point
            if (x === null || y === null) {
              continue;
            }
            const accessor = layer.getFillColor
              ? layer.getFillColor
              : layer.getColor;
            let color;
            if (!accessor) {
              // make color transparent
              color = "none";
            } else {
              const initColor = accessOrConstant(accessor, point);
              // if rgba
              if (initColor.length === 4) {
                color = `rgba(${initColor.join(",")})`;
                if (initColor[3] === 0) {
                  color = "none";
                }
              }
              // if rgb
              else if (initColor.length === 3) {
                color = `rgb(${initColor.join(",")})`;
              } else {
                console.warn("Unsupported color format");
              }
            }
            // check if stroked
            let strokeColor, strokeWidth;
            if (layer.stroked) {
              strokeColor = accessOrConstant(layer.getLineColor, point).join(
                ","
              );
              strokeWidth = accessOrConstant(layer.getLineWidth, point);
            }

            // if getRadius is a fn call it otherwise assume it's a value
            const radius = accessOrConstant(layer.getRadius, point);
            svgContent += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"
            ${
              layer.stroked
                ? `stroke="rgb(${strokeColor})" stroke-width="${strokeWidth}"`
                : ""
            } />`;
          }
          break;

        case "LineLayer":
          for (const line of layer.data) {
            const [x1, y1] = applyBounds(layer.getSourcePosition(line));
            const [x2, y2] = applyBounds(layer.getTargetPosition(line));
            // if either is null, skip this point
            if (x1 === null || y1 === null || x2 === null || y2 === null) {
              continue;
            }
            const colorAccessor = layer.getLineColor
              ? layer.getLineColor
              : layer.getColor;
            // if colorAccessor is a function, call it with the line as an argument, otherwise assume it's an array
            const color = accessOrConstant(colorAccessor, line).join(",");
            const width = accessOrConstant(layer.getWidth, line);
            svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgb(${color})" stroke-width="${width}" />`;
          }
          break;

        case "TextLayer":
          for (const text of layer.data) {
            //const [x, y] = applyModelMatrix(layer.modelMatrix, layer.getPosition(text));
            const original = layer.getPosition(text);
            const adjusted = applyBounds(original);

            const [x, y] = adjusted;
            const size = accessOrConstant(layer.getSize, text);
            const alignment = accessOrConstant(
              layer.getAlignmentBaseline,
              text
            );
            const anchor = accessOrConstant(layer.getTextAnchor, text);
            const pixelOffset = accessOrConstant(layer.getPixelOffset, text);

            const color = accessOrConstant(layer.getColor, text).join(",");
            const newContent = `<text x="${x}" y="${y}" font-family="${
              layer.fontFamily
            }" font-weight="${layer.fontWeight}" fill="rgb(${color})"
            font-size="${size}" text-anchor="${anchor}" alignment-baseline="${alignment}" dx="${
              pixelOffset[0]
            }" dy="${pixelOffset[1]}"
            >${layer.getText(text)}</text>`;
            svgContent += newContent;
          }
          break;

        // You can extend this with other layer types such as PolygonLayer, SolidPolygonLayer, etc.

        default:
          console.warn(`Unsupported layer type: ${layer.layerType}`);
          break;
      }
      svgContent += "</g>";
    }

    svgContent += "</svg>";
    return svgContent;
  };

  function triggerSVGdownload(deckSize?: DeckSize) {
    if (!deckSize) {
      deckSize = { width: 600, height: 600 };
    }
    const canonicalSize = metadataLayout?.rotated ? { width: deckSize.height, height: deckSize.width } : deckSize;
    const svgWidth = metadataLayout ? metadataLayout.treeWidth + metadataLayout.matrixWidth : canonicalSize.width;
    const svgHeight = metadataLayout?.treeHeight ?? canonicalSize.height;
    const viewStateWithBounds = computeBounds({ ...viewState }, { height: svgHeight, width: metadataLayout?.treeWidth ?? canonicalSize.width });
    const svgContent = getSVG(layers, viewStateWithBounds, svgWidth, svgHeight);
    if (!svgContent) {
      return;
    }
    // Create a new blob object
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    // Create a link element, hide it, direct it towards the blob, and then 'click' it programatically
    const a = document.createElement("a");
    a.style.display = "none";
    document.body.appendChild(a);
    // Create a DOMString representing the blob and point the link element towards it
    const url = window.URL.createObjectURL(blob);
    a.href = url;
    const date_and_time = new Date().toISOString().replace(/:/g, "-");
    a.download = `taxonium-${date_and_time}.svg`;
    //programatically click the link to trigger the download
    a.click();
    //release the reference to the file by revoking the Object URL
    window.URL.revokeObjectURL(url);
  }

  return { triggerSVGdownload };
};

export default getSVGfunction;
