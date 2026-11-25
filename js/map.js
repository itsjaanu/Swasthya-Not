// Interactive map using Leaflet and OpenStreetMap, with an offline schematic fallback.
import { h, clear } from "./util.js";
import { DISTRICTS } from "./seed.js";

export const KIND_STYLE = {
  govt_hospital: ["#0b6b5c", "H"],
  private_hospital: ["#1d4ed8", "H"],
  chc: ["#0e7490", "C"],
  phc: ["#4d7c0f", "P"],
  other: ["#64748b", "H"],
  diagnostic: ["#7c3aed", "D"],
  pharmacy: ["#be185d", "Rx"],
  ambulance: ["#c2410c", "A"],
  camp: ["#b45309", "⛺"],
  public: ["#64748b", "•"],
  me: ["#111827", "●"]
};

let leafletPromise = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!navigator.onLine) {
      reject(new Error("offline"));
      return;
    }

    const css = h("link", {
      rel: "stylesheet",
      href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      integrity: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
      crossorigin: ""
    });

    const script = h("script", {
      src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
      integrity: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
      crossorigin: ""
    });

    const timeout = setTimeout(
      () => reject(new Error("timeout")),
      6000
    );

    script.onload = () => {
      clearTimeout(timeout);

      if (window.L) resolve(window.L);
      else reject(new Error("Leaflet unavailable"));
    };

    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Leaflet failed to load"));
    };

    document.head.append(css, script);
  }).catch(error => {
    leafletPromise = null;
    throw error;
  });

  return leafletPromise;
}

