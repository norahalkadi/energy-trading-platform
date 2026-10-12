CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  meter_id VARCHAR(20) NOT NULL DEFAULT '',
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
);

CREATE TABLE readings (
  id SERIAL PRIMARY KEY,
  meter_id VARCHAR(20) NOT NULL,
  energy_generated NUMERIC(6,2) NOT NULL,
  energy_consumed NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE listings (
  id SERIAL PRIMARY KEY,
  meter_id VARCHAR(20) NOT NULL,
  energy_available NUMERIC(6,2) NOT NULL,
  price_per_kwh NUMERIC(6,2) NOT NULL DEFAULT 0.30,
  status VARCHAR(20) NOT NULL DEFAULT 'available', -- available / sold / cancelled
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);


CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  listing_id INT NOT NULL,
  seller_meter_id VARCHAR(20) NOT NULL,
  buyer_meter_id VARCHAR(20) NOT NULL,
  energy_kwh NUMERIC(6,2) NOT NULL,
  price_per_kwh NUMERIC(6,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notifications. recipient_role = 'admin' -> shown to every admin
-- (e.g. "new user signed up"). recipient_role = 'user' -> shown only
-- to that one user, matched by recipient_meter_id.
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  recipient_role VARCHAR(10) NOT NULL,
  recipient_meter_id VARCHAR(20) NULL,
  message VARCHAR(255) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- default admin login: admin@example.com / admin123
INSERT INTO users (name, email, password, role, meter_id, verification_status)
VALUES ('Admin', 'admin@example.com', '$2b$10$2AYBAJFZjAKGS/rEMsM2seVRBRkVfRirgzNe/aG3FNf1gGPEstFYW', 'admin', 'ADMIN', 'verified');
