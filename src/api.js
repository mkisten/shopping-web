const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://shopping.subscriptionhhapp.ru/api").replace(/\/$/, "");

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    let errorBody = null;
    try {
      errorBody = await response.json();
    } catch (e) {
      errorBody = { message: await response.text() };
    }
    const error = new Error(errorBody?.message || "Ошибка запроса");
    error.status = response.status;
    error.code = errorBody?.code;
    error.body = errorBody;
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("shopping-auth-expired"));
    }
    throw error;
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export const api = {
  createSession: (deviceId) => request("/telegram-auth/create-session", { method: "POST", body: { deviceId } }),
  sessionStatus: (sessionId, deviceId) =>
    request(`/telegram-auth/status/${sessionId}?deviceId=${encodeURIComponent(deviceId || "")}`),
  listGroups: (token) => request("/groups", { token }),
  createGroup: (token, name) => request("/groups", { method: "POST", token, body: { name } }),
  getGroup: (token, groupId) => request(`/groups/${groupId}`, { token }),
  updateGroup: (token, groupId, name) => request(`/groups/${groupId}`, { method: "PUT", token, body: { name } }),
  deleteGroup: (token, groupId) => request(`/groups/${groupId}`, { method: "DELETE", token }),
  addMember: (token, groupId, payload) =>
    request(`/groups/${groupId}/members`, { method: "POST", token, body: payload }),
  updateMemberRole: (token, groupId, memberId, role) =>
    request(`/groups/${groupId}/members/${memberId}/role`, { method: "PUT", token, body: { role } }),
  removeMember: (token, groupId, memberId) =>
    request(`/groups/${groupId}/members/${memberId}`, { method: "DELETE", token }),
  createInvite: (token, groupId, expiresInHours) =>
    request(`/groups/${groupId}/invites`, { method: "POST", token, body: { expiresInHours } }),
  getInvite: (token) => request(`/invites/${token}`),
  acceptInvite: (token, inviteToken) => request(`/invites/${inviteToken}/accept`, { method: "POST", token }),
  createList: (token, groupId, name) =>
    request(`/groups/${groupId}/lists`, { method: "POST", token, body: { name } }),
  getGroupLists: (token, groupId) => request(`/groups/${groupId}/lists`, { token }),
  getList: (token, listId) => request(`/lists/${listId}`, { token }),
  updateList: (token, listId, payload) => request(`/lists/${listId}`, { method: "PUT", token, body: payload }),
  deleteList: (token, listId) => request(`/lists/${listId}`, { method: "DELETE", token }),
  createItem: (token, listId, text, price) =>
    request(`/lists/${listId}/items`, { method: "POST", token, body: { text, price } }),
  listItems: (token, listId) => request(`/lists/${listId}/items`, { token }),
  getListPurchaseStats: (token, listId) => request(`/lists/${listId}/purchase-stats`, { token }),
  updateItem: (token, itemId, text, price) => request(`/items/${itemId}`, { method: "PUT", token, body: { text, price } }),
  checkItem: (token, itemId, checked) =>
    request(`/items/${itemId}/check`, { method: "POST", token, body: { checked } }),
  deleteItem: (token, itemId) => request(`/items/${itemId}`, { method: "DELETE", token }),
  createAliceLinkCode: (token) => request("/profile/alice/link-code", { method: "POST", token })
};

export { API_BASE };
