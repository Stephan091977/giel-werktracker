import { useState, useEffect } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, setDoc, getDocs
} from "firebase/firestore";
import { db } from "./firebase";

const DEFAULT_TASKS = [
  "Grasmaaien",
  "Schoffelen & snoeien",
  "Ramen lappen",
  "Auto wassen",
  "Vakantie service (planten/vissen/post)",
  "Stofzuigen",
  "Houtwerk schoonmaken",
  "Rolemmers schoonmaken",
  "Boodschappen doen",
  "Koken",
  "Afwassen",
  "Heg snoeien",
  "Tuin opruimen",
  "Schuur opruimen",
  "Sneeuw ruimen",
  "Anders...",
];

// Taken met een vast bedrag in plaats van uurtarief
const FIXED_PRICE_TASKS = {
  "Koken": [2.50, 5.00],
};

const COLORS = ["#2a7a2e", "#1a5fa8", "#e07b3c", "#8a6fb5", "#b85c8a", "#c0953a"];
const GREEN = "#2a7a2e";
const BLUE = "#1a5fa8";
const LIGHTBLUE = "#e8f4fb";
const LIGHTGREEN = "#e8f5e9";

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function formatEuro(amount) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

export default function App() {
  const [clients, setClients] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("logboek");
  const [form, setForm] = useState({
    clientId: "", date: new Date().toISOString().slice(0, 10),
    task: DEFAULT_TASKS[0], customTask: "", hours: "", minutes: "0", notes: "", fixedPrice: "",
  });
  const [newClient, setNewClient] = useState({ name: "", rate: "8.50", color: COLORS[3], whatsapp: "" });
  const [editClientId, setEditClientId] = useState(null);
  const [editRate, setEditRate] = useState("");
  const [filter, setFilter] = useState("all");
  const [showSuccess, setShowSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceClient, setInvoiceClient] = useState(null);
  const [invoiceEntries, setInvoiceEntries] = useState([]);
  const [invoiceImage, setInvoiceImage] = useState(null);

  // Real-time listener for clients
  useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("name"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClients(data);
    });
    return unsub;
  }, []);

  // Real-time listener for entries
  useEffect(() => {
    const q = query(collection(db, "entries"), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEntries(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const getClient = (id) => clients.find((c) => c.id === id);
  const totalHours = (entry) => parseFloat(entry.hours || 0) + parseFloat(entry.minutes || 0) / 60;
  const entryAmount = (entry, client) => {
    if (entry.fixedAmount != null) return entry.fixedAmount;
    return totalHours(entry) * (client?.rate || 0);
  };

  const isFixedTask = (task) => Object.keys(FIXED_PRICE_TASKS).includes(task);

  const addEntry = async () => {
    const taskName = form.task === "Anders..." ? form.customTask : form.task;
    if (!form.clientId || !form.date) return;
    if (isFixedTask(taskName) && form.fixedPrice === "") return;
    if (!isFixedTask(taskName) && form.hours === "" && (form.minutes === "0" || form.minutes === "")) return;
    setSaving(true);
    await addDoc(collection(db, "entries"), {
      clientId: form.clientId,
      date: form.date,
      task: taskName,
      hours: isFixedTask(taskName) ? 0 : parseFloat(form.hours) || 0,
      minutes: isFixedTask(taskName) ? 0 : parseFloat(form.minutes) || 0,
      fixedAmount: isFixedTask(taskName) ? parseFloat(form.fixedPrice) : null,
      notes: form.notes,
      invoiced: false,
      createdAt: new Date().toISOString(),
    });
    setForm({ ...form, task: DEFAULT_TASKS[0], customTask: "", hours: "", minutes: "0", notes: "", fixedPrice: "" });
    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
  };

  const markInvoiced = async (ids) => {
    await Promise.all(ids.map(id => updateDoc(doc(db, "entries", id), { invoiced: true })));
  };

  const deleteEntry = async (id) => {
    if (window.confirm("Weet je zeker dat je deze werkzaamheid wilt verwijderen?")) {
      await deleteDoc(doc(db, "entries", id));
    }
  };

  const addClient = async () => {
    if (!newClient.name || !newClient.rate) return;
    await addDoc(collection(db, "clients"), {
      name: newClient.name,
      rate: parseFloat(newClient.rate),
      color: newClient.color,
      whatsapp: newClient.whatsapp || "",
    });
    setNewClient({ name: "", rate: "8.50", color: COLORS[(clients.length) % COLORS.length], whatsapp: "" });
  };

  const updateRate = async (id) => {
    await updateDoc(doc(db, "clients", id), { rate: parseFloat(editRate) });
    setEditClientId(null);
  };

  const updateWhatsapp = async (id, number) => {
    await updateDoc(doc(db, "clients", id), { whatsapp: number });
  };

  const generateInvoiceImage = (client, clientEntries) => {
    const total = clientEntries.reduce((s, e) => s + entryAmount(e, client), 0);
    const W = 800;
    const rowH = 52;
    const headerH = 160;
    const footerH = 100;
    const tableHeaderH = 44;
    const paddingRows = 24;
    const H = headerH + tableHeaderH + clientEntries.length * rowH + paddingRows + footerH + 60;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#e8f4fb";
    ctx.fillRect(0, 0, W, H);

    // Header gradient
    const grad = ctx.createLinearGradient(0, 0, W, headerH);
    grad.addColorStop(0, "#2a7a2e");
    grad.addColorStop(1, "#1d5c21");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, headerH);

    // Yellow stripe top
    const stripeGrad = ctx.createLinearGradient(0, 0, W, 0);
    stripeGrad.addColorStop(0, "#f9c832");
    stripeGrad.addColorStop(0.5, "#f97316");
    stripeGrad.addColorStop(1, "#f9c832");
    ctx.fillStyle = stripeGrad;
    ctx.fillRect(0, 0, W, 7);

    // Hat emoji circle
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(72, 88, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f9c832";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.font = "44px serif";
    ctx.textAlign = "center";
    ctx.fillText("🧢", 72, 103);

    // Title
    ctx.fillStyle = "white";
    ctx.font = "bold 36px Arial Black, Arial";
    ctx.textAlign = "left";
    ctx.fillText("Giel pakt aan", 132, 78);

    // Subtitle badge
    ctx.fillStyle = "#1a5fa8";
    ctx.beginPath();
    ctx.roundRect(132, 90, 310, 26, 13);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Jong · Betrouwbaar · Betaalbaar", 146, 108);

    // Invoice label
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "14px Arial";
    ctx.textAlign = "right";
    ctx.fillText("FACTUUROVERZICHT", W - 32, 72);

    // Date
    const now = new Date();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "13px Arial";
    ctx.fillText(now.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }), W - 32, 94);

    // Client name
    ctx.fillStyle = "#f9c832";
    ctx.font = "bold 20px Arial";
    ctx.fillText("Voor: " + client.name, W - 32, 124);

    // Price badge
    ctx.fillStyle = "#f9c832";
    ctx.beginPath();
    ctx.roundRect(W - 160, 130, 128, 34, 8);
    ctx.fill();
    ctx.fillStyle = "#7a4a00";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("€" + Number(client.rate).toFixed(2).replace(".", ",") + " per uur", W - 96, 152);

    // White card body
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.roundRect(20, headerH + 10, W - 40, H - headerH - 30, 14);
    ctx.fill();
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Table header
    const tY = headerH + 10;
    ctx.fillStyle = "#2a7a2e";
    ctx.beginPath();
    ctx.roundRect(20, tY, W - 40, tableHeaderH, [14, 14, 0, 0]);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "left";
    ctx.fillText("DATUM", 44, tY + 27);
    ctx.fillText("WERKZAAMHEID", 190, tY + 27);
    ctx.fillText("TIJD", 490, tY + 27);
    ctx.textAlign = "right";
    ctx.fillText("BEDRAG", W - 44, tY + 27);

    // Rows
    clientEntries.forEach((e, i) => {
      const rY = tY + tableHeaderH + i * rowH;
      ctx.fillStyle = i % 2 === 0 ? "#f9fcf9" : "white";
      ctx.fillRect(20, rY, W - 40, rowH);

      // Left border accent
      ctx.fillStyle = client.color || GREEN;
      ctx.fillRect(20, rY, 5, rowH);

      ctx.fillStyle = "#444";
      ctx.font = "13px Arial";
      ctx.textAlign = "left";

      const d = new Date(e.date);
      ctx.fillText(d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }), 44, rY + 22);
      ctx.font = "bold 13px Arial";
      const taskText = e.task.length > 28 ? e.task.slice(0, 26) + "…" : e.task;
      ctx.fillText(taskText, 190, rY + 22);

      ctx.font = "13px Arial";
      ctx.fillStyle = "#666";
      if (e.notes) {
        const noteText = e.notes.length > 28 ? e.notes.slice(0, 26) + "…" : e.notes;
        ctx.fillText(noteText, 190, rY + 40);
      }

      ctx.fillStyle = "#444";
      const h = Math.floor(e.hours);
      const m = parseInt(e.minutes);
      const tijdStr = e.fixedAmount != null ? "vast bedrag" : (h > 0 ? h + "u " : "") + (m > 0 ? m + "min" : (h === 0 ? "—" : ""));
      ctx.fillText(tijdStr, 490, rY + 22);

      ctx.textAlign = "right";
      ctx.fillStyle = "#2a7a2e";
      ctx.font = "bold 14px Arial";
      ctx.fillText(formatEuro(entryAmount(e, client)), W - 44, rY + 22);
    });

    // Total row
    const totY = tY + tableHeaderH + clientEntries.length * rowH + paddingRows;
    ctx.fillStyle = "#e8f5e9";
    ctx.fillRect(20, totY, W - 40, 52);
    ctx.strokeStyle = "#2a7a2e44";
    ctx.lineWidth = 1;
    ctx.strokeRect(20, totY, W - 40, 52);

    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText("TOTAAL TE BETALEN", 44, totY + 33);

    ctx.fillStyle = "#2a7a2e";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "right";
    ctx.fillText(formatEuro(total), W - 44, totY + 33);

    // Footer
    const fY = totY + 68;
    ctx.fillStyle = "#2a7a2e";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("📞 06-39785053   ✉ gieldeen@outlook.com", W / 2, fY + 18);
    ctx.fillStyle = "#aaa";
    ctx.font = "12px Arial";
    ctx.fillText("Giel pakt aan — Jong, betrouwbaar en betaalbaar", W / 2, fY + 40);

    return canvas.toDataURL("image/png");
  };

  const openInvoice = (client, clientEntries) => {
    const img = generateInvoiceImage(client, clientEntries);
    setInvoiceImage(img);
    setInvoiceClient(client);
    setInvoiceEntries(clientEntries);
  };

  const sendWhatsApp = (client, clientEntries) => {
    const total = clientEntries.reduce((s, e) => s + entryAmount(e, client), 0);
    const regels = clientEntries.map(e => {
      const h = Math.floor(e.hours);
      const m = parseInt(e.minutes);
      const tijd = e.fixedAmount != null ? "vast bedrag" : (h > 0 ? h + "u" : "") + (m > 0 ? " " + m + "min" : "");
      return "• " + formatDate(e.date) + ": " + e.task + " (" + tijd + ") — " + formatEuro(entryAmount(e, client));
    }).join("\n");
    const bericht = 
      "Hoi " + client.name + "! 👋\n\n" +
      "Hier is een overzicht van mijn werkzaamheden:\n\n" +
      regels + "\n\n" +
      "💰 *Totaal te betalen: " + formatEuro(total) + "*\n\n" +
      "Je kunt het bedrag overmaken of ik stuur je zo een Rabobank betaalverzoek.\n\n" +
      "Bedankt! 🧢 Giel";
    const nummer = client.whatsapp.replace(/[^0-9]/g, "").replace(/^0/, "31");
    window.open("https://wa.me/" + nummer + "?text=" + encodeURIComponent(bericht), "_blank");
  };

  const deleteClient = async (id) => {
    if (window.confirm("Klant verwijderen? De werkzaamheden blijven bewaard.")) {
      await deleteDoc(doc(db, "clients", id));
    }
  };

  const uninvoiced = entries.filter((e) => !e.invoiced);
  const invoiced = entries.filter((e) => e.invoiced);

  const byClient = (arr) => {
    const map = {};
    arr.forEach((e) => { if (!map[e.clientId]) map[e.clientId] = []; map[e.clientId].push(e); });
    return map;
  };

  const navItems = [
    { key: "logboek", label: "📝 Logboek" },
    { key: "afrekenen", label: "💶 Afrekenen" },
    { key: "klanten", label: "👥 Klanten" },
    { key: "historie", label: "📋 Historie" },
  ];

  const inp = {
    width: "100%", padding: "10px 12px", border: "2px solid #d0e8d0",
    borderRadius: 9, fontSize: 14, color: "#1a1a1a", background: "#f9fcf9",
    boxSizing: "border-box", outline: "none", fontFamily: "inherit",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: LIGHTBLUE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🧢</div>
          <div style={{ color: GREEN, fontWeight: 700, fontSize: 18 }}>Even laden...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: LIGHTBLUE, fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(150deg, ${GREEN} 0%, #1d5c21 100%)`, paddingBottom: 0, boxShadow: "0 4px 20px #0004" }}>
        <div style={{ height: 5, background: "linear-gradient(90deg, #f9c832, #f97316, #f9c832, #f97316, #f9c832)" }} />
        <div style={{ maxWidth: 740, margin: "0 auto", padding: "16px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 30, boxShadow: "0 3px 12px #0003", border: "3px solid #f9c832", flexShrink: 0,
            }}>🧢</div>
            <div>
              <div style={{
                fontSize: 30, fontWeight: 900, color: "white", letterSpacing: -1, lineHeight: 1,
                textShadow: "1px 2px 4px #0005", fontFamily: "'Arial Black', Arial, sans-serif",
              }}>Giel pakt aan</div>
              <div style={{
                background: BLUE, color: "white", fontSize: 12, fontWeight: 700,
                padding: "3px 14px", borderRadius: 20, display: "inline-block", marginTop: 5, letterSpacing: 0.8,
              }}>Jong · Betrouwbaar · Betaalbaar</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{
                background: "#f9c832", color: "#7a4a00", fontWeight: 900,
                fontSize: 18, padding: "6px 16px", borderRadius: 12,
                boxShadow: "0 2px 8px #f9c83266", lineHeight: 1.2, textAlign: "center",
              }}>€8,50<br /><span style={{ fontSize: 10, fontWeight: 700 }}>per uur</span></div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {navItems.map((n) => (
              <button key={n.key} onClick={() => setView(n.key)} style={{
                background: view === n.key ? "white" : "rgba(255,255,255,0.15)",
                color: view === n.key ? GREEN : "white",
                border: "none", borderRadius: "8px 8px 0 0",
                padding: "9px 16px", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: view === n.key ? 700 : 500, transition: "all 0.15s",
              }}>{n.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "22px 16px" }}>

        {showSuccess && (
          <div style={{
            background: GREEN, color: "white", borderRadius: 12,
            padding: "13px 20px", marginBottom: 18, fontWeight: 700, fontSize: 14,
            display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px #2a7a2e55",
          }}>✅ Geregistreerd! Goed gedaan, Giel! 💪</div>
        )}

        {/* ===== LOGBOEK ===== */}
        {view === "logboek" && (
          <div>
            <Stitle>Werkzaamheid invoeren</Stitle>
            {clients.length === 0 ? (
              <Wcard style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
                <div style={{ fontWeight: 700, color: "#888" }}>Voeg eerst een klant toe via het tabblad "Klanten"</div>
              </Wcard>
            ) : (
              <Wcard>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <Lbl>Bij wie?</Lbl>
                    <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} style={inp}>
                      <option value="">— Kies een klant —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name} (€{Number(c.rate).toFixed(2).replace(".", ",")}/uur)</option>)}
                    </select>
                  </div>
                  <div>
                    <Lbl>Datum</Lbl>
                    <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inp} />
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <Lbl>Wat heb je gedaan?</Lbl>
                  <select value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} style={inp}>
                    {DEFAULT_TASKS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {form.task === "Anders..." && (
                    <input type="text" placeholder="Omschrijf de werkzaamheid..." value={form.customTask}
                      onChange={(e) => setForm({ ...form, customTask: e.target.value })} style={{ ...inp, marginTop: 8 }} />
                  )}
                </div>
                {isFixedTask(form.task) ? (
                  <div style={{ marginTop: 14 }}>
                    <Lbl>Bedrag</Lbl>
                    <select value={form.fixedPrice} onChange={(e) => setForm({ ...form, fixedPrice: e.target.value })} style={inp}>
                      <option value="">— Kies een bedrag —</option>
                      {FIXED_PRICE_TASKS[form.task].map((p) => (
                        <option key={p} value={p}>{formatEuro(p)} (vast bedrag)</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                    <div>
                      <Lbl>Uren</Lbl>
                      <input type="number" min="0" max="24" placeholder="0" value={form.hours}
                        onChange={(e) => setForm({ ...form, hours: e.target.value })} style={inp} />
                    </div>
                    <div>
                      <Lbl>Minuten</Lbl>
                      <select value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} style={inp}>
                        {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {form.clientId && (isFixedTask(form.task) ? form.fixedPrice !== "" : (form.hours !== "" || (form.minutes !== "0" && form.minutes !== ""))) && (
                  <div style={{
                    marginTop: 12, background: LIGHTGREEN, border: `2px solid ${GREEN}55`,
                    borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ color: GREEN, fontWeight: 600, fontSize: 14 }}>💰 Bedrag deze klus:</span>
                    <span style={{ color: GREEN, fontWeight: 900, fontSize: 22 }}>
                      {isFixedTask(form.task)
                        ? formatEuro(parseFloat(form.fixedPrice) || 0)
                        : formatEuro((parseFloat(form.hours || 0) + parseFloat(form.minutes || 0) / 60) * (getClient(form.clientId)?.rate || 0))}
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <Lbl>Notitie (optioneel)</Lbl>
                  <input type="text" placeholder="Extra opmerkingen..." value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inp} />
                </div>
                <Gbtn onClick={addEntry} disabled={!form.clientId || !form.date || (isFixedTask(form.task) ? form.fixedPrice === "" : (form.hours === "" && (form.minutes === "0" || form.minutes === ""))) || saving}
                  style={{ marginTop: 18, width: "100%", fontSize: 16 }}>
                  {saving ? "⏳ Opslaan..." : "✅ Opslaan"}
                </Gbtn>
              </Wcard>
            )}

            {uninvoiced.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Stitle>Nog niet afgerekend</Stitle>
                {uninvoiced.slice(0, 5).map((e) => {
                  const cl = getClient(e.clientId);
                  return <Ecard key={e.id} entry={e} client={cl} amount={entryAmount(e, cl)} onDelete={() => deleteEntry(e.id)} />;
                })}
                {uninvoiced.length > 5 && (
                  <div style={{ textAlign: "center", color: "#888", fontSize: 13, marginTop: 8 }}>
                    + nog {uninvoiced.length - 5} meer — bekijk alles in Historie
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== AFREKENEN ===== */}
        {view === "afrekenen" && (
          <div>
            <Stitle>Openstaande uren</Stitle>
            {uninvoiced.length === 0 ? (
              <Wcard style={{ textAlign: "center", padding: 48 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
                <div style={{ fontWeight: 700, color: GREEN, fontSize: 16 }}>Alles is afgerekend!</div>
                <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>Goed bezig, Giel!</div>
              </Wcard>
            ) : (
              Object.entries(byClient(uninvoiced)).map(([clientId, clientEntries]) => {
                const cl = getClient(clientId);
                const total = clientEntries.reduce((s, e) => s + entryAmount(e, cl), 0);
                return (
                  <div key={clientId} style={{
                    background: "white", borderRadius: 14, marginBottom: 18,
                    overflow: "hidden", boxShadow: "0 3px 16px #0002", border: `1px solid ${cl?.color || GREEN}33`,
                  }}>
                    <div style={{
                      background: `linear-gradient(135deg, ${cl?.color || GREEN}18, ${cl?.color || GREEN}08)`,
                      borderBottom: `4px solid ${cl?.color || GREEN}`,
                      padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 20, color: cl?.color || GREEN }}>{cl?.name || "Onbekend"}</div>
                        <div style={{ fontSize: 12, color: "#999" }}>€{Number(cl?.rate || 0).toFixed(2).replace(".", ",")}/uur · {clientEntries.length} opdracht{clientEntries.length !== 1 ? "en" : ""}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          fontWeight: 900, fontSize: 26, color: GREEN,
                          background: LIGHTGREEN, padding: "6px 16px", borderRadius: 10, border: `2px solid ${GREEN}44`,
                        }}>{formatEuro(total)}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => openInvoice(cl, clientEntries)} style={{
                            background: "#1a5fa8", color: "white",
                            border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          }}>🧾 Factuur</button>
                          <button onClick={() => markInvoiced(clientEntries.map(e => e.id))} style={{
                            background: GREEN, color: "white",
                            border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          }}>✓ Afgerekend!</button>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "6px 0" }}>
                      {clientEntries.map((e) => <Erow key={e.id} entry={e} client={cl} amount={entryAmount(e, cl)} />)}
                    </div>
                  </div>
                );
              })
            )}
            {uninvoiced.length > 0 && (
              <div style={{
                background: `linear-gradient(135deg, ${GREEN}, #1a5c1e)`, borderRadius: 14,
                padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
                boxShadow: "0 4px 16px #2a7a2e44",
              }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>TOTAAL OPENSTAAND</div>
                  <div style={{ color: "white", fontWeight: 900, fontSize: 28 }}>
                    {formatEuro(uninvoiced.reduce((s, e) => { const c = getClient(e.clientId); return s + entryAmount(e, c); }, 0))}
                  </div>
                </div>
                <div style={{ fontSize: 40 }}>💰</div>
              </div>
            )}
          </div>
        )}

        {/* ===== KLANTEN ===== */}
        {view === "klanten" && (
          <div>
            <Stitle>Mijn klanten</Stitle>
            {clients.length === 0 ? (
              <Wcard style={{ textAlign: "center", padding: 32, marginBottom: 20 }}>
                <div style={{ color: "#aaa" }}>Nog geen klanten toegevoegd.</div>
              </Wcard>
            ) : (
              <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
                {clients.map((c) => (
                  <div key={c.id} style={{
                    background: "white", borderRadius: 12, padding: "16px 20px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    border: `2px solid ${c.color}33`, boxShadow: "0 2px 10px #0001",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: "50%",
                        background: `linear-gradient(135deg, ${c.color}, ${c.color}bb)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontWeight: 900, fontSize: 20, boxShadow: `0 3px 8px ${c.color}55`,
                      }}>{c.name[0]}</div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#1a1a1a", fontSize: 16 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "#999" }}>
                          {entries.filter(e => e.clientId === c.id).length} opdracht(en) · {entries.filter(e => e.clientId === c.id && !e.invoiced).length} open
                          {c.whatsapp && <span> · 📱 {c.whatsapp}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {editClientId === c.id ? (
                        <>
                          <input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)}
                            style={{ ...inp, width: 80 }} step="0.50" placeholder="tarief" />
                          <input type="tel" defaultValue={c.whatsapp || ""} id={"wa-" + c.id}
                            style={{ ...inp, width: 120 }} placeholder="06-nummer" />
                          <button onClick={async () => { await updateRate(c.id); await updateWhatsapp(c.id, document.getElementById("wa-" + c.id).value); }} style={{
                            background: GREEN, color: "white", border: "none",
                            borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700,
                          }}>✓</button>
                          <button onClick={() => setEditClientId(null)} style={{
                            background: "#eee", color: "#666", border: "none",
                            borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                          }}>✕</button>
                        </>
                      ) : (
                        <>
                          <div style={{
                            background: LIGHTGREEN, color: GREEN, fontWeight: 800, fontSize: 16,
                            padding: "6px 14px", borderRadius: 10, border: `1px solid ${GREEN}44`,
                          }}>€{Number(c.rate).toFixed(2).replace(".", ",")}/uur</div>
                          <button onClick={() => { setEditClientId(c.id); setEditRate(c.rate); }} style={{
                            background: `${c.color}18`, color: c.color, border: `1px solid ${c.color}44`,
                            borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 14,
                          }}>✏️</button>
                          <button onClick={() => deleteClient(c.id)} style={{
                            background: "#fee", color: "#c33", border: "1px solid #fcc",
                            borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 14,
                          }}>🗑</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Stitle>Nieuwe klant toevoegen</Stitle>
            <Wcard>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <Lbl>Naam</Lbl>
                  <input type="text" placeholder="bv. Opa Jan" value={newClient.name}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} style={inp} />
                </div>
                <div>
                  <Lbl>Uurtarief (€)</Lbl>
                  <input type="number" step="0.50" placeholder="8.50" value={newClient.rate}
                    onChange={(e) => setNewClient({ ...newClient, rate: e.target.value })} style={inp} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Lbl>Kleur</Lbl>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {COLORS.map((col) => (
                    <div key={col} onClick={() => setNewClient({ ...newClient, color: col })} style={{
                      width: 34, height: 34, borderRadius: "50%", background: col, cursor: "pointer",
                      border: newClient.color === col ? "3px solid #111" : "3px solid transparent",
                      boxShadow: newClient.color === col ? `0 0 0 2px white, 0 0 0 4px ${col}` : "none",
                      transition: "all 0.15s",
                    }} />
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Lbl>WhatsApp nummer</Lbl>
                <input type="tel" placeholder="bv. 0612345678" value={newClient.whatsapp}
                  onChange={(e) => setNewClient({ ...newClient, whatsapp: e.target.value })} style={inp} />
              </div>
              <Gbtn onClick={addClient} disabled={!newClient.name || !newClient.rate} style={{ marginTop: 18 }}>
                + Klant toevoegen
              </Gbtn>
            </Wcard>
          </div>
        )}

        {/* ===== HISTORIE ===== */}
        {view === "historie" && (
          <div>
            <Stitle>Overzicht & Historie</Stitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Totaal verdiend", value: formatEuro(entries.reduce((s, e) => { const c = getClient(e.clientId); return s + entryAmount(e, c); }, 0)), icon: "💰", color: GREEN },
                { label: "Al ontvangen", value: formatEuro(invoiced.reduce((s, e) => { const c = getClient(e.clientId); return s + entryAmount(e, c); }, 0)), icon: "✅", color: BLUE },
                { label: "Nog te ontvangen", value: formatEuro(uninvoiced.reduce((s, e) => { const c = getClient(e.clientId); return s + entryAmount(e, c); }, 0)), icon: "⏳", color: "#e07b3c" },
              ].map((stat) => (
                <div key={stat.label} style={{
                  background: "white", borderRadius: 12, padding: "14px 10px",
                  textAlign: "center", boxShadow: "0 2px 10px #0001", border: `2px solid ${stat.color}22`,
                }}>
                  <div style={{ fontSize: 24 }}>{stat.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: stat.color, marginTop: 4 }}>{stat.value}</div>
                  <div style={{ fontSize: 10, color: "#999", marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>{stat.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[{ key: "all", label: "Alles" }, { key: "open", label: "Openstaand" }, { key: "invoiced", label: "Afgerekend" }].map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  background: filter === f.key ? GREEN : "white",
                  color: filter === f.key ? "white" : "#555",
                  border: `2px solid ${filter === f.key ? GREEN : "#ddd"}`,
                  borderRadius: 20, padding: "6px 18px",
                  fontSize: 13, cursor: "pointer", fontWeight: filter === f.key ? 700 : 400,
                }}>{f.label}</button>
              ))}
            </div>
            {entries.length === 0 ? (
              <Wcard style={{ textAlign: "center", padding: 48 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                <div style={{ color: "#aaa" }}>Nog geen werkzaamheden ingevoerd.</div>
              </Wcard>
            ) : (() => {
              const filtered = entries.filter(e => filter === "all" ? true : filter === "open" ? !e.invoiced : e.invoiced);
              if (filtered.length === 0) return <div style={{ color: "#aaa", textAlign: "center", padding: 32 }}>Geen resultaten.</div>;
              return filtered.map((e) => {
                const cl = getClient(e.clientId);
                return <Ecard key={e.id} entry={e} client={cl} amount={entryAmount(e, cl)} onDelete={() => deleteEntry(e.id)} showStatus />;
              });
            })()}
          </div>
        )}
      </div>

      {/* INVOICE MODAL */}
      {invoiceImage && invoiceClient && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", zIndex: 1000,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
          overflowY: "auto", padding: "20px 16px",
        }}>
          <div style={{
            background: "white", borderRadius: 16, overflow: "hidden",
            maxWidth: 600, width: "100%", boxShadow: "0 8px 40px #0006",
          }}>
            {/* Modal header */}
            <div style={{
              background: "linear-gradient(135deg, #2a7a2e, #1d5c21)",
              padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>🧾 Factuuroverzicht — {invoiceClient.name}</div>
              <button onClick={() => setInvoiceImage(null)} style={{
                background: "rgba(255,255,255,0.2)", color: "white", border: "none",
                borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700, fontSize: 14,
              }}>✕</button>
            </div>

            {/* Step indicators */}
            <div style={{ background: "#f9fcf9", borderBottom: "1px solid #e0ede0", padding: "12px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>Zo stuur je de factuur via WhatsApp:</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { step: "1", icon: "💾", text: "Sla de factuur op" },
                  { step: "2", icon: "📱", text: "Open WhatsApp" },
                  { step: "3", icon: "📎", text: "Voeg als bijlage toe" },
                ].map((s) => (
                  <div key={s.step} style={{
                    flex: 1, background: "white", borderRadius: 10, padding: "10px 8px",
                    textAlign: "center", border: "1px solid #d0e8d0",
                  }}>
                    <div style={{ fontSize: 20 }}>{s.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#444", marginTop: 4, lineHeight: 1.3 }}>{s.text}</div>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", background: GREEN,
                      color: "white", fontSize: 11, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "6px auto 0",
                    }}>{s.step}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invoice image with tap hint */}
            <div style={{ padding: 16, background: "#e8f4fb", position: "relative" }}>
              <img src={invoiceImage} alt="Factuur" style={{ width: "100%", borderRadius: 10, boxShadow: "0 2px 12px #0002", display: "block" }} />
              <div style={{
                marginTop: 8, background: "rgba(0,0,0,0.55)", color: "white",
                borderRadius: 8, padding: "7px 12px", fontSize: 12, textAlign: "center", fontWeight: 600,
              }}>
                📲 Op telefoon: houd je vinger op de afbeelding → "Afbeelding opslaan"
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Primary: save image */}
              <a
                href={invoiceImage}
                download={"factuur-" + invoiceClient.name.toLowerCase() + "-" + new Date().toISOString().slice(0,10) + ".png"}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  background: `linear-gradient(135deg, ${GREEN}, #1d6021)`,
                  color: "white", borderRadius: 12, padding: "14px",
                  fontWeight: 700, fontSize: 16, textDecoration: "none",
                  boxShadow: "0 4px 14px #2a7a2e44",
                }}
              >
                <span style={{ fontSize: 22 }}>💾</span>
                <div style={{ textAlign: "left" }}>
                  <div>Factuur opslaan</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>Daarna als bijlage in WhatsApp sturen</div>
                </div>
              </a>

              {/* Secondary: open WhatsApp with text */}
              {invoiceClient.whatsapp && (
                <button onClick={() => sendWhatsApp(invoiceClient, invoiceEntries)} style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  background: "#25D366", color: "white", border: "none",
                  borderRadius: 12, padding: "14px", fontWeight: 700, fontSize: 16, cursor: "pointer",
                  boxShadow: "0 4px 14px #25d36644",
                }}>
                  <span style={{ fontSize: 22 }}>📱</span>
                  <div style={{ textAlign: "left" }}>
                    <div>WhatsApp openen</div>
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9 }}>Tekstoverzicht klaar voor {invoiceClient.name}</div>
                  </div>
                </button>
              )}

              <button onClick={() => setInvoiceImage(null)} style={{
                background: "#f0f0f0", color: "#888", border: "none",
                borderRadius: 12, padding: "12px", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}>Sluiten</button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{ background: `linear-gradient(135deg, ${GREEN}, #1a5c1e)`, padding: "14px 20px", textAlign: "center", marginTop: 20 }}>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
          📞 06-39785053 · ✉️ gieldeen@outlook.com · <strong style={{ color: "white" }}>Giel pakt aan</strong> — Jong, betrouwbaar en betaalbaar
        </div>
      </div>
    </div>
  );
}

function Stitle({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, marginTop: 4 }}>
      <div style={{ width: 5, height: 22, background: GREEN, borderRadius: 4 }} />
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1a1a1a" }}>{children}</h2>
    </div>
  );
}

function Wcard({ children, style = {} }) {
  return (
    <div style={{ background: "white", borderRadius: 14, padding: 22, boxShadow: "0 3px 14px #0002", border: "1px solid #dceedd", ...style }}>
      {children}
    </div>
  );
}

function Lbl({ children }) {
  return <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 5, letterSpacing: 0.5, textTransform: "uppercase" }}>{children}</label>;
}

function Gbtn({ children, onClick, disabled, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? "#ccc" : `linear-gradient(135deg, ${GREEN}, #1d6021)`,
      color: "white", border: "none", borderRadius: 10,
      padding: "12px 22px", fontSize: 14, fontWeight: 700,
      cursor: disabled ? "not-allowed" : "pointer",
      boxShadow: disabled ? "none" : `0 4px 14px ${GREEN}55`,
      transition: "all 0.15s", ...style,
    }}>{children}</button>
  );
}

function Ecard({ entry, client, amount, onDelete, showStatus }) {
  const h = Math.floor(entry.hours);
  const m = parseInt(entry.minutes);
  return (
    <div style={{
      background: "white", borderRadius: 12, padding: "14px 18px", marginBottom: 10,
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      borderLeft: `5px solid ${client?.color || GREEN}`,
      border: `1px solid ${client?.color || GREEN}22`,
      borderLeftWidth: 5,
      boxShadow: "0 2px 10px #0001",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
          <span style={{
            background: `${client?.color || GREEN}18`, color: client?.color || GREEN,
            fontWeight: 700, fontSize: 13, padding: "2px 10px", borderRadius: 20,
            border: `1px solid ${client?.color || GREEN}33`,
          }}>{client?.name || "Onbekend"}</span>
          {showStatus && (entry.invoiced
            ? <span style={{ background: "#e8f5e9", color: GREEN, fontWeight: 700, fontSize: 11, padding: "2px 10px", borderRadius: 20, border: `1px solid ${GREEN}44` }}>✓ Afgerekend</span>
            : <span style={{ background: "#fff8e1", color: "#c0953a", fontWeight: 700, fontSize: 11, padding: "2px 10px", borderRadius: 20, border: "1px solid #c0953a44" }}>⏳ Openstaand</span>
          )}
        </div>
        <div style={{ fontWeight: 700, color: "#1a1a1a", fontSize: 15 }}>{entry.task}</div>
        <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>
          {formatDate(entry.date)} · {h > 0 ? `${h}u` : ""}{m > 0 ? ` ${m}min` : ""}
          {entry.notes && ` · ${entry.notes}`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, marginLeft: 12 }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: GREEN, background: LIGHTGREEN, padding: "4px 12px", borderRadius: 8, border: `1px solid ${GREEN}33` }}>
          {formatEuro(amount)}
        </span>
        <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "#ddd", fontSize: 15 }}>🗑</button>
      </div>
    </div>
  );
}

function Erow({ entry, client, amount }) {
  const h = Math.floor(entry.hours);
  const m = parseInt(entry.minutes);
  return (
    <div style={{ padding: "10px 20px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f0f5f0", fontSize: 14 }}>
      <div>
        <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{entry.task}</span>
        <span style={{ color: "#bbb", marginLeft: 8, fontSize: 12 }}>
          {formatDate(entry.date)} · {h > 0 ? `${h}u` : ""}{m > 0 ? ` ${m}min` : ""}
        </span>
        {entry.notes && <span style={{ color: "#bbb", fontSize: 12 }}> · {entry.notes}</span>}
      </div>
      <span style={{ fontWeight: 700, color: GREEN }}>{formatEuro(amount)}</span>
    </div>
  );
}
