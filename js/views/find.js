// Facility discovery: search, district/type/department filters, GPS, map and facility profiles.
import {
  h,
  clear,
  icon,
  haversine,
  km,
  debounce,
  ago,
} from "../util.js";
import { db } from "../db.js";
import {
  DISTRICTS,
  DEPARTMENTS,
  FACILITY_TYPES,
  districtByName,
} from "../seed.js";
import {
  bedRows,
  bedTotals,
  provenance,
} from "../services.js";
import {
  provBadge,
  card,
  empty,
  notice,
  btn,
  kv,
  table,
  badge,
} from "../ui.js";
import {
  createMap,
  getPosition,
  directionsUrl,
} from "../map.js";
import { fetchPublicFacilities } from "../gis.js";
import { t } from "../i18n.js";

const KINDS = [
  ["", "All facility types"],
  ["govt_hospital", "Government hospital"],
  ["private_hospital", "Private hospital"],
  ["chc", "Community Health Centre"],
  ["phc", "Primary Health Centre"],
  ["diagnostic", "Diagnostic centre"],
  ["pharmacy", "Pharmacy"],
];

const state = {
  q: "",
  district: "",
  type: "",
  dept: "",
  me: null,
  public: [],
  publicInfo: {},
  sel: null,
};

export function allFacilities() {
  const platform = db
    .where(
      "orgs",
      (o) =>
        o.kind !== "ambulance" &&
        Number.isFinite(+o.lat) &&
        Number.isFinite(+o.lng) &&
        +o.lat !== 0 &&
        +o.lng !== 0 &&
        (o.verification === "verified" || o.demo)
    )
    .map((o) => ({
      ...o,
      platform: true,
    }));

  return [...platform, ...state.public];
}

export const typeLabel = (f) =>
  FACILITY_TYPES[f.type] || f.typeLabel || "Facility";

function matchesSearch(f, needle) {
  if (!needle) return true;

  return [
    f.name,
    f.mandal,
    f.village,
    f.address,
    f.pin,
    f.district,
    f.typeLabel,
  ].some((value) =>
    String(value || "").toLowerCase().includes(needle)
  );
}

function sortFacilities(items) {
  if (state.me) {
    return items
      .map((f) => ({
        ...f,
        dist: haversine(state.me, {
          lat: Number(f.lat),
          lng: Number(f.lng),
        }),
      }))
      .sort((a, b) => a.dist - b.dist);
  }

  return items
    .map((f) => ({ ...f }))
    .sort(
      (a, b) =>
        Number(!!b.platform) - Number(!!a.platform) ||
        String(a.name || "").localeCompare(String(b.name || ""))
    );
}

function filteredFacilities() {
  const needle = state.q.trim().toLowerCase();

  return sortFacilities(
    allFacilities().filter(
      (f) =>
        (!state.district || f.district === state.district) &&
        (!state.type || f.type === state.type) &&
        (!state.dept || f.depts?.includes(state.dept)) &&
        matchesSearch(f, needle)
    )
  );
}

function facilityCard(f, ctx, map, repaint) {
  const isPublic = f.kind === "public" || !f.platform;
  const isHospital = f.kind === "hospital";
  const prov = isPublic
    ? "public"
    : f.demo
      ? "demo"
      : provenance(f, bedTotals(f).updatedAt);

  const beds =
    f.platform && isHospital ? bedTotals(f) : null;

  const selected = state.sel === f.id;

  return h(
    "article",
    {
      class: "fac" + (selected ? " sel" : ""),
      tabindex: 0,
      "aria-label": `${f.name}, ${typeLabel(f)}, ${f.district}`,
      onclick: () => {
        state.sel = f.id;
        map?.select(f.id);
        map?.focus(Number(f.lat), Number(f.lng), 13);
        repaint();
      },
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.currentTarget.click();
        }
      },
    },

    h(
      "div",
      { class: "spread" },
      h("h3", {}, f.name || "Unnamed facility"),
      provBadge(prov, beds?.updatedAt)
    ),

    h(
      "div",
      { class: "small muted" },
      `${typeLabel(f)} · ${f.district || "District not listed"}`,
      f.mandal ? ` · ${f.mandal}` : "",
      f.dist != null ? ` · ${km(f.dist)}` : ""
    ),

    f.demo
      ? h(
          "div",
          { class: "small" },
          badge("DEMO DATA — illustrative", "demo")
        )
      : null,

    beds
      ? h(
          "div",
          { class: "bedcell" },
          icon("bed", 14),
          h("b", {}, beds.available),
          ` beds reported available of ${beds.total} · updated ${ago(
            beds.updatedAt
          )}`
        )
      : null,

    f.recordedBeds
      ? h(
          "div",
          { class: "small muted" },
          `${f.recordedBeds} beds recorded in the public directory. This is not live availability.`
        )
      : null,

    h(
      "div",
      { class: "cluster" },

      f.platform && isHospital
        ? h(
            "a",
            {
              class: "btn sm primary",
              href: `#/${ctx.user ? "app/hospital" : "find"}/${encodeURIComponent(
                f.id
              )}`,
              onclick: (event) => event.stopPropagation(),
            },
            t("common.view", "View")
          )
        : null,

      h(
        "a",
        {
          class: "btn sm",
          href: directionsUrl(f, state.me),
          target: "_blank",
          rel: "noopener noreferrer",
          onclick: (event) => event.stopPropagation(),
        },
        icon("navi", 14),
        t("common.directions", "Directions")
      ),

      f.phone
        ? h(
            "a",
            {
              class: "btn sm",
              href: "tel:" + String(f.phone).replace(/[^\d+]/g, ""),
              onclick: (event) => event.stopPropagation(),
            },
            icon("phone", 14),
            t("common.call", "Call")
          )
        : null
    )
  );
}

