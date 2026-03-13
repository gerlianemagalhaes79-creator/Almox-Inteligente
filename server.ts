import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";

const db = new Database("inventory.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 5,
    expiry_date TEXT,
    origin TEXT DEFAULT 'extra',
    unit_price REAL DEFAULT 0,
    supplier TEXT,
    category TEXT,
    batch_number TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    type TEXT CHECK(type IN ('entry', 'exit')),
    quantity INTEGER,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES items(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/items", (req, res) => {
    // Migration: ensure columns exist
    try {
      db.prepare("ALTER TABLE items ADD COLUMN origin TEXT DEFAULT 'extra'").run();
    } catch (e) {}
    try {
      db.prepare("ALTER TABLE items ADD COLUMN unit_price REAL DEFAULT 0").run();
    } catch (e) {}
    try {
      db.prepare("ALTER TABLE items ADD COLUMN supplier TEXT").run();
    } catch (e) {}
    try {
      db.prepare("ALTER TABLE items ADD COLUMN category TEXT").run();
    } catch (e) {}
    try {
      db.prepare("ALTER TABLE items ADD COLUMN batch_number TEXT").run();
    } catch (e) {}

    const items = db.prepare("SELECT * FROM items").all();
    res.json(items);
  });

  app.post("/api/items", (req, res) => {
    const { name, description, min_quantity, expiry_date, origin, unit_price, supplier, category, batch_number } = req.body;
    const info = db.prepare(
      "INSERT INTO items (name, description, min_quantity, expiry_date, origin, unit_price, supplier, category, batch_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(name, description, min_quantity || 5, expiry_date, origin || 'extra', unit_price || 0, supplier, category, batch_number);
    res.json({ id: info.lastInsertRowid });
  });

  app.put("/api/items/:id", (req, res) => {
    const { name, description, min_quantity, expiry_date, origin, unit_price, supplier, category, batch_number } = req.body;
    db.prepare(
      "UPDATE items SET name = ?, description = ?, min_quantity = ?, expiry_date = ?, origin = ?, unit_price = ?, supplier = ?, category = ?, batch_number = ? WHERE id = ?"
    ).run(name, description, min_quantity, expiry_date, origin, unit_price, supplier, category, batch_number, req.params.id);
    res.json({ success: true });
  });

  app.post("/api/transactions", (req, res) => {
    const { item_id, type, quantity } = req.body;
    
    const dbTransaction = db.transaction(() => {
      // Record transaction
      db.prepare("INSERT INTO transactions (item_id, type, quantity) VALUES (?, ?, ?)").run(
        item_id,
        type,
        quantity
      );

      // Update item quantity
      const adjustment = type === 'entry' ? quantity : -quantity;
      db.prepare("UPDATE items SET quantity = quantity + ? WHERE id = ?").run(
        adjustment,
        item_id
      );
    });

    try {
      dbTransaction();
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/transactions", (req, res) => {
    const transactions = db.prepare(`
      SELECT t.*, i.name as item_name 
      FROM transactions t 
      JOIN items i ON t.item_id = i.id 
      ORDER BY t.date DESC
    `).all();
    res.json(transactions);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
