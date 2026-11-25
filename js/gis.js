// Andhra Pradesh public GIS facility directory.
//
// IMPORTANT:
// These records describe public directory locations, not live hospital
// operations. Recorded/sanctioned bed counts are never presented as
// currently available beds. Each result retains its source and fetch time.

const HOSPITALS =
  "https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/NP_Health/FeatureServer/2";

const PHCS =
  "https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/APSDMA_Infra/FeatureServer/14";

const CACHE_PREFIX = "swasthya.gis.v1.";
const CACHE_TTL = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT = 15000;
const MAX_RECORDS = 1500;

const validCoordinates = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat > 8 &&
  lat < 22 &&
  lng > 74 &&
  lng < 88;

function readCache(key) {
  try {
    const cached = JSON.parse(
      localStorage.getItem(key) || "null"
    );

    if (
      cached &&
      Number.isFinite(cached.at) &&
      Array.isArray(cached.items)
    ) {
      return cached;
    }
  } catch {
    // Ignore unavailable or malformed cache.
  }

  return null;
}

function writeCache(key, items, at = Date.now()) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ at, items })
    );
  } catch {
    // Public directory caching is optional.
  }
}

function districtFilter(district) {
  if (!district) return "1=1";

  const safeDistrict = String(district)
    .trim()
    .replace(/'/g, "''")
    .toUpperCase();

  return `UPPER(district_name) LIKE '%${safeDistrict}%'`;
}

async function queryLayer(base, outFields, district) {
  const params = new URLSearchParams({
    where: districtFilter(district),
    outFields,
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    resultRecordCount: String(MAX_RECORDS),
    orderByFields: "objectid ASC"
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT
  );

  try {
    const response = await fetch(
      `${base}/query?${params}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      throw new Error(
        `GIS service returned ${response.status}`
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(
        result.error.message || "GIS query failed"
      );
    }

    return result.features || [];
  } finally {
    clearTimeout(timeout);
  }
}

function hospitalRecords(features, district) {
  const items = [];

  for (const feature of features) {
    const attributes = feature.attributes || {};
    const geometry = feature.geometry || {};

    const lat = Number(
      attributes.latitude ?? geometry.y
    );

    const lng = Number(
      attributes.longitude ?? geometry.x
    );

    if (!validCoordinates(lat, lng)) continue;

    const facilityType =
      attributes.hospital_t || "Hospital";

    items.push({
      id: `gis-h-${attributes.objectid}`,
      kind: "public",
      name:
        attributes.hospital_n ||
        "Unnamed hospital record",
      type: /primary/i.test(facilityType)
        ? "phc"
        : /community/i.test(facilityType)
          ? "chc"
          : "other",
      typeLabel: facilityType,
      district:
        attributes.district_name ||
        attributes.district ||
        district ||
        "Andhra Pradesh",
      lat,
      lng,
      recordedBeds:
        attributes.no_of_beds == null
          ? null
          : Number(attributes.no_of_beds),
      source:
        "AP GIS · NP_Health hospitals layer",
      sourceUrl:
        `${HOSPITALS}/${attributes.objectid}`,
      dataStatus: "public_directory"
    });
  }

  return items;
}

function phcRecords(features, district) {
  const items = [];

  for (const feature of features) {
    const attributes = feature.attributes || {};
    const geometry = feature.geometry || {};

    const lat = Number(geometry.y);
    const lng = Number(geometry.x);

    if (!validCoordinates(lat, lng)) continue;

    items.push({
      id: `gis-p-${attributes.objectid}`,
      kind: "public",
      name:
        attributes.phc ||
        attributes.subcenter ||
        "Primary health centre record",
      type: "phc",
      typeLabel: "Primary Health Centre",
      district:
        attributes.district_name ||
        attributes.dname ||
        district ||
        "Andhra Pradesh",
      mandal: attributes.dmname || "",
      village: attributes.dvname || "",
      lat,
      lng,
      source:
        "AP GIS · primary health centres layer",
      sourceUrl:
        `${PHCS}/${attributes.objectid}`,
      dataStatus: "public_directory"
    });
  }

  return items;
}

function sortRecords(items) {
  return items.sort((a, b) =>
    String(a.name).localeCompare(
      String(b.name),
      undefined,
      { sensitivity: "base" }
    )
  );
}

export async function fetchPublicFacilities(
  district,
  { force = false } = {}
) {
  const normalizedDistrict =
    district ? String(district).trim() : "";

  const key =
    CACHE_PREFIX +
    (normalizedDistrict || "ALL").toUpperCase();

  const cached = readCache(key);
  const now = Date.now();

  if (
    cached &&
    !force &&
    now - cached.at < CACHE_TTL
  ) {
    return {
      items: cached.items,
      fetchedAt: cached.at,
      fromCache: true,
      stale: false
    };
  }

  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) {
    if (cached) {
      return {
        items: cached.items,
        fetchedAt: cached.at,
        fromCache: true,
        stale: true
      };
    }

    return {
      items: [],
      error: "You are offline and no cached public directory is available."
    };
  }

  try {
    const [hospitalResult, phcResult] =
      await Promise.allSettled([
        queryLayer(
          HOSPITALS,
          "objectid,hospital_n,district,district_name,hospital_t,no_of_beds,latitude,longitude",
          normalizedDistrict
        ),
        queryLayer(
          PHCS,
          "objectid,phc,dname,dmname,dvname,subcenter,district_name",
          normalizedDistrict
        )
      ]);

    const items = [];

    if (hospitalResult.status === "fulfilled") {
      items.push(
        ...hospitalRecords(
          hospitalResult.value,
          normalizedDistrict
        )
      );
    }

    if (phcResult.status === "fulfilled") {
      items.push(
        ...phcRecords(
          phcResult.value,
          normalizedDistrict
        )
      );
    }

    if (
      hospitalResult.status === "rejected" &&
      phcResult.status === "rejected"
    ) {
      throw new Error(
        "The Andhra Pradesh GIS services could not be reached."
      );
    }

    const sorted = sortRecords(items);
    const fetchedAt = Date.now();

    writeCache(key, sorted, fetchedAt);

    return {
      items: sorted,
      fetchedAt,
      fromCache: false,
      stale: false,
      partial:
        hospitalResult.status === "rejected" ||
        phcResult.status === "rejected",
      errors: [
        hospitalResult.status === "rejected"
          ? hospitalResult.reason?.message
          : null,
        phcResult.status === "rejected"
          ? phcResult.reason?.message
          : null
      ].filter(Boolean)
    };
  } catch (error) {
    if (cached) {
      return {
        items: cached.items,
        fetchedAt: cached.at,
        fromCache: true,
        stale: true,
        error: error.message
      };
    }

    return {
      items: [],
      error: error.message ||
        "Unable to load the public facility directory."
    };
  }
}
