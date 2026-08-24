import { useMemo, useCallback } from "react";
import prettifyName from "../utils/prettifyName";
import type { Query } from "../types/query";
import type { Config, DynamicData } from "../types/backend";
import type {
  MetadataMatrix,
  MetadataMatrixColor,
  MetadataMatrixConfig,
} from "../types/metadataMatrix";
import {
  classifyMetadataValues,
  interpolateMetadataColor,
  normalizeMetadataValue,
  normalizeNumericValue,
  TRUE_VALUES,
  type MetadataFieldInfo,
} from "../utils/metadataMatrix";

const RESERVED_FIELDS = new Set(["genotype", "None"]);

const isTruthyValue = (value: unknown) => {
  return TRUE_VALUES.has(normalizeMetadataValue(value));
};

const clampColorChannel = (channel: number) => {
  return Math.max(55, Math.min(215, channel));
};

const clampCustomColorChannel = (channel: number) => {
  return Math.max(0, Math.min(255, Math.round(channel)));
};

const fieldToColor = (field: string): MetadataMatrixColor => {
  let hash = 0;
  for (let i = 0; i < field.length; i++) {
    hash = field.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return [
    clampColorChannel(hash & 255),
    clampColorChannel((hash >> 8) & 255),
    clampColorChannel((hash >> 16) & 255),
  ];
};

const isMetadataMatrixColor = (value: unknown): value is MetadataMatrixColor => {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((channel) => typeof channel === "number" && Number.isFinite(channel))
  );
};

const sanitizeColors = (
  colors: Partial<MetadataMatrixConfig>["colors"]
): Record<string, MetadataMatrixColor> => {
  if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(colors)
      .filter((entry): entry is [string, MetadataMatrixColor] =>
        isMetadataMatrixColor(entry[1])
      )
      .map(([field, color]) => [
        field,
        [
          clampCustomColorChannel(color[0]),
          clampCustomColorChannel(color[1]),
          clampCustomColorChannel(color[2]),
        ] satisfies MetadataMatrixColor,
      ])
  );
};

const uniqueFields = (fields: string[]) =>
  fields.filter((field, index) => fields.indexOf(field) === index);

const serializeConfig = (
  fields: string[],
  colors: Record<string, MetadataMatrixColor>
) => {
  const nextConfig: MetadataMatrixConfig = {
    fields: uniqueFields(fields),
  };
  if (Object.keys(colors).length > 0) {
    nextConfig.colors = colors;
  }
  return JSON.stringify(nextConfig);
};

const sanitizeConfig = (rawConfig: string | undefined): MetadataMatrixConfig => {
  if (!rawConfig) {
    return { fields: [] };
  }
  try {
    const parsed = JSON.parse(rawConfig) as Partial<MetadataMatrixConfig>;
    return {
      fields: Array.isArray(parsed.fields)
        ? uniqueFields(
            parsed.fields.filter(
              (field): field is string => typeof field === "string"
            )
          )
        : [],
      colors: sanitizeColors(parsed.colors),
    };
  } catch {
    return { fields: [] };
  }
};

interface UseMetadataMatrixProps {
  query: Query;
  updateQuery: (q: Partial<Query>) => void;
  config: Config;
  data: DynamicData;
}

