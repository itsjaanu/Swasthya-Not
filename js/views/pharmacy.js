// Pharmacy workspace: stock, patient enquiries, patient-sent prescriptions, reports.
import { h, icon, ago, fmtDate, sum } from "../util.js";
import { db, audit, notify, notifyRole } from "../db.js";
import { MEDICINES } from "../seed.js";
import { provenance } from "../services.js";
import {
  card, stat, grid, table, form, modal, toast, badge, provBadge,
  statusBadge, pageHead, empty, notice, btn, barChart, kv
} from "../ui.js";
import { t } from "../i18n.js";

const mk = rows =>
  Object.fromEntries(rows.map(([k, te, hi, ta]) => [k, { te, hi, ta }]));

export const strings = mk([
  ["ph.nav.enquiries", "మందుల విచారణలు", "दवा पूछताछ", "மருந்து விசாரணைகள்"],
  ["ph.nav.rx", "ప్రిస్క్రిప్షన్లు", "प्रिस्क्रिप्शन", "மருந்துச் சீட்டுகள்"],
  ["ph.nav.reports", "నివేదికలు", "रिपोर्ट", "அறிக்கைகள்"],
  ["ph.nav.profile", "ప్రొఫైల్", "प्रोफ़ाइल", "சுயவிவரம்"],
  ["ph.title.overview", "ఫార్మసీ సారాంశం", "फ़ार्मेसी अवलोकन", "மருந்தக கண்ணோட்டம்"],
  ["ph.title.stock", "మందుల స్టాక్", "दवा स्टॉक", "மருந்து இருப்பு"],
  ["ph.title.enquiries", "రోగుల విచారణలు", "मरीज़ों की पूछताछ", "நோயாளி விசாரணைகள்"],
  ["ph.title.rx", "రోగులు పంపిన ప్రిస్క్రిప్షన్లు", "मरीज़ द्वारा भेजे प्रिस्क्रिप्शन", "நோயாளி அனுப்பிய மருந்துச் சீட்டுகள்"],
  ["ph.title.reports", "స్టాక్ నివేదిక", "स्टॉक रिपोर्ट", "இருப்பு அறிக்கை"],
  ["ph.title.profile", "ఫార్మసీ ప్రొఫైల్", "फ़ार्मेसी प्रोफ़ाइल", "மருந்தக சுயவிவரம்"],
  ["ph.addMed", "మందును జోడించండి", "दवा जोड़ें", "மருந்தைச் சேர்"],
  ["ph.update", "నవీకరించండి", "अपडेट", "புதுப்பி"],
  ["ph.respond", "స్పందించండి", "जवाब दें", "பதிலளி"],
  ["ph.review", "సమీక్షించండి", "समीक्षा करें", "மதிப்பாய்வு"],
  ["ph.csv", "CSV ఎగుమతి", "CSV निर्यात", "CSV ஏற்றுமதி"],
  ["ph.lowStock", "తక్కువ స్టాక్", "कम स्टॉक", "குறைந்த இருப்பு"],
  ["ph.rxRequired", "ప్రిస్క్రిప్షన్ అవసరం", "प्रिस्क्रिप्शन आवश्यक", "மருந்துச் சீட்டு தேவை"],
  ["ph.search", "మందు పేరుతో వెతకండి", "दवा के नाम से खोजें", "மருந்து பெயரால் தேடு"]
]);

export const nav = [
  { id: "overview", icon: "home", key: "nav.overview", label: "Overview" },
  { id: "stock", icon: "pill", key: "nav.stock", label: "Stock" },
  { id: "enquiries", icon: "chat", key: "ph.nav.enquiries", label: "Enquiries" },
  { id: "prescriptions", icon: "file", key: "ph.nav.rx", label: "Prescriptions" },
  { id: "reports", icon: "chart", key: "ph.nav.reports", label: "Reports" },
  { id: "profile", icon: "building", key: "ph.nav.profile", label: "Profile" }
];

