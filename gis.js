// Public Andhra Pradesh GIS facility layers. These are REFERENCE DIRECTORY records, not live operations data:
// a "beds" attribute is a sanctioned/recorded number, never live availability. Results are cached for offline
// use and always labelled "Public directory" with their fetch time.
const HOSPITALS = "https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/NP_Health/FeatureServer/2";
const PHCS = "https://apsdmagis.ap.gov.in/gisserver/rest/services/Hosted/APSDMA_Infra/FeatureServer/14";
const CK = "swasthya.gis.v1.";

async function queryLayer(base, outFields, district) {
  const params = new URLSearchParams({ where: district ? `UPPER(district_name) LIKE '%${district.toUpperCase().replace(/'/g, "''")}%'` : "1=1", outFields, returnGeometry: "true", outSR: "4326", f: "json", resultRecordCount: "1500", orderByFields: "objectid ASC" });
  const r = await fetch(`${base}/query?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`GIS service returned ${r.status}`);
  const j = await r.json(); if (j.error) throw new Error(j.error.message || "GIS query failed");
  return j.features || [];
}
const okLL = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat > 8 && lat < 22 && lng > 74 && lng < 88;

export async function fetchPublicFacilities(district, { force = false } = {}) {
  const key = CK + (district || "ALL");
  let cached = null; try { cached = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* ignore */ }
  if (cached && !force && Date.now() - cached.at < 6 * 36e5) return { items: cached.items, fetchedAt: cached.at, fromCache: true };
  if (!navigator.onLine && cached) return { items: cached.items, fetchedAt: cached.at, fromCache: true, stale: true };
  try {
    const [hs, ps] = await Promise.allSettled([
      queryLayer(HOSPITALS, "objectid,hospital_n,district,district_name,hospital_t,no_of_beds,latitude,longitude", district),
      queryLayer(PHCS, "objectid,phc,dname,dmname,dvname,subcenter,district_name", district),
    ]);
    const items = [];
    if (hs.status === "fulfilled") for (const f of hs.value) { const a = f.attributes || {}, g = f.geometry || {}; const lat = Number(a.latitude ?? g.y), lng = Number(a.longitude ?? g.x); if (!okLL(lat, lng)) continue; items.push({ id: "gis-h-" + a.objectid, kind: "public", name: a.hospital_n || "Unnamed hospital record", type: /primary/i.test(a.hospital_t || "") ? "phc" : /community/i.test(a.hospital_t || "") ? "chc" : "other", typeLabel: a.hospital_t || "Hospital", district: a.district_name || a.district || district || "Andhra Pradesh", lat, lng, recordedBeds: a.no_of_beds == null ? null : Number(a.no_of_beds), source: "AP GIS · NP_Health hospitals layer", sourceUrl: `${HOSPITALS}/${a.objectid}` }); }
    if (ps.status === "fulfilled") for (const f of ps.value) { const a = f.attributes || {}, g = f.geometry || {}; const lat = Number(g.y), lng = Number(g.x); if (!okLL(lat, lng)) continue; items.push({ id: "gis-p-" + a.objectid, kind: "public", name: a.phc || a.subcenter || "Primary health centre record", type: "phc", typeLabel: "Primary Health Centre", district: a.district_name || a.dname || district || "Andhra Pradesh", mandal: a.dmname, village: a.dvname, lat, lng, source: "AP GIS · primary health centres layer", sourceUrl: `${PHCS}/${a.objectid}` }); }
    if (!items.length && hs.status === "rejected" && ps.status === "rejected") throw new Error("The Andhra Pradesh GIS services could not be reached.");
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), items })); } catch { /* quota */ }
    return { items, fetchedAt: Date.now(), fromCache: false };
  } catch (e) {
    if (cached) return { items: cached.items, fetchedAt: cached.at, fromCache: true, stale: true, error: e.message };
    return { items: [], error: e.message };
  }
}
