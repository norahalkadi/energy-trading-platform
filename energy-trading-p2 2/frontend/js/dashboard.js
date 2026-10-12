const user = requireUser();

// Current surplus from the latest reading, kept here so the sell form
// knows how much the user is allowed to list.
let currentSurplus = 0;

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function loadDashboard() {
  try {
    document.getElementById("sidebarAvatar").textContent = initials(user.name);
    document.getElementById("sidebarName").textContent = user.name;
    document.getElementById("sidebarMeter").textContent = user.meter_id;

    const readingsResponse = await fetch(API_URL + "/api/readings");
    const readings = await readingsResponse.json();

    const myReading = readings.find((r) => r.meter_id === user.meter_id);

    if (!myReading) {
      document.getElementById("statProduction").textContent = "0.0 kWh";
      document.getElementById("statConsumption").textContent = "0.0 kWh";
      document.getElementById("statSurplus").textContent = "No reading";
      currentSurplus = 0;
    } else {
      document.getElementById("noDataMessage").classList.add("hidden");

      const production = Number(myReading.energy_generated);
      const consumption = Number(myReading.energy_consumed);
      const netEnergy = production - consumption;

      document.getElementById("statProduction").textContent =
        production.toFixed(1) + " kWh";

      document.getElementById("statConsumption").textContent =
        consumption.toFixed(1) + " kWh";

      if (netEnergy > 0) {
        document.getElementById("statSurplus").textContent =
          netEnergy.toFixed(1) + " kWh Surplus";
      } else if (netEnergy < 0) {
        document.getElementById("statSurplus").textContent =
          Math.abs(netEnergy).toFixed(1) + " kWh Deficit";
      } else {
        document.getElementById("statSurplus").textContent = "0.0 kWh Balanced";
      }

      currentSurplus = netEnergy > 0 ? netEnergy : 0;
    }

    await loadSellSection();
  } catch (error) {
    console.error("Dashboard loading error:", error);

    document.getElementById("statProduction").textContent = "Error";
    document.getElementById("statConsumption").textContent = "Error";
    document.getElementById("statSurplus").textContent = "Error";
  }
}

// ---------- Sell Your Surplus section ----------
// Checks whether the user already has an active listing. If so, shows
// it with a Cancel button. If not, and they currently have surplus,
// shows the "List for Sale" form so THEY decide to post it — nothing
// is listed automatically anymore.
async function loadSellSection() {
  const subtitle = document.getElementById("sellSubtitle");
  const form = document.getElementById("sellForm");
  const activeBox = document.getElementById("activeListingBox");

  try {
    const response = await fetch(
      API_URL + "/api/my-listing?meter_id=" + encodeURIComponent(user.meter_id),
    );
    const listing = await response.json();

    if (listing) {
      // Already have an active listing — show it instead of the form
      form.classList.add("hidden");
      activeBox.classList.remove("hidden");
      subtitle.textContent = "You have one active listing on the marketplace.";

      document.getElementById("activeListingDetails").textContent =
        Number(listing.energy_available).toFixed(1) +
        " kWh at " +
        Number(listing.price_per_kwh).toFixed(2) +
        " SAR/kWh";

      document.getElementById("cancelListingBtn").onclick = async () => {
        await fetch(API_URL + "/api/listings/" + listing.id + "/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meter_id: user.meter_id }),
        });
        loadSellSection();
      };
      return;
    }

    // No active listing
    activeBox.classList.add("hidden");

    if (currentSurplus > 0) {
      form.classList.remove("hidden");
      subtitle.textContent =
        "You currently have " +
        currentSurplus.toFixed(1) +
        " kWh of surplus. Set a price and post it for sale.";
      document.getElementById("sellAmount").value = currentSurplus.toFixed(1);
    } else {
      form.classList.add("hidden");
      subtitle.textContent =
        "No surplus available right now — nothing to sell.";
    }
  } catch (error) {
    console.error("Sell section loading error:", error);
    subtitle.textContent = "Unable to check your listing status.";
  }
}

document.getElementById("sellForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const price = parseFloat(document.getElementById("sellPrice").value);
  if (!price || price <= 0) {
    alert("Please enter a valid price per kWh.");
    return;
  }

  const response = await fetch(API_URL + "/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meter_id: user.meter_id,
      energy_available: currentSurplus,
      price_per_kwh: price,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    alert(data.message || "Could not post listing.");
    return;
  }

  document.getElementById("sellPrice").value = "";
  loadSellSection();
});

loadDashboard();

setInterval(loadDashboard, 5000);
