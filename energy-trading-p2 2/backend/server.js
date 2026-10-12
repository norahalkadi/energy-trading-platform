require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const pool = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

// ---------- signup ----------
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users
      (name, email, password, role, meter_id, verification_status)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, "user", "", "pending"],
    );

    const newId = result.insertId;
    const meterId = "M" + String(newId).padStart(3, "0");

    await pool.query("UPDATE users SET meter_id = ? WHERE id = ?", [
      meterId,
      newId,
    ]);

    // Let every admin know a new account needs approval — picked up
    // next time the admin page polls GET /api/notifications.
    await pool.query(
      `INSERT INTO notifications (recipient_role, message)
       VALUES ('admin', ?)`,
      [`New user "${name}" (${email}) signed up and is waiting for approval.`],
    );

    res.json({
      message: "account created, waiting for admin approval",
      meter_id: meterId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "signup failed" });
  }
});

// ---------- login ----------
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    const user = rows[0];

    if (!user) {
      return res.status(400).json({
        message: "invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(400).json({
        message: "invalid email or password",
      });
    }

    if (user.role === "user" && user.verification_status !== "verified") {
      return res.status(403).json({
        message:
          "your account is " +
          user.verification_status +
          ", wait for admin approval",
      });
    }

    res.json({
      id: user.id,
      name: user.name,
      role: user.role,
      meter_id: user.meter_id,
      verification_status: user.verification_status,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "login failed" });
  }
});

// ---------- admin: pending users ----------
app.get("/api/admin/pending", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, meter_id
       FROM users
       WHERE role = 'user'
       AND verification_status = 'pending'`,
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to get pending users" });
  }
});

// ---------- admin: approve ----------
app.post("/api/admin/verify/:id", async (req, res) => {
  try {
    await pool.query(
      `UPDATE users
       SET verification_status = 'verified'
       WHERE id = ?`,
      [req.params.id],
    );

    res.json({ message: "user verified" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to verify user" });
  }
});

// ---------- admin: reject ----------
app.post("/api/admin/reject/:id", async (req, res) => {
  try {
    await pool.query(
      `UPDATE users
       SET verification_status = 'rejected'
       WHERE id = ?`,
      [req.params.id],
    );

    res.json({ message: "user rejected" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to reject user" });
  }
});

// ---------- verified meters ----------
app.get("/api/meters", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT meter_id
       FROM users
       WHERE role = 'user'
       AND verification_status = 'verified'`,
    );

    res.json(rows.map((row) => row.meter_id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to get meters" });
  }
});

// ---------- save reading ----------
app.post("/api/readings", async (req, res) => {
  try {
    const { meter_id, energy_generated, energy_consumed } = req.body;

    const [userRows] = await pool.query(
      "SELECT verification_status FROM users WHERE meter_id = ?",
      [meter_id],
    );

    if (
      userRows.length === 0 ||
      userRows[0].verification_status !== "verified"
    ) {
      return res.status(403).json({
        message: "meter is not verified yet",
      });
    }

    await pool.query(
      `INSERT INTO readings
      (meter_id, energy_generated, energy_consumed)
      VALUES (?, ?, ?)`,
      [meter_id, energy_generated, energy_consumed],
    );

    // Positive = surplus
    // Negative = deficit
    // NOTE: readings no longer auto-create or update a marketplace
    // listing. Surplus is just reported back here — the user decides
    // whether to post it for sale from their dashboard
    // (see POST /api/listings below).
    const netEnergy = energy_generated - energy_consumed;

    res.json({
      message: "reading saved",
      netEnergy: netEnergy,
      status:
        netEnergy > 0 ? "surplus" : netEnergy < 0 ? "deficit" : "balanced",
      amount: Math.abs(netEnergy),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to save reading" });
  }
});

// ---------- latest readings ----------
app.get("/api/readings", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM readings
       ORDER BY created_at DESC
       LIMIT 50`,
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to get readings" });
  }
});

// ---------- marketplace ----------
app.get("/api/marketplace", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM listings
       WHERE status = 'available'
       ORDER BY created_at DESC`,
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to get marketplace" });
  }
});

// ---------- get the logged-in user's own active listing (if any) ----------
app.get("/api/my-listing", async (req, res) => {
  try {
    const { meter_id } = req.query;

    const [rows] = await pool.query(
      `SELECT *
       FROM listings
       WHERE meter_id = ?
       AND status = 'available'
       LIMIT 1`,
      [meter_id],
    );

    res.json(rows[0] || null);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to get listing" });
  }
});