export const css = `
.ph-low{background:var(--warn-bg)}
.ph-qty{width:84px;min-height:34px;padding:.25rem .4rem}
.ph-rx{white-space:pre-wrap;background:var(--muted-bg);border-radius:8px;padding:.6rem .8rem;font-size:.9rem}
`;

const org = user => db.get("orgs", user.orgId);
const stockOf = pharmacy => db.where("stock", item => item.orgId === pharmacy.id);
const isLow = item => item.qty <= (item.reorder ?? 0);

const SCH = {
  OTC: ["OTC", "muted"],
  H: ["Schedule H · prescription required", "warn"],
  H1: ["Schedule H1 · prescription required", "danger"]
};

const schBadge = schedule =>
  badge(SCH[schedule]?.[0] || schedule, SCH[schedule]?.[1] || "muted");

const findStock = (pharmacy, name) => {
  const key = (name || "").toLowerCase();
  const stock = stockOf(pharmacy);

  return stock.find(item => item.name.toLowerCase() === key) ||
    stock.find(item =>
      (item.generic || "").toLowerCase() &&
      (
        key.includes(item.generic.toLowerCase()) ||
        item.name.toLowerCase().includes(key.split(" ")[0])
      )
    );
};

function download(name, rows) {
  const csv = rows
    .map(row =>
      row.map(value =>
        `"${String(value ?? "").replace(/"/g, '""')}"`
      ).join(",")
    )
    .join("\n");

  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" })
  );

  const anchor = h("a", { href: url, download: name });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function guard(pharmacy) {
  return !pharmacy
    ? notice("danger", "No pharmacy is linked to this account. Contact the administrator.")
    : null;
}

const verifyNote = pharmacy =>
  pharmacy.verification !== "verified"
    ? notice(
        "warn",
        h("strong", {}, "Pharmacy not verified yet. "),
        "You can prepare your catalogue, but patients cannot see this pharmacy until the administrator verifies your licence."
      )
    : null;

// -----------------------------------------------------------------------------
// Overview
async function overview(ctx) {
  const pharmacy = org(ctx.user);
  if (guard(pharmacy)) return guard(pharmacy);

  const stock = stockOf(pharmacy);
  const low = stock.filter(isLow);
  const enquiries = db.where(
    "enquiries",
    item => item.orgId === pharmacy.id && item.status === "open"
  );
  const prescriptions = db.where(
    "rxRequests",
    item =>
      item.orgId === pharmacy.id &&
      ["requested", "verified"].includes(item.status)
  );

  const last = stock.map(item => item.updatedAt).sort().pop();

  return h(
    "div",
    {},
    pageHead(
      t("ph.title.overview", "Pharmacy overview"),
      pharmacy.name,
      provBadge(provenance(pharmacy, last), last),
      statusBadge(pharmacy.verification)
    ),
    verifyNote(pharmacy),
    grid(
      4,
      stat("Medicines listed", stock.length, `${stock.filter(item => item.qty > 0).length} in stock`),
      stat(
        t("ph.lowStock", "Low stock"),
        low.length,
        "At or below reorder level",
        low.length ? "warn" : "ok"
      ),
      stat("Open enquiries", enquiries.length, "Waiting for a reply", enquiries.length ? "warn" : ""),
      stat("Prescriptions to handle", prescriptions.length, "Sent by patients", prescriptions.length ? "warn" : "")
    ),
    h(
      "div",
      { class: "split", style: { marginTop: "1rem" } },
      card(
        {
          title: t("ph.lowStock", "Low stock"),
          sub: "Reorder soon",
          actions: btn("Open stock", () => ctx.go("stock"), "sm")
        },
        low.length
          ? h(
              "div",
              { class: "list" },
              low.slice(0, 8).map(item =>
                h(
                  "div",
                  { class: "row ph-low" },
                  h(
                    "div",
                    { class: "grow" },
                    h("div", { class: "title" }, item.name),
                    h(
                      "small",
                      { class: "muted" },
                      `${item.qty} left · reorder at ${item.reorder} · updated ${ago(item.updatedAt)}`
                    )
                  ),
                  schBadge(item.schedule)
                )
              )
            )
          : empty("No low-stock medicines.")
      ),
      card(
        { title: "Waiting for you" },
        h(
          "div",
          { class: "list" },
          h(
            "div",
            { class: "row" },
            h(
              "div",
              { class: "grow" },
              h("div", { class: "title" }, `${enquiries.length} patient enquiries`),
              h("small", { class: "muted" }, "Availability questions")
            ),
            btn("Reply", () => ctx.go("enquiries"), "sm")
          ),
          h(
            "div",
            { class: "row" },
            h(
              "div",
              { class: "grow" },
              h("div", { class: "title" }, `${prescriptions.length} prescriptions`),
              h("small", { class: "muted" }, "Only prescriptions patients sent to this pharmacy appear")
            ),
            btn(t("ph.review", "Review"), () => ctx.go("prescriptions"), "sm")
          )
        )
      )
    )
  );
}