export function explorer(ctx) {
  const root = h("div", { class: "stack" });

  const listEl = h("div", {
    class: "stack",
    style: {
      maxHeight: "560px",
      overflow: "auto",
      paddingRight: ".2rem",
    },
  });

  const mapEl = h("div", {});
  const status = h("div", {
    class: "small muted",
    "aria-live": "polite",
  });

  let map;
  let destroyed = false;

  const search = h("input", {
    type: "search",
    placeholder: "Hospital name, mandal, village, town or PIN code",
    value: state.q,
    "aria-label": "Search facilities",
    oninput: debounce((event) => {
      state.q = event.target.value;
      paint();
    }, 200),
  });

  const selectFilter = (label, key, options) =>
    h(
      "div",
      { class: "field" },
      h("label", {}, label),
      h(
        "select",
        {
          value: state[key],
          onchange: (event) => {
            state[key] = event.target.value;

            if (key === "district") {
              const district = districtByName(state.district);

              if (district && map) {
                map.focus(district.lat, district.lng, 10);
              }

              if (state.district) {
                loadPublicFor(state.district);
              }
            }

            paint();
          },
        },
        options.map(([value, labelText]) =>
          h(
            "option",
            {
              value,
              selected: value === state[key],
            },
            labelText
          )
        )
      )
    );

  const nearMe = btn(
    t("common.nearMe", "Near me"),
    async () => {
      try {
        status.textContent = "Finding your location…";

        const position = await getPosition();
        state.me = position;

        map?.setMe(position);
        map?.focus(position.lat, position.lng, 11);

        status.textContent = "Showing nearest matching facilities first.";
        paint();
      } catch (error) {
        status.textContent =
          error.message || "Unable to get your location.";
      }
    },
    "",
    "navi"
  );

  const filters = h(
    "div",
    { class: "filters" },

    h(
      "div",
      { class: "field", style: { flex: 3 } },
      h("label", {}, t("common.search", "Search")),
      search
    ),

    selectFilter(
      t("common.district", "District"),
      "district",
      [
        ["", t("common.all", "All districts")],
        ...DISTRICTS.map((district) => [
          district.name,
          district.name,
        ]),
      ]
    ),

    selectFilter("Type", "type", KINDS),

    selectFilter(
      "Department",
      "dept",
      [
        ["", "Any department"],
        ...DEPARTMENTS.map((department) => [
          department,
          department,
        ]),
      ]
    ),

    h(
      "div",
      {
        class: "field",
        style: { flex: "0 0 auto" },
      },
      h("label", { "aria-hidden": "true" }, " "),
      nearMe
    )
  );

  function paint() {
    if (destroyed) return;

    const results = filteredFacilities();

    clear(listEl);

    if (!results.length) {
      listEl.append(
        empty(
          "No facilities match these filters. Try another district or clear your search."
        )
      );
    } else {
      results.slice(0, 80).forEach((facility) => {
        listEl.append(
          facilityCard(facility, ctx, map, paint)
        );
      });
    }

    const publicCount = results.filter(
      (facility) => !facility.platform
    ).length;

    status.textContent =
      `${results.length} matching facilities` +
      (results.length > 80 ? " · showing first 80" : "") +
      (publicCount ? ` · ${publicCount} public directory listing(s)` : "") +
      (state.me ? " · sorted by distance" : "");

    map?.setMarkers(
      results.slice(0, 300).map((facility) => ({
        id: facility.id,
        lat: Number(facility.lat),
        lng: Number(facility.lng),
        kind:
          facility.kind === "public"
            ? "public"
            : facility.kind === "hospital"
              ? facility.type
              : facility.kind,
        title: facility.name,
      }))
    );
  }

  async function loadPublicFor(district) {
    if (!district || destroyed) return;

    status.textContent = `Loading public directory for ${district}…`;

    try {
      const result = await fetchPublicFacilities(district);

      if (destroyed) return;

      state.public = [
        ...state.public.filter(
          (facility) => facility.district !== district
        ),
        ...(result.items || []),
      ];

      state.publicInfo[district] = {
        fetchedAt: result.fetchedAt,
        fromCache: !!result.fromCache,
        stale: !!result.stale,
        error: result.error || "",
        count: (result.items || []).length,
      };

      paint();
    } catch (error) {
      if (destroyed) return;

      state.publicInfo[district] = {
        error: error.message || "Directory unavailable",
        count: 0,
      };

      status.textContent =
        `Public directory unavailable: ${error.message || "Request failed"}`;
    }
  }

  map = createMap(mapEl, {
    height: "560px",
    onSelect: (marker) => {
      state.sel = marker.id;
      paint();

      document
        .querySelector(".fac.sel")
        ?.scrollIntoView({ block: "nearest" });
    },
  });

  root.append(
    notice(
      "info",
      h("strong", {}, "How to read facility information: "),
      "Platform hospitals may show bed counts reported by the facility with a timestamp. Public-directory records indicate a listed facility, not live staffing, beds, medicines or service availability. Call the facility before travelling."
    ),

    filters,
    status,

    h(
      "div",
      { class: "split rev" },
      listEl,
      mapEl
    ),

    h(
      "p",
      { class: "small muted" },
      "Location access is optional. If you choose Near me, your browser may ask permission to use your device location."
    )
  );

  paint();

  if (state.district) {
    loadPublicFor(state.district);
  }

  setTimeout(() => {
    if (!destroyed) map?.fit();
  }, 300);

  return root;
}

