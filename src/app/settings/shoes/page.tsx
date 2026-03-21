"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Section } from "@/components/cards";
import UiSelect from "@/components/ui-select";

type Shoe = {
  id: string;
  name: string;
  brand: string;
  startKm: number;
  targetKm: number;
  isDefault: boolean;
  usedKm: number;
  totalKm: number;
  remainingKm: number;
};

const brandsMock: Shoe["brand"][] = ["ADIDAS", "ASICS", "ALTRA", "Li Ning"];

export default function SettingsShoesPage() {
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    name: "",
    brand: "ASICS" as Shoe["brand"],
    startKm: "",
    targetKm: "700",
    isDefault: false
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    brand: "ASICS" as Shoe["brand"],
    startKm: "",
    targetKm: "700",
    isDefault: false
  });
  const [brands, setBrands] = useState<Shoe["brand"][]>(brandsMock);
  const [newBrand, setNewBrand] = useState("");

  async function loadShoes() {
    const worksheet = await fetch("/api/shoes").then((r) => r.json());
    setShoes((worksheet.shoes ?? []) as Shoe[]);
    const brandRes = await fetch("/api/shoes/brands").then((r) => r.json()).catch(() => ({ brands: brandsMock }));
    setBrands((brandRes.brands ?? brandsMock) as Shoe["brand"][]);
  }

  useEffect(() => {
    void loadShoes();
  }, []);

  async function createShoe() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      brand: form.brand,
      startKm: form.startKm ? Number(form.startKm) : 0,
      targetKm: Number(form.targetKm),
      isDefault: form.isDefault
    };
    const res = await fetch("/api/shoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      setStatus("שמירת נעל נכשלה.");
      return;
    }
    setForm({ name: "", brand: "ASICS", startKm: "", targetKm: "700", isDefault: false });
    setStatus("הנעל נוספה.");
    await loadShoes();
  }

  async function setDefault(shoeId: string) {
    const res = await fetch("/api/shoes/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId })
    });
    if (!res.ok) {
      setStatus("עדכון ברירת מחדל נכשל.");
      return;
    }
    setStatus("ברירת המחדל עודכנה.");
    await loadShoes();
  }

  function startEdit(shoe: Shoe) {
    setEditingId(shoe.id);
    setEditForm({
      name: shoe.name,
      brand: shoe.brand,
      startKm: String(shoe.startKm),
      targetKm: String(shoe.targetKm),
      isDefault: shoe.isDefault
    });
  }

  async function saveEdit() {
    if (!editingId || !editForm.name.trim()) return;
    const res = await fetch("/api/shoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        name: editForm.name.trim(),
        brand: editForm.brand,
        startKm: Number(editForm.startKm || "0"),
        targetKm: Number(editForm.targetKm || "700"),
        isDefault: editForm.isDefault
      })
    });
    if (!res.ok) {
      setStatus("עדכון נעל נכשל.");
      return;
    }
    setStatus("פרטי הנעל עודכנו.");
    setEditingId(null);
    await loadShoes();
  }

  async function addBrand() {
    if (!newBrand.trim()) return;
    const res = await fetch("/api/shoes/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newBrand.trim() })
    });
    if (!res.ok) {
      setStatus("הוספת החברה נכשלה.");
      return;
    }
    const payload = await res.json();
    setBrands((prev) => (prev.includes(payload.brand) ? prev : [...prev, payload.brand]));
    setNewBrand("");
    setStatus("חברה נוספה.");
  }

  return (
    <>
      <header className="page-header">
        <h1>נעלי ריצה</h1>
        <p>ניהול זוגות, ברירת מחדל ומעקב ק״מ.</p>
      </header>

      <Section title="הוספת זוג נעליים" subtitle="ברירת מחדל תתווסף אוטומטית לריצות חדשות">
        <div className="row">
          <label className="field">
            שם הנעל
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="למשל Superblast 2" />
          </label>
          <label className="field">
            חברה
            <UiSelect
              value={form.brand}
              onChange={(nextValue) => setForm((p) => ({ ...p, brand: nextValue as Shoe["brand"] }))}
              options={brands.map((brand) => ({ value: brand, label: brand }))}
            />
          </label>
          <label className="field">
            ק"מ שכבר רצת בהן
            <input type="number" min={0} value={form.startKm} onChange={(e) => setForm((p) => ({ ...p, startKm: e.target.value }))} />
          </label>
          <label className="field">
            יעד ק"מ לזוג
            <input type="number" min={1} value={form.targetKm} onChange={(e) => setForm((p) => ({ ...p, targetKm: e.target.value }))} />
          </label>
        </div>
        <div className="row">
          <button className={form.isDefault ? "choice-btn selected" : "choice-btn"} onClick={() => setForm((p) => ({ ...p, isDefault: !p.isDefault }))}>
            {form.isDefault ? "תוגדר כברירת מחדל" : "הגדר כברירת מחדל"}
          </button>
          <button onClick={createShoe}>הוסף נעל</button>
          <div className="brand-row">
            <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="הוסף חברת נעליים" />
            <button onClick={addBrand}>הוסף חברה</button>
          </div>
          <Link href="/settings" className="inline-cta-link subtle-link">
            חזרה להגדרות
          </Link>
          {status && <p className="note">{status}</p>}
        </div>
      </Section>

      <Section title="הזוגות במערכת" subtitle="מרחק מצטבר מול היעד שהוגדר">
        <ul className="list">
          {shoes.map((shoe) => (
            <li key={shoe.id} className="metric-row">
              {editingId === shoe.id ? (
                <div className="shoe-edit-grid">
                  <label className="field">
                    שם
                    <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                  </label>
                  <label className="field">
                    חברה
                    <UiSelect
                      value={editForm.brand}
                      onChange={(nextValue) => setEditForm((p) => ({ ...p, brand: nextValue as Shoe["brand"] }))}
                      options={brands.map((brand) => ({ value: brand, label: brand }))}
                    />
                  </label>
                  <label className="field">
                    ק"מ התחלתי
                    <input type="number" min={0} value={editForm.startKm} onChange={(e) => setEditForm((p) => ({ ...p, startKm: e.target.value }))} />
                  </label>
                  <label className="field">
                    יעד ק"מ
                    <input type="number" min={1} value={editForm.targetKm} onChange={(e) => setEditForm((p) => ({ ...p, targetKm: e.target.value }))} />
                  </label>
                  <div className="row">
                    <button className={editForm.isDefault ? "choice-btn selected" : "choice-btn"} onClick={() => setEditForm((p) => ({ ...p, isDefault: !p.isDefault }))}>
                      {editForm.isDefault ? "ברירת מחדל" : "הגדר כברירת מחדל"}
                    </button>
                    <button onClick={saveEdit}>שמור</button>
                    <button className="choice-btn" onClick={() => setEditingId(null)}>
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>
                      {shoe.name} · {shoe.brand}
                    </strong>
                    <p className="note">
                      מצטבר: {shoe.totalKm.toFixed(1)} ק"מ · יעד: {shoe.targetKm.toFixed(1)} ק"מ · נותר: {shoe.remainingKm.toFixed(1)} ק"מ
                    </p>
                  </div>
                  <div className="row">
                    <button className="choice-btn" onClick={() => startEdit(shoe)}>
                      עריכה
                    </button>
                    {shoe.isDefault ? (
                      <span className="status-pill">ברירת מחדל</span>
                    ) : (
                      <button className="choice-btn" onClick={() => setDefault(shoe.id)}>
                        קבע כברירת מחדל
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
          {shoes.length === 0 && <li>אין נעליים עדיין. הוסף זוג ראשון.</li>}
        </ul>
      </Section>
    </>
  );
}