// -----------------------------------------------------------------------------
// Stock
async function stockView(ctx) {
  const pharmacy = org(ctx.user);
  if (guard(pharmacy)) return guard(pharmacy);

  const search = h("input", {
    type: "search",
    placeholder: t("ph.search", "Search by medicine name"),
    "aria-label": "Search medicines"
  });

  const box = h("div", {});

  const draw = () => {
    const key = search.value.trim().toLowerCase();

    const rows = stockOf(pharmacy)
      .filter(item =>
        !key ||
        item.name.toLowerCase().includes(key) ||
        (item.generic || "").toLowerCase().includes(key)
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    box.replaceChildren(
      table(
        [
          {
            h: "Medicine",
            f: item =>
              h(
                "div",
                {},
                h("strong", {}, item.name),
                h("div", { class: "small muted" }, `${item.generic || "Generic not entered"} · ${item.form}`)
              )
          },
          { h: "Schedule", f: item => schBadge(item.schedule) },
          {
            h: "Quantity",
            f: item => {
              const input = h("input", {
                class: "ph-qty",
                type: "number",
                min: 0,
                step: 1,
                value: item.qty,
                "aria-label": `Quantity of ${item.name}`
              });

              const update = btn(
                t("ph.update", "Update"),
                () => {
                  const quantity = Number(input.value);

                  if (!Number.isInteger(quantity) || quantity < 0) {
                    return toast("Enter a whole number, 0 or more.", "danger");
                  }

                  db.update("stock", item.id, {
                    qty: quantity,
                    updatedAt: new Date().toISOString()
                  });

                  audit("stock.updated", item.name, `qty ${quantity}`);
                  toast("Stock updated");
                  ctx.refresh();
                },
                "sm"
              );

              return h("div", { class: "cluster" }, input, update);
            }
          },
          {
            h: "Reorder at",
            f: item =>
              h(
                "span",
                {},
                item.reorder,
                isLow(item)
                  ? h("span", { style: { marginLeft: ".4rem" } }, badge("Low", "warn"))
                  : null
              )
          },
          { h: "Price (₹)", f: item => item.price },
          { h: "Updated", f: item => ago(item.updatedAt) },
          {
            h: "",
            f: item => btn("Edit", () => editMed(ctx, pharmacy, item), "sm ghost")
          }
        ],
        rows,
        {
          empty: "No medicines match. Add one to start your catalogue.",
          label: "Medicine stock"
        }
      )
    );
  };

  search.addEventListener("input", draw);
  draw();

  return h(
    "div",
    {},
    pageHead(
      t("ph.title.stock", "Medicine stock"),
      "Keep quantities current — patients see the last-updated time.",
      btn(t("ph.csv", "Export CSV"), () => exportStock(pharmacy), "", "download"),
      btn(t("ph.addMed", "Add medicine"), () => editMed(ctx, pharmacy), "primary", "plus")
    ),
    verifyNote(pharmacy),
    notice(
      "info",
      "Schedule H and H1 medicines are shown as ",
      h("strong", {}, "prescription required"),
      ". This platform does not dispense them without a prescription the patient has sent you."
    ),
    h("div", { class: "filters" }, h("div", { class: "field" }, search)),
    box
  );
}

function exportStock(pharmacy) {
  download(
    `stock-${pharmacy.name.replace(/\W+/g, "-")}.csv`,
    [
      ["Medicine", "Generic", "Form", "Schedule", "Quantity", "Reorder level", "Price", "Updated"],
      ...stockOf(pharmacy).map(item => [
        item.name,
        item.generic,
        item.form,
        item.schedule,
        item.qty,
        item.reorder,
        item.price,
        item.updatedAt
      ])
    ]
  );
}

function editMed(ctx, pharmacy, item) {
  const presets = [
    { value: "", label: "Custom medicine" },
    ...MEDICINES.map(medicine => ({
      value: medicine.name,
      label: medicine.name
    }))
  ];

  modal(
    item ? "Edit " + item.name : t("ph.addMed", "Add medicine"),
    close =>
      form(
        [
          ...(item
            ? []
            : [{
                name: "preset",
                label: "Choose from catalogue",
                type: "select",
                options: presets,
                placeholder: "Custom medicine",
                wide: true
              }]),
          {
            name: "name",
            label: "Medicine name & strength",
            required: true,
            value: item?.name
          },
          {
            name: "generic",
            label: "Generic name",
            required: true,
            value: item?.generic
          },
          {
            name: "form",
            label: "Form",
            type: "select",
            options: ["Tablet", "Capsule", "Syrup", "Injection", "Inhaler", "Sachet", "Ointment", "Drops", "Other"],
            required: true,
            value: item?.form || "Tablet"
          },
          {
            name: "schedule",
            label: "Schedule",
            type: "select",
            options: [
              { value: "OTC", label: "OTC (no prescription)" },
              { value: "H", label: "Schedule H" },
              { value: "H1", label: "Schedule H1" }
            ],
            required: true,
            value: item?.schedule || "OTC"
          },
          {
            name: "qty",
            label: "Quantity in stock",
            type: "number",
            min: 0,
            required: true,
            value: item?.qty ?? 0
          },
          {
            name: "reorder",
            label: "Reorder level",
            type: "number",
            min: 0,
            required: true,
            value: item?.reorder ?? 25
          },
          {
            name: "price",
            label: "Price per unit (₹)",
            type: "number",
            min: 0,
            step: "0.01",
            required: true,
            value: item?.price ?? 0
          }
        ],
        {
          submitLabel: t("common.save", "Save"),
          onCancel: close,
          onInput: (values, elements) => {
            if (!item && values.preset && elements.name.dataset.last !== values.preset) {
              const medicine = MEDICINES.find(m => m.name === values.preset);
              if (!medicine) return;

              elements.name.dataset.last = values.preset;
              elements.name.value = medicine.name;
              elements.generic.value = medicine.generic;
              elements.form.value = medicine.form;
              elements.schedule.value = medicine.schedule;
              elements.price.value = medicine.price;
            }
          },
          onSubmit: values => {
            if (!values.name.trim()) {
              throw new Error("Enter the medicine name.");
            }

            if (!values.generic.trim()) {
              throw new Error("Enter the generic name.");
            }

            if (
              !Number.isInteger(values.qty) ||
              values.qty < 0 ||
              !Number.isInteger(values.reorder) ||
              values.reorder < 0
            ) {
              throw new Error("Quantity and reorder level must be whole numbers, 0 or more.");
            }

            if (!Number.isFinite(values.price) || values.price < 0) {
              throw new Error("Enter a valid price.");
            }

            const row = {
              name: values.name.trim(),
              generic: values.generic.trim(),
              form: values.form,
              schedule: values.schedule,
              qty: values.qty,
              reorder: values.reorder,
              price: values.price,
              updatedAt: new Date().toISOString()
            };

            if (item) {
              db.update("stock", item.id, row);
            } else {
              if (
                stockOf(pharmacy).some(
                  existing => existing.name.toLowerCase() === row.name.toLowerCase()
                )
              ) {
                throw new Error("This medicine is already in your stock list. Edit it instead.");
              }

              db.insert("stock", {
                orgId: pharmacy.id,
                demo: !!pharmacy.demo,
                ...row
              });
            }

            audit(
              item ? "stock.edited" : "stock.added",
              row.name,
              `qty ${row.qty}`
            );

            toast("Saved");
            close();
            ctx.refresh();
          }
        }
      )
  );
}

// -----------------------------------------------------------------------------
// Patient enquiries
async function enquiries(ctx) {
  const pharmacy = org(ctx.user);
  if (guard(pharmacy)) return guard(pharmacy);

  const list = db.where("enquiries", item => item.orgId === pharmacy.id);

  return h(
    "div",
    {},
    pageHead(
      t("ph.title.enquiries", "Patient enquiries"),
      "Tell patients whether a medicine is available. Do not promise stock you do not have."
    ),
    card(
      {},
      table(
        [
          {
            h: "Patient",
            f: item => db.get("users", item.patientId)?.name || "Patient"
          },
          {
            h: "Medicine",
            f: item =>
              h(
                "div",
                {},
                h("strong", {}, item.medicine),
                h("div", { class: "small muted" }, `Qty ${item.qty || "—"}`)
              )
          },
          {
            h: "In your stock",
            f: item => {
              const stock = findStock(pharmacy, item.medicine);

              return stock
                ? h(
                    "span",
                    {},
                    `${stock.qty} · `,
                    provBadge(provenance(pharmacy, stock.updatedAt), stock.updatedAt)
                  )
                : badge("Not listed", "muted");
            }
          },
          {
            h: "Status",
            f: item =>
              statusBadge(
                item.status === "open"
                  ? "requested"
                  : item.status === "available"
                    ? "confirmed"
                    : item.status === "unavailable"
                      ? "rejected"
                      : item.status === "reserved"
                        ? "accepted"
                        : "completed"
              )
          },
          { h: "Note", f: item => item.note || "—" },
          { h: "Asked", f: item => ago(item.createdAt) },
          {
            h: "",
            f: item =>
              btn(
                t("ph.respond", "Respond"),
                () => respond(ctx, pharmacy, item),
                "sm primary"
              )
          }
        ],
        list,
        { empty: "No enquiries yet. Patients can ask about medicines from your listing." }
      )
    )
  );
}

function respond(ctx, pharmacy, enquiry) {
  modal(
    "Reply about " + enquiry.medicine,
    close =>
      form(
        [
          {
            name: "status",
            label: "Availability",
            type: "select",
            required: true,
            value: enquiry.status === "open" ? "available" : enquiry.status,
            options: [
              { value: "available", label: "Available — patient can collect" },
              { value: "reserved", label: "Reserved for the patient" },
              { value: "unavailable", label: "Not available" },
              { value: "fulfilled", label: "Fulfilled / collected" }
            ]
          },
          {
            name: "note",
            label: "Note to the patient",
            type: "textarea",
            wide: true,
            hint: "For example: collection hours; prescription needed (Schedule H).",
            value: enquiry.note
          }
        ],
        {
          submitLabel: "Send reply",
          onCancel: close,
          onSubmit: values => {
            const stock = findStock(pharmacy, enquiry.medicine);

            if (
              ["available", "reserved"].includes(values.status) &&
              (!stock || stock.qty <= 0)
            ) {
              throw new Error("This medicine shows no stock in your list. Update stock first or choose “Not available”.");
            }

            db.update("enquiries", enquiry.id, {
              status: values.status,
              note: values.note.trim(),
              respondedAt: new Date().toISOString()
            });

            audit("enquiry.responded", enquiry.medicine, values.status);

            notify(enquiry.patientId, {
              title: `${pharmacy.name}: ${enquiry.medicine}`,
              body:
                `${values.status === "unavailable"
                  ? "Not available"
                  : values.status === "fulfilled"
                    ? "Fulfilled"
                    : values.status === "reserved"
                      ? "Reserved for you"
                      : "Available"}` +
                (values.note ? " — " + values.note : ""),
              link: "#/app/medicines",
              type: "pharmacy",
              channels: ["inapp", "sms"]
            });

            toast("Reply sent");
            close();
            ctx.refresh();
          }
        }
      )
  );
}

// -----------------------------------------------------------------------------
// Patient-sent prescriptions
const rxItems = request =>
  request.items?.length
    ? request.items
    : db.get("records", request.rxId)?.rx?.items || [];

async function prescriptions(ctx) {
  const pharmacy = org(ctx.user);
  if (guard(pharmacy)) return guard(pharmacy);

  // Only requests explicitly addressed to this pharmacy are displayed.
  const list = db.where(
    "rxRequests",
    request => request.orgId === pharmacy.id
  );

  return h(
    "div",
    {},
    pageHead(
      t("ph.title.rx", "Prescriptions sent to you"),
      "You can only see prescriptions a patient chose to send to this pharmacy."
    ),
    notice(
      "warn",
      "Check the prescriber, patient and dates before dispensing. Schedule H1 items need an explicit verification tick."
    ),
    card(
      {},
      table(
        [
          {
            h: "Patient",
            f: request => db.get("users", request.patientId)?.name || "Patient"
          },
          {
            h: "Items",
            f: request => rxItems(request).map(item => item.name).join(", ") || "—"
          },
          { h: "Sent", f: request => ago(request.createdAt) },
          {
            h: "Status",
            f: request =>
              statusBadge(
                request.status === "ready"
                  ? "confirmed"
                  : request.status === "dispensed"
                    ? "completed"
                    : request.status === "verified"
                      ? "accepted"
                      : request.status
              )
          },
          {
            h: "",
            f: request =>
              btn(
                t("ph.review", "Review"),
                () => reviewRx(ctx, pharmacy, request),
                "sm primary"
              )
          }
        ],
        list,
        { empty: "No prescriptions yet." }
      )
    )
  );
}

function reviewRx(ctx, pharmacy, request) {
  const record = db.get("records", request.rxId);
  const items = rxItems(request);
  const done = ["dispensed", "rejected"].includes(request.status);

  const matches = items.map(item => ({
    item,
    stock: findStock(pharmacy, item.name)
  }));

  const needsH1 = matches.some(match => match.stock?.schedule === "H1");

  modal(
    "Prescription review",
    close =>
      h(
        "div",
        {},
        kv([
          ["Patient", db.get("users", request.patientId)?.name],
          ["Prescription", record?.title || "Record not available"],
          ["Date", record ? fmtDate(record.date) : "—"],
          ["Status", statusBadge(request.status)]
        ]),
        record
          ? h(
              "div",
              {
                class: "ph-rx",
                style: { margin: ".8rem 0" }
              },
              record.content
            )
          : notice(
              "danger",
              "The prescription record is no longer available. Do not dispense."
            ),
        h("h3", { style: { margin: ".6rem 0" } }, "Check against your stock"),
        table(
          [
            {
              h: "Item",
              f: match =>
                h(
                  "div",
                  {},
                  h("strong", {}, match.item.name),
                  h(
                    "div",
                    { class: "small muted" },
                    `${match.item.dose || ""} ${match.item.days ? "× " + match.item.days + " days" : ""}`
                  )
                )
            },
            {
              h: "Your stock",
              f: match =>
                match.stock
                  ? h(
                      "span",
                      {},
                      `${match.stock.qty} `,
                      schBadge(match.stock.schedule)
                    )
                  : badge("Not stocked", "danger")
            }
          ],
          matches,
          { empty: "No items on this prescription." }
        ),
        done
          ? notice(
              "info",
              `This request is ${request.status}.${request.pharmacistNote ? " Note: " + request.pharmacistNote : ""}`
            )
          : form(
              [
                {
                  name: "status",
                  label: "Update status",
                  type: "select",
                  required: true,
                  options: [
                    { value: "verified", label: "Verified — prescription looks valid" },
                    { value: "ready", label: "Ready for collection" },
                    { value: "dispensed", label: "Dispensed (reduces stock)" },
                    { value: "rejected", label: "Reject — cannot dispense" }
                  ],
                  value: request.status === "requested" ? "verified" : request.status
                },
                ...matches
                  .filter(match => match.stock)
                  .map((match, index) => ({
                    name: "q" + index,
                    label: `Units dispensed: ${match.stock.name}`,
                    type: "number",
                    min: 0,
                    step: 1,
                    value: 1,
                    show: values => values.status === "dispensed"
                  })),
                ...(needsH1
                  ? [{
                      name: "h1",
                      label: "I have verified this is a valid prescription for Schedule H1 medicine(s)",
                      type: "checkbox",
                      show: values => values.status !== "rejected"
                    }]
                  : []),
                {
                  name: "note",
                  label: "Note for the patient",
                  type: "textarea",
                  wide: true
                }
              ],
              {
                submitLabel: "Save status",
                onCancel: close,
                onSubmit: values => {
                  if (!record && values.status !== "rejected") {
                    throw new Error("The prescription record is missing, so you can only reject this request.");
                  }

                  if (needsH1 && values.status !== "rejected" && !values.h1) {
                    throw new Error("Tick the Schedule H1 verification before continuing.");
                  }

                  if (values.status === "rejected" && !values.note.trim()) {
                    throw new Error("Give the patient a reason for rejecting.");
                  }

                  if (values.status === "dispensed") {
                    if (matches.some(match => !match.stock)) {
                      throw new Error("One or more prescribed items are not in your stock list. Resolve every item before recording dispensing.");
                    }

                    matches.forEach((match, index) => {
                      const quantity = values["q" + index] ?? 0;

                      if (!Number.isInteger(quantity) || quantity < 0) {
                        throw new Error("Units must be whole numbers.");
                      }

                      if (quantity > match.stock.qty) {
                        throw new Error(`Only ${match.stock.qty} of ${match.stock.name} in stock.`);
                      }
                    });

                    matches.forEach((match, index) => {
                      const quantity = values["q" + index] || 0;

                      if (quantity) {
                        db.update("stock", match.stock.id, {
                          qty: match.stock.qty - quantity,
                          updatedAt: new Date().toISOString()
                        });
                      }
                    });
                  }

                  db.update("rxRequests", request.id, {
                    status: values.status,
                    pharmacistNote: values.note.trim(),
                    updatedAt: new Date().toISOString(),
                    items
                  });

                  audit(
                    "rx." + values.status,
                    record?.title || request.rxId,
                    `${db.get("users", request.patientId)?.name} @ ${pharmacy.name}${values.status === "dispensed" ? " — stock reduced" : ""}`
                  );

                  notify(request.patientId, {
                    title: `Prescription ${values.status === "ready" ? "ready for collection" : values.status}`,
                    body: `${pharmacy.name}${values.note ? " — " + values.note : ""}`,
                    link: "#/app/medicines",
                    type: "pharmacy",
                    channels: ["inapp", "sms"]
                  });

                  toast("Status saved");
                  close();
                  ctx.refresh();
                }
              }
            )
      ),
    { wide: true }
  );
}

// -----------------------------------------------------------------------------
// Reports
async function reports(ctx) {
  const pharmacy = org(ctx.user);
  if (guard(pharmacy)) return guard(pharmacy);

  const stock = stockOf(pharmacy);
  const out = stock.filter(item => item.qty === 0);
  const low = stock.filter(item => item.qty > 0 && isLow(item));
  const ok = stock.filter(item => item.qty > item.reorder);
  const prescriptions = db.where(
    "rxRequests",
    request => request.orgId === pharmacy.id
  );

  const value = sum(stock, item => item.qty * item.price);
  const near = stock.filter(isLow).sort((a, b) => a.qty - b.qty);

  return h(
    "div",
    {},
    pageHead(
      t("ph.title.reports", "Stock report"),
      `As of ${fmtDate(new Date(), true)}`,
      btn(
        t("ph.csv", "Export CSV"),
        () => exportStock(pharmacy),
        "primary",
        "download"
      )
    ),
    grid(
      4,
      stat("Medicines", stock.length),
      stat("In stock", ok.length, "Above reorder level", "ok"),
      stat(t("ph.lowStock", "Low stock"), low.length, "", low.length ? "warn" : ""),
      stat("Out of stock", out.length, "", out.length ? "danger" : "")
    ),
    h(
      "div",
      { class: "split even", style: { marginTop: "1rem" } },
      card(
        { title: "Stock by status" },
        barChart(
          [
            { label: "In stock", value: ok.length, tone: "ok" },
            { label: "Low", value: low.length, tone: "warn" },
            { label: "Out of stock", value: out.length, tone: "danger" }
          ],
          { max: Math.max(1, stock.length) }
        )
      ),
      card(
        { title: "Value and activity" },
        kv([
          ["Estimated stock value", "₹" + Math.round(value).toLocaleString("en-IN")],
          ["Prescriptions received", prescriptions.length],
          ["Dispensed", prescriptions.filter(item => item.status === "dispensed").length],
          ["Rejected", prescriptions.filter(item => item.status === "rejected").length],
          [
            "Enquiries answered",
            db.where(
              "enquiries",
              item => item.orgId === pharmacy.id && item.status !== "open"
            ).length
          ]
        ])
      )
    ),
    card(
      { title: "Near stock-out", sub: "Lowest first" },
      table(
        [
          { h: "Medicine", f: item => item.name },
          { h: "Left", f: item => item.qty },
          { h: "Reorder at", f: item => item.reorder },
          { h: "Updated", f: item => ago(item.updatedAt) }
        ],
        near,
        { empty: "Nothing is near stock-out." }
      )
    )
  );
}

// -----------------------------------------------------------------------------
// Profile
async function profile(ctx) {
  const pharmacy = org(ctx.user);
  if (guard(pharmacy)) return guard(pharmacy);

  return h(
    "div",
    {},
    pageHead(
      t("ph.title.profile", "Pharmacy profile"),
      pharmacy.name,
      statusBadge(pharmacy.verification),
      pharmacy.demo ? provBadge("demo") : null
    ),
    h(
      "div",
      { class: "split even" },
      card(
        { title: "Details" },
        kv([
          ["Name", pharmacy.name],
          ["District", pharmacy.district],
          ["Address", pharmacy.address],
          ["PIN", pharmacy.pin],
          ["Licence no.", pharmacy.licenceNo || "—"],
          ["Phone", pharmacy.phone],
          ["Hours", pharmacy.hours || "—"],
          [
            "Location",
            pharmacy.lat ? `${pharmacy.lat}, ${pharmacy.lng}` : "Not set"
          ]
        ])
      ),
      card(
        { title: "Update details" },
        form(
          [
            { name: "phone", label: "Phone", value: pharmacy.phone },
            { name: "hours", label: "Opening hours", value: pharmacy.hours },
            { name: "address", label: "Address", value: pharmacy.address, wide: true },
            {
              name: "pin",
              label: "PIN code",
              value: pharmacy.pin,
              pattern: "[0-9]{6}",
              hint: "6 digits"
            },
            {
              name: "licenceNo",
              label: "Drug licence number",
              value: pharmacy.licenceNo
            }
          ],
          {
            onSubmit: values => {
              if (values.pin && !/^\d{6}$/.test(values.pin)) {
                throw new Error("PIN code must be 6 digits.");
              }

              db.update("orgs", pharmacy.id, values);
              audit("pharmacy.profile", pharmacy.name, "");
              toast("Profile saved");
              ctx.refresh();
            }
          }
        )
      )
    )
  );
}

export const routes = {
  overview,
  stock: stockView,
  enquiries,
  prescriptions,
  reports,
  profile
};
