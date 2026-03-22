"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";

type Ingredient = {
  id: string;
  name: string;
  category: string;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  defaultUnit: string;
  gramsPerUnit: number;
  isBuiltIn?: boolean | number;
};

const CATEGORY_LABELS: Record<string, string> = {
  protein: "חלבון",
  carb: "פחמימה",
  fat: "שומן",
  sweet: "מתוק",
  vegetable: "ירק",
  fruit: "פרי",
  dairy: "חלבי",
  hydration: "שתייה",
  mixed: "מעורב"
};

const CATEGORY_COLORS: Record<string, string> = {
  protein: "#72dcff",
  carb: "#fdd848",
  fat: "#fd8b00",
  sweet: "#ff72c8",
  vegetable: "#c3ffcd",
  fruit: "#ff9872",
  dairy: "#d4f0ff",
  hydration: "#72dcff",
  mixed: "#adaaaa"
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

export default function NutritionCatalogPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Ingredient>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState<Partial<Ingredient>>({ category: "protein", defaultUnit: "g", gramsPerUnit: 100 });
  const [adding, setAdding] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/nutrition/ingredient");
      if (res.ok) {
        const json = await res.json();
        setIngredients(json.ingredients ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = ingredients;
    if (categoryFilter !== "all") list = list.filter((i) => i.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [ingredients, search, categoryFilter]);

  function openEdit(ing: Ingredient) {
    setEditId(ing.id);
    setEditDraft({ ...ing });
  }

  function closeEdit() {
    setEditId(null);
    setEditDraft({});
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/nutrition/ingredient/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name,
          category: editDraft.category,
          kcalPer100: Number(editDraft.kcalPer100),
          proteinPer100: Number(editDraft.proteinPer100),
          carbsPer100: Number(editDraft.carbsPer100),
          fatPer100: Number(editDraft.fatPer100),
          defaultUnit: editDraft.defaultUnit,
          gramsPerUnit: Number(editDraft.gramsPerUnit)
        })
      });
      if (res.ok) {
        showToast("נשמר בהצלחה");
        closeEdit();
        await load();
      } else {
        showToast("שגיאה בשמירה");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteIngredient(id: string, name: string) {
    if (!confirm(`למחוק את "${name}" מהקטלוג?`)) return;
    try {
      const res = await fetch(`/api/nutrition/ingredient/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("נמחק בהצלחה");
        closeEdit();
        await load();
      } else {
        showToast("שגיאה במחיקה");
      }
    } catch {
      showToast("שגיאה במחיקה");
    }
  }

  async function addIngredient() {
    if (!addDraft.name?.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/nutrition/ingredient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addDraft.name,
          category: addDraft.category ?? "protein",
          kcalPer100: Number(addDraft.kcalPer100 ?? 0),
          proteinPer100: Number(addDraft.proteinPer100 ?? 0),
          carbsPer100: Number(addDraft.carbsPer100 ?? 0),
          fatPer100: Number(addDraft.fatPer100 ?? 0),
          defaultUnit: addDraft.defaultUnit ?? "g",
          gramsPerUnit: Number(addDraft.gramsPerUnit ?? 100)
        })
      });
      if (res.ok) {
        showToast("נוסף בהצלחה");
        setShowAddForm(false);
        setAddDraft({ category: "protein", defaultUnit: "g", gramsPerUnit: 100 });
        await load();
      } else {
        showToast("שגיאה בהוספה");
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="cat-page">

      {toast && <div className="nutr-toast">{toast}</div>}

      {/* Header */}
      <div className="cat-header">
        <div className="cat-header-top">
          <Link href="/nutrition" className="cat-nav-btn">תזונה ←</Link>
          <Link href="/today" className="cat-nav-btn">הבית ←</Link>
        </div>
        <span className="nutr-session-label">INGREDIENTS CATALOG</span>
        <h1 className="nutr-title">קטלוג מזונות</h1>
        <p className="cat-subtitle">{ingredients.length} מוצרים במערכת</p>
      </div>

      {/* Search */}
      <div className="cat-search-bar">
        <input
          type="search"
          className="cat-search-input"
          placeholder="חפש מזון..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category chips */}
      <div className="cat-chips">
        <button
          className={`cat-chip ${categoryFilter === "all" ? "active" : ""}`}
          onClick={() => setCategoryFilter("all")}
        >
          הכל
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`cat-chip ${categoryFilter === cat ? "active" : ""}`}
            style={categoryFilter === cat ? { borderColor: CATEGORY_COLORS[cat], color: CATEGORY_COLORS[cat] } : {}}
            onClick={() => setCategoryFilter(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Add button */}
      <button className="cat-add-btn" onClick={() => setShowAddForm((v) => !v)}>
        {showAddForm ? "סגור" : "+ הוסף מזון חדש"}
      </button>

      {/* Add form */}
      {showAddForm && (
        <div className="cat-edit-panel">
          <h3 className="cat-edit-title">מזון חדש</h3>
          <IngredientForm draft={addDraft} onChange={setAddDraft} />
          <div className="cat-edit-actions">
            <button className="cat-save-btn" onClick={addIngredient} disabled={adding || !addDraft.name?.trim()}>
              {adding ? "מוסיף..." : "הוסף"}
            </button>
            <button className="cat-cancel-btn" onClick={() => setShowAddForm(false)}>ביטול</button>
          </div>
        </div>
      )}

      {/* Ingredient grid */}
      {loading ? (
        <p className="cat-loading">טוען...</p>
      ) : (
        <>
          {/* Edit/Delete panel (full-width, shown above grid when editing) */}
          {editId && (() => {
            const ing = ingredients.find((i) => i.id === editId);
            if (!ing) return null;
            return (
              <div className="cat-edit-panel">
                <h3 className="cat-edit-title">עריכה: {ing.name}</h3>
                <IngredientForm draft={editDraft} onChange={setEditDraft} />
                <div className="cat-edit-actions">
                  <button className="cat-save-btn" onClick={saveEdit} disabled={saving}>
                    {saving ? "שומר..." : "שמור"}
                  </button>
                  <button className="cat-cancel-btn" onClick={closeEdit}>ביטול</button>
                  <button className="cat-delete-btn" onClick={() => deleteIngredient(ing.id, ing.name)}>
                    🗑 מחק
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="cat-grid">
            {filtered.length === 0 ? (
              <p className="cat-empty">לא נמצאו תוצאות</p>
            ) : (
              filtered.map((ing) => (
                <button
                  key={ing.id}
                  className={`cat-card ${editId === ing.id ? "selected" : ""}`}
                  onClick={() => editId === ing.id ? closeEdit() : openEdit(ing)}
                >
                  <span
                    className="cat-item-cat"
                    style={{ color: CATEGORY_COLORS[ing.category] ?? "#adaaaa" }}
                  >
                    {CATEGORY_LABELS[ing.category] ?? ing.category}
                  </span>
                  <span className="cat-item-name">{ing.name}</span>
                  <span className="cat-card-kcal">{Math.round(ing.kcalPer100)} קל׳</span>
                  <span className="cat-card-macros">
                    <span style={{ color: "#72dcff" }}>{Math.round(ing.proteinPer100)}P</span>
                    <span style={{ color: "#fdd848" }}>{Math.round(ing.carbsPer100)}C</span>
                    <span style={{ color: "#fd8b00" }}>{Math.round(ing.fatPer100)}F</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function IngredientForm({
  draft,
  onChange
}: {
  draft: Partial<Ingredient>;
  onChange: (d: Partial<Ingredient>) => void;
}) {
  const set = (key: keyof Ingredient, val: string | number) => onChange({ ...draft, [key]: val });
  return (
    <div className="cat-form">
      <div className="cat-form-row">
        <label>שם</label>
        <input className="cat-form-input" value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="שם המזון" />
      </div>
      <div className="cat-form-row">
        <label>קטגוריה</label>
        <select className="cat-form-input" value={draft.category ?? "protein"} onChange={(e) => set("category", e.target.value)}>
          {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>
      <div className="cat-form-grid">
        <div className="cat-form-row">
          <label>קל׳ / 100g</label>
          <input className="cat-form-input" type="number" min={0} value={draft.kcalPer100 ?? ""} onChange={(e) => set("kcalPer100", e.target.value)} />
        </div>
        <div className="cat-form-row">
          <label>חלבון / 100g</label>
          <input className="cat-form-input" type="number" min={0} value={draft.proteinPer100 ?? ""} onChange={(e) => set("proteinPer100", e.target.value)} />
        </div>
        <div className="cat-form-row">
          <label>פחמימות / 100g</label>
          <input className="cat-form-input" type="number" min={0} value={draft.carbsPer100 ?? ""} onChange={(e) => set("carbsPer100", e.target.value)} />
        </div>
        <div className="cat-form-row">
          <label>שומן / 100g</label>
          <input className="cat-form-input" type="number" min={0} value={draft.fatPer100 ?? ""} onChange={(e) => set("fatPer100", e.target.value)} />
        </div>
      </div>
      <div className="cat-form-grid">
        <div className="cat-form-row">
          <label>יחידת ברירת מחדל</label>
          <select className="cat-form-input" value={draft.defaultUnit ?? "g"} onChange={(e) => set("defaultUnit", e.target.value)}>
            <option value="g">גרם (g)</option>
            <option value="ml">מ״ל (ml)</option>
            <option value="unit">יחידה</option>
          </select>
        </div>
        <div className="cat-form-row">
          <label>גרם ליחידה</label>
          <input className="cat-form-input" type="number" min={0.1} value={draft.gramsPerUnit ?? ""} onChange={(e) => set("gramsPerUnit", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
