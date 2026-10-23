import { useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const importParams = new Set(["backend", "sid", "protoUrl", "treeUrl", "metaUrl", "embeddingUrl", "treeType", "metaType", "taxonColumn", "ladderizeTree", "configUrl", "config", "usherProtobuf", "referenceGBFF", "referenceFasta", "metadataUrl", "title", "description", "icon", "maintainerMessage"]);

const queryParamsToObject = (search) => {
  const params = {};
  new URLSearchParams(search).forEach((value, key) => {
    if (!importParams.has(key)) params[key] = value;
  });
  return params;
};

const objectToQueryParams = (obj) =>
  "?" +
  Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .map((key) => `${key}=${encodeURIComponent(obj[key])}`) // Directly encode here
    .join("&");

const removeUndefined = (obj) => {
  const nextObj = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      nextObj[key] = value;
    }
  }
  return nextObj;
};

const useQueryAsState = (defaultValues = {}) => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const decodedSearch = useMemo(() => queryParamsToObject(search), [search]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    let changed = false;
    for (const key of importParams) if (params.has(key)) { params.delete(key); changed = true; }
    if (changed) navigate({ pathname, search: params.toString() }, { replace: true });
  }, [search, pathname, navigate]);

  const updateRef = useRef({ decodedSearch, pathname });
  useEffect(() => {
    updateRef.current = { decodedSearch, pathname };
  }, [decodedSearch, pathname]);

  const updateQuery = useCallback(
    (updatedParams, method = "push") => {
      const { pathname, decodedSearch } = updateRef.current;
      const newParams = Object.fromEntries(Object.entries({ ...decodedSearch, ...updatedParams }).filter(([key]) => !importParams.has(key)));

      // Remove null values from the query parameters
      Object.keys(updatedParams).forEach((key) => {
        if (updatedParams[key] === null) {
          delete newParams[key];
        }
      });

      navigate(
        {
          pathname,
          search: objectToQueryParams(newParams),
        },
        { replace: method === "replace" }
      ); // Use the replace option for "replace" method
    },
    [navigate]
  );

  const queryWithDefault = useMemo(
    () => ({ ...defaultValues, ...removeUndefined(decodedSearch) }),
    [decodedSearch, defaultValues]
  );

  return [queryWithDefault, updateQuery];
};

export default useQueryAsState;
