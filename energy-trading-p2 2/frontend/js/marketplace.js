const user = requireUser();

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function loadMarketplace() {
  document.getElementById("sidebarAvatar").textContent = initials(user.name);
  document.getElementById("sidebarName").textContent = user.name;
  document.getElementById("sidebarMeter").textContent = user.meter_id;

  const list = document.getElementById("listingList");

  list.innerHTML = '<p class="subtitle">Loading marketplace...</p>';

  try {
    const response = await fetch(API_URL + "/api/marketplace");
    const listings = await response.json();

    list.innerHTML = "";

    if (listings.length === 0) {
      list.innerHTML =
        '<p class="subtitle">No listings available right now.</p>';
      return;
    }

    listings.forEach((listing) => {
      const card = document.createElement("div");
      card.className = "listing-card";

      const isOwnListing = listing.meter_id === user.meter_id;
      const totalPrice = (
        listing.energy_available * listing.price_per_kwh
      ).toFixed(2);

      // Buyers get a Buy button; sellers see their own listing marked
      // instead, since you can't buy your own surplus.
      const actionHtml = isOwnListing
        ? '<span class="pill pill-verified">Your Listing</span>'
        : `<button class="btn btn-primary btn-sm" data-id="${listing.id}">Buy</button>`;

      card.innerHTML = `
        <div class="listing-avatar">${listing.meter_id}</div>

        <div class="listing-body">
          <div class="listing-title">
            ${Number(listing.energy_available).toFixed(1)} kWh available
          </div>

          <div class="listing-sub">
            ${Number(listing.price_per_kwh).toFixed(2)} SAR / kWh
            &middot; meter ${listing.meter_id}
          </div>
        </div>

        <div class="listing-actions">
          <div class="listing-total">
            ${totalPrice} SAR
          </div>
          ${actionHtml}
        </div>
      `;

      if (!isOwnListing) {
        card
          .querySelector("button")
          .addEventListener("click", () => handleBuy(listing.id));
      }

      list.appendChild(card);
    });
  } catch (error) {
    console.error("Marketplace loading error:", error);

    list.innerHTML =
      '<p class="subtitle">Unable to load marketplace. Please try again.</p>';
  }
}

async function handleBuy(listingId) {
  try {
    const response = await fetch(API_URL + "/api/purchase/" + listingId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer_meter_id: user.meter_id }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || "Purchase failed.");
      return;
    }

    alert(
      "Purchase complete: " +
        data.energy_kwh.toFixed(1) +
        " kWh from meter " +
        data.seller_meter_id +
        " for " +
        data.total_price.toFixed(2) +
        " SAR",
    );

    loadMarketplace();
  } catch (error) {
    console.error("Purchase error:", error);
    alert("Purchase failed. Please try again.");
  }
}

loadMarketplace();

setInterval(loadMarketplace, 5000);
