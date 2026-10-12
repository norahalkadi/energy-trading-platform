function getUser() {
  const raw = localStorage.getItem('user')
  return raw ? JSON.parse(raw) : null
}

function requireUser() {
  const user = getUser()
  if (!user || user.role !== 'user') {
    window.location.href = 'login.html'
    return null
  }
  return user
}

function requireAdmin() {
  const user = getUser()
  if (!user || user.role !== 'admin') {
    window.location.href = 'admin-login.html'
    return null
  }
  return user
}

function logout() {
  localStorage.removeItem('user')
  window.location.href = 'login.html'
}