export function profile(ctx, orgId) {
  const org = db.get("orgs", orgId);

  if (!org) {
    return empty("Facility not found.");
  }

  const isVerified = org.verification === "verified";
  const isDemo = !!org.demo;

  const provenanceLabel = isDemo
    ? "demo"
    : isVerified
      ? provenance(org, bedTotals(org).updatedAt)
      : "unverified";

  const needLogin = (callback) => () => {
    if (ctx.user) {
      callback();
      return;
    }

    sessionStorage.setItem(
      "swasthya.next",
      location.hash
    );

    location.hash = "#/login";
  };

  const doctors = db.where(
    "doctors",
    (doctor) => doctor.orgId === org.id
  );

  const mapEl = h("div", {});

  const map = createMap(mapEl, {
    center: org,
    zoom: 13,
    height: "240px",
  });

  if (org.lat && org.lng) {
    map.setMarkers([
      {
        id: org.id,
        lat: Number(org.lat),
        lng: Number(org.lng),
        kind: org.type,
        title: org.name,
      },
    ]);
  }

  const beds = isVerified && !isDemo
    ? bedRows(org)
    : [];

  const services = [
    ...(org.depts || []).map((department) => ({
      label: department,
      type: "department",
    })),
    ...(org.services || []).map((service) => ({
      label: service,
      type: "service",
    })),
  ];

  const publicProfileNotice = !isVerified
    ? notice(
        "warn",
        "This facility is not currently verified by the platform. Do not rely on its information as a confirmed service listing."
      )
    : isDemo
      ? notice(
          "warn",
          "This is an illustrative demo facility. Its location, services and figures are not real operational information."
        )
      : notice(
          "info",
          "Facility information and bed figures are provider-reported. Contact the facility to confirm current services and availability."
        );

  return h(
    "div",
    { class: "stack" },

    h(
      "header",
      { class: "page-head" },

      h(
        "div",
        {},

        h("h1", {}, org.name),

        h(
          "p",
          { class: "sub" },
          `${typeLabel(org)} · ${org.district || "District not listed"}`,
          org.mandal ? ` · ${org.mandal}` : ""
        ),

        h(
          "div",
          {
            class: "cluster",
            style: { marginTop: ".4rem" },
          },
          provBadge(provenanceLabel),
          org.emergency24x7
            ? h(
                "span",
                { class: "badge danger" },
                icon("siren", 12),
                "24×7 emergency service reported"
              )
            : null
        )
      ),

      h(
        "div",
        { class: "actions" },

        isVerified && !isDemo && org.kind === "hospital"
          ? btn(
              t("common.book", "Book appointment"),
              needLogin(() => ctx.go(`book/${org.id}`)),
              "primary",
              "calendar"
            )
          : null,

        isVerified && !isDemo && org.kind === "hospital"
          ? btn(
              "Request admission",
              needLogin(() => ctx.go(`admit/${org.id}`)),
              "",
              "bed"
            )
          : null,

        h(
          "a",
          {
            class: "btn",
            href: directionsUrl(org),
            target: "_blank",
            rel: "noopener noreferrer",
          },
          icon("navi", 16),
          t("common.directions", "Directions")
        )
      )
    ),

    publicProfileNotice,

    notice(
      "warn",
      "Emergency? Call 108 or 112, or go directly to the nearest emergency department. Online requests are not emergency dispatch and must never delay urgent care."
    ),

    h(
      "div",
      { class: "split even" },

      card(
        { title: "Contact & hours" },

        kv([
          ["Address", org.address],
          [
            "Phone",
            org.phone
              ? h(
                  "a",
                  {
                    href:
                      "tel:" +
                      String(org.phone).replace(/[^\d+]/g, ""),
                  },
                  org.phone
                )
              : "—",
          ],
          ["Emergency phone", org.emergencyPhone || "—"],
          ["Operating hours", org.hours || "Not listed"],
          ["PIN code", org.pin || "—"],
          ["Mandal", org.mandal || "—"],
        ])
      ),

      card(
        { title: "Location" },
        org.lat && org.lng
          ? mapEl
          : empty("No map location has been provided.")
      )
    ),

    card(
      {
        title: "Bed availability",
        sub: "Reported by the hospital. An admission request does not reserve a bed.",
        actions: provBadge(provenanceLabel, bedTotals(org).updatedAt),
      },

      beds.length
        ? table(
            [
              {
                h: "Category",
                f: (row) => row.label,
              },
              {
                h: "Total",
                f: (row) => row.total,
              },
              {
                h: "Occupied",
                f: (row) => row.occupied,
              },
              {
                h: "Unavailable",
                f: (row) => row.unavailable || 0,
              },
              {
                h: "Available",
                f: (row) => h("strong", {}, row.available),
              },
              {
                h: "Updated",
                f: (row) => ago(row.updatedAt),
              },
            ],
            beds,
            { label: "Provider-reported bed availability" }
          )
        : empty(
            isDemo
              ? "Demo facilities do not provide real bed availability."
              : "This facility has not published verified bed information."
          )
    ),

    card(
      { title: "Departments & services" },

      services.length
        ? h(
            "div",
            { class: "cluster" },
            services.map((service) =>
              h(
                "span",
                {
                  class:
                    "badge " +
                    (service.type === "department" ? "info" : ""),
                },
                service.label
              )
            )
          )
        : empty("No departments or services have been listed.")
    ),

    card(
      { title: "Doctors" },

      doctors.length
        ? h(
            "div",
            { class: "list" },
            doctors.map((doctor) =>
              h(
                "div",
                { class: "row" },

                h(
                  "div",
                  { class: "grow" },

                  h("div", { class: "title" }, doctor.name),

                  h(
                    "div",
                    { class: "small muted" },
                    `${doctor.spec || "Specialization not listed"} · ${
                      (doctor.languages || []).join(", ") ||
                      "Languages not listed"
                    }`
                  )
                ),

                isVerified && !isDemo
                  ? btn(
                      t("common.book", "Book appointment"),
                      needLogin(() =>
                        ctx.go(`book/${org.id}/${doctor.id}`)
                      ),
                      "sm primary"
                    )
                  : null
              )
            )
          )
        : empty("No doctors are listed for this facility.")
    ),

    org.tests?.length
      ? card(
          { title: "Diagnostic services" },

          h(
            "div",
            { class: "list" },

            org.tests
              .filter((test) => test.available)
              .map((test) =>
                h(
                  "div",
                  { class: "row" },

                  h(
                    "div",
                    { class: "grow" },

                    h("div", { class: "title" }, test.name),

                    h(
                      "div",
                      { class: "small muted" },
                      `${test.category || "Test"} · ₹${test.price} · report ${test.tat || "time not listed"}`,
                      test.fasting ? " · fasting required" : ""
                    )
                  ),

                  isVerified && !isDemo
                    ? btn(
                        "Book test",
                        needLogin(() =>
                          ctx.go(`booktest/${org.id}/${test.code}`)
                        ),
                        "sm"
                      )
                    : null
                )
              )
          )
        )
      : null,

    h(
      "p",
      { class: "small muted" },
      "Information shown here may change. Confirm operating hours, services, appointment arrangements and availability directly with the facility."
    )
  );
}