export function createMap(
  container,
  {
    center = { lat: 16.0, lng: 80.2 },
    zoom = 7,
    onSelect,
    height = "420px"
  } = {}
) {
  container.classList.add("map-box");
  container.style.height = height;

  let implementation = null;
  let markers = [];
  let selected = null;
  let me = null;
  let view = { center, zoom };
  let destroyed = false;

  const api = {
    setMarkers(list) {
      markers = Array.isArray(list) ? list : [];
      implementation?.draw();
    },

    setMe(position) {
      me = position;
      implementation?.draw();
    },

    focus(lat, lng, nextZoom = 12) {
      view = {
        center: { lat, lng },
        zoom: nextZoom
      };

      implementation?.focus();
    },

    select(id) {
      selected = id;
      implementation?.draw();
    },

    fit() {
      implementation?.fit();
    },

    get mode() {
      return implementation?.mode;
    },

    destroy() {
      destroyed = true;
      implementation?.destroy?.();
    }
  };

  function fallback(reason) {
    clear(container);

    const width = 640;
    const height = 520;

    const bounds = {
      north: 19.95,
      south: 12.4,
      west: 76.5,
      east: 84.9
    };

    const project = (lat, lng) => [
      ((lng - bounds.west) /
        (bounds.east - bounds.west)) * width,

      ((bounds.north - lat) /
        (bounds.north - bounds.south)) * height
    ];

    const namespace = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(namespace, "svg");

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "fallback-map");
    svg.setAttribute("role", "group");
    svg.setAttribute(
      "aria-label",
      "Schematic map of Andhra Pradesh"
    );

    const note = h(
      "div",
      { class: "map-note" },
      "Schematic map (street map unavailable " +
        (reason === "offline" ? "offline" : "right now") +
        "). Distances are still accurate."
    );

    container.append(svg, note);

    const make = (name, attributes) => {
      const element = document.createElementNS(
        namespace,
        name
      );

      for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
      }

      return element;
    };

    let viewport = {
      x: 0,
      y: 0,
      w: width,
      h: height
    };

    const applyViewport = () => {
      svg.setAttribute(
        "viewBox",
        `${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`
      );
    };

    const draw = () => {
      clear(svg);

      for (let latitude = 13; latitude <= 19; latitude++) {
        const [, y] = project(latitude, 80);

        svg.append(
          make("line", {
            x1: 0,
            x2: width,
            y1: y,
            y2: y,
            class: "grid"
          })
        );
      }

      for (let longitude = 77; longitude <= 84; longitude++) {
        const [x] = project(16, longitude);

        svg.append(
          make("line", {
            x1: x,
            x2: x,
            y1: 0,
            y2: height,
            class: "grid"
          })
        );
      }

      DISTRICTS.forEach(district => {
        const [x, y] = project(
          district.lat,
          district.lng
        );

        svg.append(
          make("circle", {
            cx: x,
            cy: y,
            r: 2.5,
            class: "dist"
          })
        );

        const label = make("text", {
          x: x + 5,
          y: y + 3,
          class: "dist-l"
        });

        label.textContent = district.name
          .replace("Dr. B.R. Ambedkar ", "")
          .replace("Sri Potti Sriramulu ", "")
          .replace("Y.S.R. ", "")
          .slice(0, 14);

        svg.append(label);
      });

      markers.forEach(marker => {
        const [x, y] = project(
          marker.lat,
          marker.lng
        );

        const [color, glyph] =
          KIND_STYLE[marker.kind] || KIND_STYLE.other;

        const isSelected = selected === marker.id;

        const group = make("g", {
          class: "pin" + (isSelected ? " sel" : ""),
          tabindex: 0,
          role: "button",
          "aria-label": marker.title,
          transform: `translate(${x},${y})`
        });

        group.append(
          make("circle", {
            r: isSelected ? 11 : 8,
            fill: color,
            stroke: "#fff",
            "stroke-width": 2
          })
        );

        const text = make("text", {
          "text-anchor": "middle",
          y: 3.5,
          class: "pin-g"
        });

        text.textContent = glyph;
        group.append(text);

        const title = make("title", {});
        title.textContent = marker.title;
        group.append(title);

        const pick = () => {
          selected = marker.id;
          onSelect?.(marker);
          draw();
        };

        group.addEventListener("click", pick);

        group.addEventListener("keydown", event => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            pick();
          }
        });

        svg.append(group);
      });

      if (me) {
        const [x, y] = project(me.lat, me.lng);

        svg.append(
          make("circle", {
            cx: x,
            cy: y,
            r: 6,
            class: "me"
          })
        );
      }
    };

    const focus = () => {
      const [x, y] = project(
        view.center.lat,
        view.center.lng
      );

      const scale = Math.max(
        0.18,
        Math.min(
          1,
          1 / Math.pow(2, (view.zoom - 7) * 0.7)
        )
      );

      viewport = {
        w: width * scale,
        h: height * scale,
        x: Math.max(
          0,
          Math.min(
            width - width * scale,
            x - width * scale / 2
          )
        ),
        y: Math.max(
          0,
          Math.min(
            height - height * scale,
            y - height * scale / 2
          )
        )
      };

      applyViewport();
    };

    const fit = () => {
      if (!markers.length) {
        viewport = {
          x: 0,
          y: 0,
          w: width,
          h: height
        };

        applyViewport();
        return;
      }

      const positions = markers.map(marker =>
        project(marker.lat, marker.lng)
      );

      const xs = positions.map(position => position[0]);
      const ys = positions.map(position => position[1]);

      const padding = 40;

      let w = Math.max(
        120,
        Math.max(...xs) - Math.min(...xs) + padding * 2
      );

      let h = Math.max(
        95,
        Math.max(...ys) - Math.min(...ys) + padding * 2
      );

      const ratio = width / height;

      if (w / h < ratio) {
        w = h * ratio;
      } else {
        h = w / ratio;
      }

      viewport = {
        x: Math.max(
          0,
          (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2
        ),
        y: Math.max(
          0,
          (Math.min(...ys) + Math.max(...ys)) / 2 - h / 2
        ),
        w: Math.min(w, width),
        h: Math.min(h, height)
      };

      applyViewport();
    };

    implementation = {
      mode: "schematic",
      draw,
      focus,
      fit,
      destroy() {}
    };

    draw();
    focus();
  }

  function useLeaflet(L) {
    clear(container);

    const map = L.map(container, {
      scrollWheelZoom: false
    }).setView(
      [view.center.lat, view.center.lng],
      view.zoom
    );

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors"
      }
    ).addTo(map);

    const layer = L.layerGroup().addTo(map);
    let meLayer = null;

    const draw = () => {
      layer.clearLayers();

      markers.forEach(marker => {
        const [color, glyph] =
          KIND_STYLE[marker.kind] || KIND_STYLE.other;

        const selectedClass =
          selected === marker.id ? "sel" : "";

        const icon = L.divIcon({
          className: "",
          html:
            `<div class="lf-pin ${selectedClass}" ` +
            `style="background:${color}">${glyph}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        L.marker(
          [marker.lat, marker.lng],
          {
            icon,
            title: marker.title,
            keyboard: true
          }
        )
          .on("click", () => {
            selected = marker.id;
            onSelect?.(marker);
            draw();
          })
          .addTo(layer);
      });

      if (meLayer) {
        meLayer.remove();
        meLayer = null;
      }

      if (me) {
        meLayer = L.circleMarker(
          [me.lat, me.lng],
          {
            radius: 8,
            color: "#fff",
            weight: 3,
            fillColor: "#111827",
            fillOpacity: 1
          }
        ).addTo(map);
      }
    };

    implementation = {
      mode: "street",
      draw,

      focus() {
        map.setView(
          [view.center.lat, view.center.lng],
          view.zoom
        );
      },

      fit() {
        if (markers.length) {
          map.fitBounds(
            markers.map(marker => [
              marker.lat,
              marker.lng
            ]),
            {
              padding: [30, 30],
              maxZoom: 13
            }
          );
        }
      },

      destroy() {
        map.remove();
      }
    };

    setTimeout(() => map.invalidateSize(), 80);
    draw();
  }

  loadLeaflet()
    .then(L => {
      if (!destroyed) useLeaflet(L);
    })
    .catch(error => {
      if (!destroyed) {
        fallback(
          error.message === "offline"
            ? "offline"
            : "unavailable"
        );
      }
    });

  return api;
}

export const directionsUrl = (to, from) =>
  from
    ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.lat}%2C${from.lng}%3B${to.lat}%2C${to.lng}`
    : `https://www.openstreetmap.org/?mlat=${to.lat}&mlon=${to.lng}#map=15/${to.lat}/${to.lng}`;

export const googleDirectionsUrl = to =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error("This device does not support location.")
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },

      error => {
        reject(
          new Error(
            error.code === 1
              ? "Location permission was denied. Choose a district instead."
              : "Could not get your location."
          )
        );
      },

      {
        timeout: 8000,
        maximumAge: 300000
      }
    );
  });
}
