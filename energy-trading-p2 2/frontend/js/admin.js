const admin = requireAdmin();
document.getElementById("sidebarName").textContent = admin.name;

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function loadPending() {
  const response = await fetch(API_URL + "/api/admin/pending");
  const users = await response.json();

  const container = document.getElementById("pendingList");
  container.innerHTML = "";

  if (users.length === 0) {
    container.innerHTML = '<p class="subtitle">No pending users to review.</p>';
    return;
  }

  users.forEach((user) => {
    const card = document.createElement("div");
    card.className = "listing-card";
    card.innerHTML = `
      <div class="listing-avatar">${initials(user.name)}</div>
      <div class="listing-body">
        <div class="listing-title">${user.name} <span class="pill pill-pending">Pending</span></div>
        <div class="listing-sub">${user.email}</div>
        <div class="listing-sub">meter ${user.meter_id}</div>
      </div>
      <div class="btn-row listing-actions">
        <button class="btn btn-primary btn-sm" data-action="verify" data-id="${user.id}">Approve</button>
        <button class="btn btn-outline btn-sm" data-action="reject" data-id="${user.id}">Reject</button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleDecision(btn.dataset.id, btn.dataset.action),
    );
  });
}

async function handleDecision(id, action) {
  await fetch(API_URL + "/api/admin/" + action + "/" + id, { method: "POST" });
  loadPending();
}

// =========================================================
// Notification bell: red dot + scrollable dropdown + toast popups
// =========================================================

// IDs we've already shown a toast for in this browser session, so a
// notification never pops up twice even though it keeps coming back
// in the full history list until it's marked read.
const toastedIds = new Set();
let notifDropdownOpen = false;

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return new Date(dateString).toLocaleDateString();
}

function showToast(message) {
  const container = document.getElementById("toastContainer");

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = "🔔 " + message;
  container.prepend(toast);

  // Auto-remove after 5 seconds, with a short fade-out first
  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 200);
  }, 5000);
}

function renderNotifDropdown(notifications) {
  const list = document.getElementById("notifDropdownList");

  if (notifications.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }

  list.innerHTML = notifications
    .map(
      (n) => `
    <div class="notif-item${n.is_read ? "" : " unread"}">
      <div>${n.message}</div>
      <div class="notif-time">${timeAgo(n.created_at)}</div>
    </div>
  `,
    )
    .join("");
}

function updateNotifDot(notifications) {
  const hasUnread = notifications.some((n) => !n.is_read);
  document.getElementById("notifDot").classList.toggle("hidden", !hasUnread);
}

async function pollNotifications() {
  try {
    const response = await fetch(API_URL + "/api/notifications?role=admin");
    const notifications = await response.json();

    // Toast any notification we haven't shown yet in this session
    const freshOnes = notifications.filter((n) => !toastedIds.has(n.id));
    freshOnes.forEach((n) => {
      toastedIds.add(n.id);
      showToast(n.message);
    });

    if (freshOnes.length > 0) {
      // A new signup means there's a new pending user — refresh now
      // instead of waiting for the next scheduled refresh.
      loadPending();
    }

    updateNotifDot(notifications);

    // Keep the open dropdown in sync with the latest list
    if (notifDropdownOpen) {
      renderNotifDropdown(notifications);
    }
  } catch (error) {
    console.error("Notification polling error:", error);
  }
}

async function openNotifDropdown() {
  const dropdown = document.getElementById("notifDropdown");
  dropdown.classList.remove("hidden");
  notifDropdownOpen = true;

  const response = await fetch(API_URL + "/api/notifications?role=admin");
  const notifications = await response.json();
  renderNotifDropdown(notifications);

  // Mark everything read now that the admin has actually seen the list
  await fetch(API_URL + "/api/notifications/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  });
  document.getElementById("notifDot").classList.add("hidden");
}

function closeNotifDropdown() {
  document.getElementById("notifDropdown").classList.add("hidden");
  notifDropdownOpen = false;
}

document.getElementById("notifBellBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  notifDropdownOpen ? closeNotifDropdown() : openNotifDropdown();
});

// Click anywhere outside the bell/dropdown closes it
document.addEventListener("click", (e) => {
  if (notifDropdownOpen && !e.target.closest(".notif-wrapper")) {
    closeNotifDropdown();
  }
});

loadPending();
pollNotifications();

setInterval(loadPending, 5000);
setInterval(pollNotifications, 5000);