// ---------- user manually posts their surplus for sale ----------
app.post("/api/listings", async (req, res) => {
  try {
    const { meter_id, energy_available, price_per_kwh } = req.body;

    if (!meter_id || !energy_available || !price_per_kwh) {
      return res.status(400).json({ message: "missing fields" });
    }

    if (energy_available <= 0 || price_per_kwh <= 0) {
      return res
        .status(400)
        .json({ message: "amount and price must be greater than 0" });
    }

    // Only one active listing per meter at a time — keeps the demo
    // simple and avoids double-listing the same surplus.
    const [existing] = await pool.query(
      `SELECT id FROM listings WHERE meter_id = ? AND status = 'available'`,
      [meter_id],
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message:
          "you already have an active listing — cancel it before posting a new one",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO listings
      (meter_id, energy_available, price_per_kwh, status)
      VALUES (?, ?, ?, 'available')`,
      [meter_id, energy_available, price_per_kwh],
    );

    res.json({ message: "listing posted", id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to post listing" });
  }
});

// ---------- user cancels their own active listing ----------
app.post("/api/listings/:id/cancel", async (req, res) => {
  try {
    const { meter_id } = req.body;

    const [result] = await pool.query(
      `UPDATE listings
       SET status = 'cancelled'
       WHERE id = ? AND meter_id = ? AND status = 'available'`,
      [req.params.id, meter_id],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "listing not found or not yours" });
    }

    res.json({ message: "listing cancelled" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to cancel listing" });
  }
});

// ---------- buyer purchases a listing ----------
app.post("/api/purchase/:id", async (req, res) => {
  try {
    const { buyer_meter_id } = req.body;

    if (!buyer_meter_id) {
      return res.status(400).json({ message: "missing buyer_meter_id" });
    }

    const [listingRows] = await pool.query(
      `SELECT * FROM listings WHERE id = ? AND status = 'available'`,
      [req.params.id],
    );

    const listing = listingRows[0];

    if (!listing) {
      return res
        .status(404)
        .json({ message: "listing is no longer available" });
    }

    if (listing.meter_id === buyer_meter_id) {
      return res
        .status(400)
        .json({ message: "you cannot buy your own listing" });
    }

    const energyKwh = Number(listing.energy_available);
    const pricePerKwh = Number(listing.price_per_kwh);
    const totalPrice = +(energyKwh * pricePerKwh).toFixed(2);

    await pool.query(
      `INSERT INTO transactions
      (listing_id, seller_meter_id, buyer_meter_id, energy_kwh, price_per_kwh, total_price)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        listing.id,
        listing.meter_id,
        buyer_meter_id,
        energyKwh,
        pricePerKwh,
        totalPrice,
      ],
    );

    await pool.query(`UPDATE listings SET status = 'sold' WHERE id = ?`, [
      listing.id,
    ]);

    res.json({
      message: "purchase complete",
      energy_kwh: energyKwh,
      price_per_kwh: pricePerKwh,
      total_price: totalPrice,
      seller_meter_id: listing.meter_id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to complete purchase" });
  }
});

// ---------- buyer's purchase history ----------
app.get("/api/transactions", async (req, res) => {
  try {
    const { meter_id } = req.query;

    const [rows] = await pool.query(
      `SELECT * FROM transactions
       WHERE buyer_meter_id = ? OR seller_meter_id = ?
       ORDER BY created_at DESC`,
      [meter_id, meter_id],
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to get transactions" });
  }
});

// ---------- full notification history (for the dropdown panel) ----------
// For admin: ?role=admin returns every admin notification (read and
// unread, newest first). For a user: ?role=user&meter_id=M001 returns
// only notifications addressed to that meter. Does NOT mark anything
// read — the red dot on the bell stays on until the user actually
// opens the dropdown (see POST /api/notifications/mark-read below).
app.get("/api/notifications", async (req, res) => {
  try {
    const { role, meter_id } = req.query;

    let rows;

    if (role === "admin") {
      [rows] = await pool.query(
        `SELECT * FROM notifications
         WHERE recipient_role = 'admin'
         ORDER BY created_at DESC
         LIMIT 50`,
      );
    } else {
      [rows] = await pool.query(
        `SELECT * FROM notifications
         WHERE recipient_role = 'user' AND recipient_meter_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
        [meter_id],
      );
    }

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to get notifications" });
  }
});

// ---------- mark all of this recipient's notifications as read ----------
// Called when the user opens the notification dropdown — clears the
// red dot on the bell from then on.
app.post("/api/notifications/mark-read", async (req, res) => {
  try {
    const { role, meter_id } = req.body;

    if (role === "admin") {
      await pool.query(
        `UPDATE notifications SET is_read = TRUE
         WHERE recipient_role = 'admin' AND is_read = FALSE`,
      );
    } else {
      await pool.query(
        `UPDATE notifications SET is_read = TRUE
         WHERE recipient_role = 'user' AND recipient_meter_id = ? AND is_read = FALSE`,
        [meter_id],
      );
    }

    res.json({ message: "notifications marked as read" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "failed to mark notifications as read" });
  }
});

// ---------- server ----------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("server running on port " + PORT);
});
