import { useMemo, useCallback } from "react";
import prettifyName from "../utils/prettifyName";
import type { Query } from "../types/query";
import type { Config, DynamicData } from "../types/backend";
import type { MetadataMatrix, MetadataMatrixConfig } from "../types/metadataMatrix";

const TRUE_VALUES = new Set(["true", "1", "yes", "y", "t"]);
const FALSE_VALUES = new Set(["false", "0", "no", "n", "f", ""]);
const RESERVED_FIELDS = new Set(["genotype", "None"]);

const normalizeValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim().toLowerCase();
};

const isBooleanLikeValue = (value: unknown) => {
  const normalized = normalizeValue(value);
  return TRUE_VALUES.has(normalized) || FALSE_VALUES.has(normalized);
};

const isTruthyValue = (value: unknown) => {
  return TRUE_VALUES.has(normalizeValue(value));
};

const clampColorChannel = (channel: number) => {
  return Math.max(55, Math.min(215, channel));
};

const fieldToColor = (field: string): [number, number, number] => {
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

const sanitizeConfig = (rawConfig: string | undefined): MetadataMatrixConfig => {
  if (!rawConfig) {
    return { fields: [] };
  }
  try {
    const parsed = JSON.parse(rawConfig) as Partial<MetadataMatrixConfig>;
    return {
      fields: Array.isArray(parsed.fields)
        ? parsed.fields.filter((field): field is string => typeof field === "string")
        : [],
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
        let sawBooleanLikeValue = false;
        for (const node of sampleNodes) {
          const value = node[field];
          const normalized = normalizeValue(value);
          if (normalized === "") {
            continue;
          }
          if (!isBooleanLikeValue(value)) {
            return false;
          }
          sawBooleanLikeValue = true;
        }
        return sawBooleanLikeValue;
      })
      .sort((a, b) => prettifyName(a, config).localeCompare(prettifyName(b, config)));
  }, [config, nodes]);

  const selectedFields = useMemo(() => {
    return metadataMatrixConfig.fields.filter((field) =>
      availableFields.includes(field)
    );
  }, [availableFields, metadataMatrixConfig.fields]);

  const setSelectedFields = useCallback(
    (fields: string[]) => {
      updateQuery({
        metadataMatrix: JSON.stringify({
          fields: fields.filter((field, index) => fields.indexOf(field) === index),
        }),
      });
    },
    [updateQuery]
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
      color: fieldToColor(field),
    }));
  }, [config, selectedFields]);

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
      matrixFields,
      isEnabled: matrixFields.length > 0,
      panelWidth,
      headerHeight,
      columnWidth,
      cellSize,
      setSelectedFields,
      toggleField,
      moveField,
      isTruthyValue,
    }),
    [
      selectedFields,
      availableFields,
      matrixFields,
      panelWidth,
      headerHeight,
      columnWidth,
      cellSize,
      setSelectedFields,
      toggleField,
      moveField,
    ]
  );
};

export default useMetadataMatrix;