const useMetadataMatrix = ({
  query,
  updateQuery,
  config,
  data,
}: UseMetadataMatrixProps): MetadataMatrix => {
  const metadataMatrixConfig = useMemo(
    () => sanitizeConfig(query.metadataMatrix as string | undefined),
    [query.metadataMatrix]
  );

  const nodes = data.base_data?.nodes?.length
    ? data.base_data.nodes
    : data.data?.nodes ?? [];

  const availableFields = useMemo(() => {
    const fieldCandidates = new Set<string>();
    const colorOptions = config.colorBy?.colorByOptions ?? [];

    colorOptions.forEach((field) => {
      if (field.startsWith("meta_") && !RESERVED_FIELDS.has(field)) {
        fieldCandidates.add(field);
      }
    });

    const sampleNodes = nodes.slice(0, 2000);
    sampleNodes.forEach((node) => {
      Object.keys(node).forEach((field) => {
        if (field.startsWith("meta_")) {
          fieldCandidates.add(field);
        }
      });
    });

    return Array.from(fieldCandidates)
      .filter((field) => {
        if (config.metadataFields?.[field]) {
          return true;
        }
        return classifyMetadataValues(sampleNodes.map((node) => node[field])) !== null;
      })
      .sort((a, b) => prettifyName(a, config).localeCompare(prettifyName(b, config)));
  }, [config, nodes]);

  const fieldInfo = useMemo(() => {
    const info: Record<string, MetadataFieldInfo> = {};
    availableFields.forEach((field) => {
      const configuredInfo = config.metadataFields?.[field];
      if (configuredInfo) {
        info[field] = configuredInfo;
        return;
      }
      const inferredInfo = classifyMetadataValues(
        nodes.slice(0, 2000).map((node) => node[field])
      );
      if (inferredInfo) {
        info[field] = inferredInfo;
      }
    });
    return info;
  }, [availableFields, config.metadataFields, nodes]);

  const selectedFields = useMemo(() => {
    return metadataMatrixConfig.fields.filter((field) =>
      availableFields.includes(field)
    );
  }, [availableFields, metadataMatrixConfig.fields]);

  const setSelectedFields = useCallback(
    (fields: string[]) => {
      updateQuery({
        metadataMatrix: serializeConfig(
          fields,
          metadataMatrixConfig.colors ?? {}
        ),
      });
    },
    [metadataMatrixConfig.colors, updateQuery]
  );

  const getFieldColor = useCallback(
    (field: string): MetadataMatrixColor => {
      return metadataMatrixConfig.colors?.[field] ?? fieldToColor(field);
    },
    [metadataMatrixConfig.colors]
  );

  const setFieldColor = useCallback(
    (field: string, color: MetadataMatrixColor) => {
      const sanitizedColor: MetadataMatrixColor = [
        clampCustomColorChannel(color[0]),
        clampCustomColorChannel(color[1]),
        clampCustomColorChannel(color[2]),
      ];
      updateQuery({
        metadataMatrix: serializeConfig(metadataMatrixConfig.fields, {
          ...(metadataMatrixConfig.colors ?? {}),
          [field]: sanitizedColor,
        }),
      });
    },
    [metadataMatrixConfig.colors, metadataMatrixConfig.fields, updateQuery]
  );

  const toggleField = useCallback(
    (field: string) => {
      if (selectedFields.includes(field)) {
        setSelectedFields(selectedFields.filter((item) => item !== field));
      } else {
        setSelectedFields([...selectedFields, field]);
      }
    },
    [selectedFields, setSelectedFields]
  );

  const moveField = useCallback(
    (field: string, direction: -1 | 1) => {
      const currentIndex = selectedFields.indexOf(field);
      if (currentIndex === -1) {
        return;
      }
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= selectedFields.length) {
        return;
      }
      const nextFields = [...selectedFields];
      const [movedField] = nextFields.splice(currentIndex, 1);
      nextFields.splice(nextIndex, 0, movedField);
      setSelectedFields(nextFields);
    },
    [selectedFields, setSelectedFields]
  );

  const matrixFields = useMemo(() => {
    return selectedFields.map((field) => ({
      field,
      label: prettifyName(field, config),
      color: getFieldColor(field),
      kind: fieldInfo[field]?.kind ?? "boolean",
      min: fieldInfo[field]?.min,
      max: fieldInfo[field]?.max,
    }));
  }, [config, fieldInfo, getFieldColor, selectedFields]);

  const getValueColor = useCallback(
    (field: MetadataMatrix["matrixFields"][number], value: unknown) => {
      if (field.kind === "boolean") {
        return isTruthyValue(value) ? field.color : null;
      }
      const normalizedValue = normalizeNumericValue(value, field.min, field.max);
      if (normalizedValue === null) {
        return null;
      }
      return interpolateMetadataColor([244, 244, 244], field.color, normalizedValue);
    },
    [matrixFields]
  );

  const columnWidth = 24;
  const cellSize = 14;
  const headerHeight = 88;
  const panelWidth = matrixFields.length
    ? Math.max(120, matrixFields.length * columnWidth + 24)
    : 0;

  return useMemo(
    () => ({
      selectedFields,
      availableFields,
      fieldInfo,
      matrixFields,
      isEnabled: matrixFields.length > 0,
      panelWidth,
      headerHeight,
      columnWidth,
      cellSize,
      setSelectedFields,
      toggleField,
      moveField,
      getFieldColor,
      setFieldColor,
      isTruthyValue,
      getValueColor,
    }),
    [
      selectedFields,
      availableFields,
      fieldInfo,
      matrixFields,
      panelWidth,
      headerHeight,
      columnWidth,
      cellSize,
      setSelectedFields,
      toggleField,
      moveField,
      getFieldColor,
      setFieldColor,
      getValueColor,
    ]
  );
};

export default useMetadataMatrix;
