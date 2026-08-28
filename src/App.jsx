import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE } from "./api.js";
import { getCache, setCache, clearCache } from "./cache.js";

const TOKEN_KEY = "shopping_token";
const DEVICE_KEY = "shopping_device_id";
const SESSION_KEY = "shopping_auth_session";
const ANDROID_APP_URL = "https://shop.vsedela.pro/downloads/shopping_app.apk";
const lastListKey = (groupId) => `shopping_last_list_${groupId}`;
const ALICE_COMMANDS = [
  "Группы",
  "Группа 1",
  "Группа Семья",
  "Списки",
  "Список 2",
  "Список Продукты",
  "Покупки",
  "Добавь молоко",
  "Добавь хлеб",
  "Отметь 1",
  "Отметь молоко",
  "Удали покупку 2",
  "Удали покупку хлеб",
  "Создай список На неделю",
  "Удали список 3",
  "Отчет",
  "Кто кому должен",
  "Что ты умеешь"
];

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing && existing.length <= 24) return existing;
  const generated = `web-${Date.now().toString(36)}`;
  localStorage.setItem(DEVICE_KEY, generated);
  return generated;
}

function loadPersistedAuthSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.sessionId ? parsed : null;
  } catch (e) {
    return null;
  }
}

function persistAuthSession(sessionId, authLink) {
  if (!sessionId) return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, authLink }));
}

function clearAuthSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getInviteTokenFromLocation() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("invite")) return params.get("invite");
  if (window.location.pathname.startsWith("/invite/")) {
    return window.location.pathname.replace("/invite/", "");
  }
  return null;
}

function buildTelegramSchemeLink(authLink) {
  if (!authLink) return null;
  try {
    const url = new URL(authLink);
    const bot = url.pathname.replace("/", "");
    const start = url.searchParams.get("start");
    if (!bot || !start) return null;
    return `tg://resolve?domain=${bot}&start=${encodeURIComponent(start)}`;
  } catch (e) {
    return null;
  }
}

function pluralMembers(count) {
  const n = Number(count) || 0;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} участника`;
  return `${n} участников`;
}

function formatDate(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (num) => String(num).padStart(2, "0");
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  } catch (e) {
    return value;
  }
}

function formatPrice(value) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return Number(value).toFixed(2);
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function buildSettlementsFromStats(stats) {
  if (!stats?.users?.length) return [];
  const users = stats.users
    .map((u) => ({
      name: (u.displayName || "").trim(),
      paid: Number(u.totalAmount || 0)
    }))
    .filter((u) => u.name && u.paid > 0);

  if (users.length < 2) return [];
  const total = users.reduce((sum, u) => sum + u.paid, 0);
  if (total <= 0) return [];

  const share = total / users.length;
  const creditors = [];
  const debtors = [];

  users.forEach((u) => {
    const net = round2(u.paid - share);
    if (net > 0) creditors.push({ ...u, balance: net });
    if (net < 0) debtors.push({ ...u, balance: Math.abs(net) });
  });

  const result = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = round2(Math.min(debtors[i].balance, creditors[j].balance));
    if (amount > 0) {
      result.push({ from: debtors[i].name, to: creditors[j].name, amount });
    }
    debtors[i].balance = round2(debtors[i].balance - amount);
    creditors[j].balance = round2(creditors[j].balance - amount);
    if (debtors[i].balance <= 0) i += 1;
    if (creditors[j].balance <= 0) j += 1;
  }

  return result;
}

function pickListId(lists) {
  if (!lists || !lists.length) return null;
  const active = lists.find((list) => !list.archived);
  return (active || lists[0]).id;
}

function getLastListId(groupId) {
  if (!groupId) return null;
  const raw = localStorage.getItem(lastListKey(groupId));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setLastListId(groupId, listId) {
  if (!groupId || !listId) return;
  localStorage.setItem(lastListKey(groupId), String(listId));
}

const EMPTY_ICONS = {
  people: (
    <>
      <circle cx="24" cy="20" r="7" />
      <path d="M12 46c0-7 5-12 12-12s12 5 12 12" />
      <circle cx="44" cy="22" r="5" />
      <path d="M40 46c0-6 3-10 8-10 4 0 7 3 8 7" />
    </>
  ),
  clipboard: (
    <>
      <rect x="16" y="10" width="32" height="44" rx="4" />
      <rect x="26" y="6" width="12" height="8" rx="2" />
      <path d="M24 26h16M24 34h16M24 42h10" />
    </>
  ),
  cart: (
    <>
      <circle cx="24" cy="50" r="4" />
      <circle cx="46" cy="50" r="4" />
      <path d="M8 10h8l6 28h28l6-20H18" />
    </>
  ),
  box: (
    <>
      <rect x="12" y="20" width="40" height="32" rx="4" />
      <path d="M8 12h48v8H8zM28 32h8" />
    </>
  ),
  person: (
    <>
      <circle cx="32" cy="20" r="9" />
      <path d="M14 52c0-10 8-16 18-16s18 6 18 16" />
    </>
  )
};

function EmptyState({ icon, title }) {
  return (
    <div className="empty empty-illustrated">
      <svg
        className="empty-icon"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {EMPTY_ICONS[icon] || EMPTY_ICONS.clipboard}
      </svg>
      <div>{title}</div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [deviceId] = useState(getOrCreateDeviceId);
  const inviteToken = useMemo(getInviteTokenFromLocation, []);

  const [sessionId, setSessionId] = useState(() => loadPersistedAuthSession()?.sessionId || null);
  const [authLink, setAuthLink] = useState(() => loadPersistedAuthSession()?.authLink || null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const pollingRef = useRef(null);
  const [confirmState, setConfirmState] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showAliceDetails, setShowAliceDetails] = useState(false);
  const [priceEditId, setPriceEditId] = useState(null);
  const [priceEditValue, setPriceEditValue] = useState("");
  const skipPriceSaveRef = useRef(false);
  const [touchHintVisible, setTouchHintVisible] = useState(() => {
    try {
      return !localStorage.getItem("shopping_touch_hint_seen");
    } catch (e) {
      return false;
    }
  });

  const dismissTouchHint = () => {
    try {
      localStorage.setItem("shopping_touch_hint_seen", "1");
    } catch (e) {
      // localStorage недоступен — просто скрываем до перезагрузки
    }
    setTouchHintVisible(false);
  };

  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupDetail, setGroupDetail] = useState(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedListId, setSelectedListId] = useState(null);
  const [items, setItems] = useState([]);
  const [purchaseStats, setPurchaseStats] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const isAdmin = groupDetail?.currentUserRole === "ADMIN";
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState("lists");
  const scrollByTabRef = useRef({});
  const prevTabRef = useRef(mobileTab);

  const [toast, setToast] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [inviteDialog, setInviteDialog] = useState(null);
  const [aliceCodeDialog, setAliceCodeDialog] = useState(null);
  const [priceDialogItem, setPriceDialogItem] = useState(null);
  const [priceDialogCheck, setPriceDialogCheck] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [editItemDialog, setEditItemDialog] = useState(null);
  const [editText, setEditText] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [itemMenuId, setItemMenuId] = useState(null);
  const itemPressRef = useRef(null);
  const [listMenuId, setListMenuId] = useState(null);
  const listPressRef = useRef(null);
  const longPressRef = useRef(false);
  const itemTouchRef = useRef(null);
  const listTouchRef = useRef(null);
  const closeAllMenus = () => {
    setItemMenuId(null);
    setListMenuId(null);
  };
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartRef = useRef(null);
  const longPressSuppressClickRef = useRef(false);
  const queueProcessingRef = useRef(false);
  const settlements = useMemo(() => buildSettlementsFromStats(purchaseStats), [purchaseStats]);

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === "success" ? 2000 : 4000);
  };

  const updateListStats = (listId, nextItems) => {
    setGroupDetail((prev) => {
      if (!prev) return prev;
      const lists = prev.lists.map((list) => {
        if (list.id !== listId) return list;
        const itemsCount = nextItems.length;
        const hasUncheckedItems = nextItems.some((item) => !item.checked);
        return { ...list, itemsCount, hasUncheckedItems };
      });
      const next = { ...prev, lists };
      setCache(`group:${prev.id}`, next);
      return next;
    });
  };

  const applyLocalItems = (listId, nextItems) => {
    setItems(nextItems);
    updateListStats(listId, nextItems);
    setCache(`items:${listId}`, nextItems);
  };

  const applyLocalListUpdate = (groupId, updater) => {
    setGroupDetail((prev) => {
      if (!prev || prev.id !== groupId) return prev;
      const lists = updater(prev.lists);
      const next = { ...prev, lists };
      setCache(`group:${groupId}`, next);
      return next;
    });
  };

  const enqueueAction = async (action) => {
    const queue = (await getCache("queue")) || [];
    queue.push({ ...action, queuedAt: Date.now() });
    await setCache("queue", queue);
    setPendingCount(queue.length);
  };

  const runOrQueue = async ({ action, run, optimistic, forceQueue = false }) => {
    if (forceQueue || !isOnline) {
      if (optimistic) optimistic();
      await enqueueAction(action);
      showToast("Сохранено офлайн, синхронизируем", "success");
      return;
    }
    try {
      await run();
    } catch (e) {
      if (String(e.message || "").includes("Failed to fetch")) {
        if (optimistic) optimistic();
        await enqueueAction(action);
        showToast("Сохранено офлайн, синхронизируем", "success");
        return;
      }
      throw e;
    }
  };

  const makeTempId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isTempId = (value) => typeof value === "string" && value.startsWith("tmp-");

  const refreshPendingCount = async () => {
    const queue = (await getCache("queue")) || [];
    setPendingCount(queue.length);
  };

  const updateListLocal = (groupId, listId, patch) => {
    applyLocalListUpdate(groupId, (lists) =>
      lists.map((list) => (list.id === listId ? { ...list, ...patch } : list))
    );
  };

  const removeListLocal = (groupId, listId) => {
    setGroupDetail((prev) => {
      if (!prev || prev.id !== groupId) return prev;
      const lists = prev.lists.filter((list) => list.id !== listId);
      const next = { ...prev, lists };
      if (selectedListId === listId) {
        setSelectedListId(pickListId(lists));
      }
      setCache(`group:${groupId}`, next);
      return next;
    });
  };

  const handleCreateList = async (name) => {
    if (!groupDetail) return;
    const tempId = makeTempId();
    await runOrQueue({
      action: { type: "list.create", groupId: groupDetail.id, name, tempId },
      run: () => api.createList(token, groupDetail.id, name),
      optimistic: () =>
        applyLocalListUpdate(groupDetail.id, (lists) => {
          const next = [
            {
              id: tempId,
              name,
              archived: false,
              itemsCount: 0,
              hasUncheckedItems: false,
              createdAt: new Date().toISOString(),
              groupId: groupDetail.id
            },
            ...lists
          ];
          if (!selectedListId) {
            setSelectedListId(tempId);
          }
          return next;
        })
    });
    if (isOnline) {
      refreshGroup(token, groupDetail.id, setGroupDetail, setSelectedListId, showToast);
    }
  };

  const handleRenameList = async (list, nextName) => {
    if (!groupDetail || !nextName?.trim()) return;
    const name = nextName.trim();
    await runOrQueue({
      action: { type: "list.update", listId: list.id, groupId: groupDetail.id, payload: { name } },
      run: () => api.updateList(token, list.id, { name }),
      optimistic: () => updateListLocal(groupDetail.id, list.id, { name }),
      forceQueue: isTempId(list.id)
    });
    if (isOnline) {
      refreshGroup(token, groupDetail.id, setGroupDetail, setSelectedListId, showToast);
    }
  };

  const handleArchiveList = async (list, archived) => {
    if (!groupDetail) return;
    await runOrQueue({
      action: { type: "list.update", listId: list.id, groupId: groupDetail.id, payload: { archived } },
      run: () => api.updateList(token, list.id, { archived }),
      optimistic: () => updateListLocal(groupDetail.id, list.id, { archived }),
      forceQueue: isTempId(list.id)
    });
    if (isOnline) {
      refreshGroup(token, groupDetail.id, setGroupDetail, setSelectedListId, showToast);
    }
  };

  const handleDeleteList = async (list) => {
    if (!groupDetail) return;
    await runOrQueue({
      action: { type: "list.delete", listId: list.id, groupId: groupDetail.id },
      run: () => api.deleteList(token, list.id),
      optimistic: () => removeListLocal(groupDetail.id, list.id),
      forceQueue: isTempId(list.id)
    });
    if (isOnline) {
      refreshGroup(token, groupDetail.id, setGroupDetail, setSelectedListId, showToast);
    }
  };

  const handleCreateItem = async (text) => {
    if (!selectedListId) return;
    const listId = selectedListId;
    const tempId = makeTempId();
    await runOrQueue({
      action: { type: "item.create", listId, text, price: null, tempId },
      run: () => api.createItem(token, listId, text, null),
      optimistic: () => {
        const next = [
          {
            id: tempId,
            text,
            checked: false,
            createdAt: new Date().toISOString(),
            price: null
          },
          ...items
        ];
        applyLocalItems(listId, next);
      },
      forceQueue: isTempId(listId)
    });
    if (isOnline && !isTempId(listId)) {
      refreshItems(token, listId, setItems, showToast);
      refreshPurchaseStats(listId);
    }
  };

  const handleToggleItem = async (item, checkedOverride = null) => {
    if (!selectedListId) return;
    const listId = selectedListId;
    const nextChecked = checkedOverride !== null ? checkedOverride : !item.checked;
    await runOrQueue({
      action: { type: "item.check", listId, itemId: item.id, checked: nextChecked },
      run: () => api.checkItem(token, item.id, nextChecked),
      optimistic: () => {
        const next = items
          .map((it) => (it.id === item.id ? { ...it, checked: nextChecked } : it))
          .sort((a, b) => (a.checked === b.checked ? 0 : a.checked ? 1 : -1));
        applyLocalItems(listId, next);
      },
      forceQueue: isTempId(item.id) || isTempId(listId)
    });
    if (isOnline && !isTempId(listId)) {
      refreshItems(token, listId, setItems, showToast);
      refreshPurchaseStats(listId);
    }
  };

  const handleUpdateItem = async (itemId, text, price) => {
    if (!selectedListId) return;
    const listId = selectedListId;
    await runOrQueue({
      action: { type: "item.update", listId, itemId, text, price },
      run: () => api.updateItem(token, itemId, text ?? null, price ?? null),
      optimistic: () => {
        const next = items.map((it) =>
          it.id === itemId ? { ...it, text: text ?? it.text, price } : it
        );
        applyLocalItems(listId, next);
      },
      forceQueue: isTempId(itemId) || isTempId(listId)
    });
    if (isOnline && !isTempId(listId)) {
      refreshItems(token, listId, setItems, showToast);
      refreshPurchaseStats(listId);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!selectedListId) return;
    const listId = selectedListId;
    await runOrQueue({
      action: { type: "item.delete", listId, itemId },
      run: () => api.deleteItem(token, itemId),
      optimistic: () => applyLocalItems(listId, items.filter((it) => it.id !== itemId)),
      forceQueue: isTempId(itemId) || isTempId(listId)
    });
    if (isOnline && !isTempId(listId)) {
      refreshItems(token, listId, setItems, showToast);
      refreshPurchaseStats(listId);
    }
  };

  const refreshPurchaseStats = async (listId) => {
    if (!token || !listId || isTempId(listId)) {
      setPurchaseStats(null);
      return;
    }
    try {
      const data = await api.getListPurchaseStats(token, listId);
      setPurchaseStats(data);
    } catch (e) {
      setPurchaseStats(null);
    }
  };

  const openInviteDialog = (invite) => {
    if (!invite) return;
    const link = invite.inviteLink || invite.inviteToken;
    setInviteDialog({
      link,
      expiresAt: invite.expiresAt
    });
    if (link && navigator.clipboard) {
      navigator.clipboard.writeText(link).catch(() => {});
    }
  };

  const openPriceDialog = (item, checkOnSave = false) => {
    setPriceDialogItem(item);
    setPriceDialogCheck(checkOnSave);
    setPriceInput(item?.price != null ? String(item.price) : "");
  };

  const openInlinePrice = (item) => {
    setPriceEditValue(item?.price != null ? String(item.price) : "");
    skipPriceSaveRef.current = false;
    setPriceEditId(item.id);
  };

  const saveInlinePrice = (item) => {
    if (skipPriceSaveRef.current) {
      skipPriceSaveRef.current = false;
      setPriceEditId(null);
      return;
    }
    const normalized = priceEditValue.replace(",", ".").trim();
    const parsed = normalized ? Number(normalized) : null;
    setPriceEditId(null);
    if (parsed !== null && !Number.isNaN(parsed) && parsed !== item.price) {
      handleUpdateItem(item.id, null, parsed).catch((e) =>
        showToast(e.message || "Не удалось обновить стоимость")
      );
    }
  };

  const openEditItemDialog = (item) => {
    setEditItemDialog(item);
    setEditText(item?.text || "");
    setEditPrice(item?.price != null ? String(item.price) : "");
  };

  const closeItemMenu = () => setItemMenuId(null);
  const closeListMenu = () => setListMenuId(null);

  const handleItemPressStart = (itemId) => {
    if (!isMobile) return;
    if (itemPressRef.current) clearTimeout(itemPressRef.current);
    longPressRef.current = false;
    itemPressRef.current = setTimeout(() => {
      longPressRef.current = true;
      setItemMenuId(itemId);
    }, 450);
  };

  const handleItemPressEnd = () => {
    if (itemPressRef.current) {
      clearTimeout(itemPressRef.current);
      itemPressRef.current = null;
    }
  };

  const handleListPressStart = (listId) => {
    if (!isMobile) return;
    if (listPressRef.current) clearTimeout(listPressRef.current);
    longPressRef.current = false;
    listPressRef.current = setTimeout(() => {
      longPressRef.current = true;
      setListMenuId(listId);
    }, 450);
  };

  const handleListPressEnd = () => {
    if (listPressRef.current) {
      clearTimeout(listPressRef.current);
      listPressRef.current = null;
    }
  };

  const handleItemTouchStart = (itemId, event) => {
    if (!isMobile) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    itemTouchRef.current = { time: Date.now(), id: itemId, x: touch.clientX, y: touch.clientY, moved: false };
    longPressRef.current = false;
    longPressSuppressClickRef.current = false;
  };

  const handleItemTouchMove = (event) => {
    if (!isMobile || !itemTouchRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - itemTouchRef.current.x);
    const dy = Math.abs(touch.clientY - itemTouchRef.current.y);
    if (dx > 10 || dy > 10) {
      itemTouchRef.current.moved = true;
    }
  };

  const handleItemTouchEnd = () => {
    if (!isMobile || !itemTouchRef.current) return;
    const { time, id, moved } = itemTouchRef.current;
    const duration = Date.now() - time;
    itemTouchRef.current = null;
    if (duration >= 550 && !moved) {
      longPressRef.current = true;
      longPressSuppressClickRef.current = true;
      setItemMenuId(id);
    }
  };

  const handleListTouchStart = (listId, event) => {
    if (!isMobile) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    listTouchRef.current = { time: Date.now(), id: listId, x: touch.clientX, y: touch.clientY, moved: false };
    longPressRef.current = false;
    longPressSuppressClickRef.current = false;
  };

  const handleListTouchMove = (event) => {
    if (!isMobile || !listTouchRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - listTouchRef.current.x);
    const dy = Math.abs(touch.clientY - listTouchRef.current.y);
    if (dx > 10 || dy > 10) {
      listTouchRef.current.moved = true;
    }
  };

  const handleListTouchEnd = () => {
    if (!isMobile || !listTouchRef.current) return;
    const { time, id, moved } = listTouchRef.current;
    const duration = Date.now() - time;
    listTouchRef.current = null;
    if (duration >= 550 && !moved) {
      longPressRef.current = true;
      longPressSuppressClickRef.current = true;
      setListMenuId(id);
    }
  };

  const handlePullStart = (event) => {
    if (!isMobile || window.scrollY > 0) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    pullStartRef.current = touch.clientY;
  };

  const handlePullMove = (event) => {
    if (!isMobile || pullStartRef.current == null || window.scrollY > 0) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const delta = Math.max(0, touch.clientY - pullStartRef.current);
    if (delta > 0) {
      setPullDistance(Math.min(delta, 120));
    }
  };

  const handlePullEnd = () => {
    if (!isMobile) return;
    const shouldRefresh = pullDistance > 60;
    setPullDistance(0);
    pullStartRef.current = null;
    if (shouldRefresh) {
      handleRefreshAll();
    }
  };

  const clearPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = (currentSessionId) => {
    clearPolling();
    const poll = async () => {
      try {
        const status = await api.sessionStatus(currentSessionId, deviceId);
        if (status?.token) {
          clearAuthSession();
          localStorage.setItem(TOKEN_KEY, status.token);
          setToken(status.token);
          setSessionId(null);
          setAuthLink(null);
          setAuthError("");
          clearPolling();
        } else if (status?.status === "EXPIRED") {
          clearAuthSession();
          setSessionId(null);
          setAuthLink(null);
          setAuthError("Сессия входа истекла. Нажмите «Войти через Telegram» ещё раз.");
          clearPolling();
        }
      } catch (e) {
        if (e.status === 404) {
          clearAuthSession();
          setSessionId(null);
          setAuthLink(null);
          setAuthError("Сессия входа не найдена. Нажмите «Войти через Telegram» ещё раз.");
          clearPolling();
        } else {
          setAuthError(e.message || "Ошибка статуса сессии");
        }
      }
    };
    pollingRef.current = setInterval(poll, 2000);
    poll();
  };

  const handleLogin = async () => {
    setAuthError("");
    setAuthLoading(true);
      try {
        const response = await api.createSession(deviceId);
        setSessionId(response.sessionId);
        setAuthLink(response.authLink);
        persistAuthSession(response.sessionId, response.authLink);
        showToast("Сессия создана. Открой Telegram для входа.", "success");
      if (response.authLink) {
        const tgLink = buildTelegramSchemeLink(response.authLink);
        if (tgLink) {
          window.location.href = tgLink;
          setTimeout(() => window.open(response.authLink, "_blank", "noopener"), 600);
        } else {
          window.open(response.authLink, "_blank", "noopener");
        }
      } else {
        setAuthError("Ссылка для Telegram не получена. Проверь настройки бота.");
      }
      if (response.sessionId) {
        startPolling(response.sessionId);
      }
    } catch (e) {
      setAuthError(e.message || "Не удалось создать сессию");
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    startPolling(sessionId);
    return () => clearPolling();
  }, [sessionId, deviceId]);

  useEffect(() => () => clearPolling(), []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 960px)");
    const update = () => setIsMobile(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isMobile) {
      setShowMembers(false);
    }
  }, [isMobile]);

  const loadGroups = async () => {
    setGroupsLoading(true);
    try {
      const data = await api.listGroups(token);
      const sorted = [...data].sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return (a.id || 0) - (b.id || 0);
      });
      setGroups(sorted);
      await setCache("groups", sorted);
      if (!selectedGroupId && data.length > 0) {
        setSelectedGroupId(sorted[0].id);
      }
    } catch (e) {
      showToast(e.message || "Не удалось загрузить группы");
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleRefreshAll = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      await loadGroups();
      if (selectedGroupId) {
        await refreshGroup(token, selectedGroupId, setGroupDetail, setSelectedListId, showToast);
      }
      if (selectedListId && !isTempId(selectedListId)) {
        await refreshItems(token, selectedListId, setItems, showToast);
        await refreshPurchaseStats(selectedListId);
      }
      showToast("Обновлено", "success");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    getCache("groups").then((cached) => {
      if (cached && cached.length) {
        setGroups(cached);
        if (!selectedGroupId) {
          setSelectedGroupId(cached[0].id);
        }
      }
    });
    refreshPendingCount();
    loadGroups();
  }, [token]);

  useEffect(() => {
    if (!token || !selectedGroupId) return;
    getCache(`group:${selectedGroupId}`).then((cached) => {
      if (cached) {
        setGroupDetail(cached);
        if (cached?.lists?.length) {
          setSelectedListId((prev) => {
            const existing = cached.lists.find((list) => list.id === prev);
            const stored = getLastListId(cached.id);
            const storedList = cached.lists.find((list) => list.id === stored);
            return existing?.id || storedList?.id || pickListId(cached.lists);
          });
        }
      }
    });
    const loadGroup = async () => {
      setGroupLoading(true);
      try {
        const data = await api.getGroup(token, selectedGroupId);
        setGroupDetail(data);
        await setCache(`group:${selectedGroupId}`, data);
        if (data?.lists?.length) {
          setSelectedListId((prev) => {
            const existing = data.lists.find((list) => list.id === prev);
            const stored = getLastListId(data.id);
            const storedList = data.lists.find((list) => list.id === stored);
            return existing?.id || storedList?.id || pickListId(data.lists);
          });
        } else {
          setSelectedListId(null);
          setItems([]);
        }
      } catch (e) {
        showToast(e.message || "Не удалось загрузить группу");
      } finally {
        setGroupLoading(false);
      }
    };
    loadGroup();
  }, [token, selectedGroupId]);

  useEffect(() => {
    if (isMobile && selectedGroupId) {
      setMobileTab("lists");
    }
  }, [isMobile, selectedGroupId]);

  useEffect(() => {
    if (!isMobile) return;
    const prevTab = prevTabRef.current;
    scrollByTabRef.current[prevTab] = window.scrollY;
    prevTabRef.current = mobileTab;
    const nextScroll = scrollByTabRef.current[mobileTab] ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, nextScroll));
  }, [mobileTab, isMobile]);

  useEffect(() => {
    if (!token || !selectedGroupId) return;
    const url = `${API_BASE}/groups/${selectedGroupId}/events?token=${encodeURIComponent(token)}`;
    let source = null;
    let reconnectTimer = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      source = new EventSource(url);
      const handler = (event) => {
        try {
          const payload = JSON.parse(event.data);
    if (payload?.type === "GROUP_DELETED") {
      setSelectedGroupId(null);
      setGroupDetail(null);
      loadGroups();
      showToast("Группа удалена", "success");
      return;
    }
        } catch (e) {
          // ignore parse errors
        }
        refreshGroup(token, selectedGroupId, setGroupDetail, setSelectedListId, showToast);
        if (selectedListId) {
          refreshItems(token, selectedListId, setItems, showToast);
          refreshPurchaseStats(selectedListId);
        }
      };
      source.addEventListener("group-event", handler);
      source.onerror = () => {
        source.close();
        if (active) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (source) source.close();
    };
  }, [token, selectedGroupId, selectedListId]);

  useEffect(() => {
    if (!token || !selectedListId) {
      setPurchaseStats(null);
      return;
    }
    if (isTempId(selectedListId)) {
      setPurchaseStats(null);
      return;
    }
    getCache(`items:${selectedListId}`).then((cached) => {
      if (cached && cached.length) {
        setItems(cached);
      }
    });
    const loadItems = async () => {
      setItemsLoading(true);
      try {
        const data = await api.listItems(token, selectedListId);
        const sorted = [...data].sort((a, b) => {
          if (a.checked === b.checked) return 0;
          return a.checked ? 1 : -1;
        });
        setItems(sorted);
        await setCache(`items:${selectedListId}`, sorted);
        const stats = await api.getListPurchaseStats(token, selectedListId);
        setPurchaseStats(stats);
      } catch (e) {
        showToast(e.message || "Не удалось загрузить покупки");
        setPurchaseStats(null);
      } finally {
        setItemsLoading(false);
      }
    };
    loadItems();
  }, [token, selectedListId]);

  useEffect(() => {
    if (!isOnline || !token) return;
    const processQueue = async () => {
      if (queueProcessingRef.current) return;
      queueProcessingRef.current = true;
      setIsSyncing(true);
      try {
        const queue = (await getCache("queue")) || [];
        setPendingCount(queue.length);
        if (!queue.length) return;
        const idMap = (await getCache("id-map")) || { lists: {}, items: {} };
        const remaining = [];
        let didWork = false;

        const resolveListId = (listId) => {
          if (!isTempId(listId)) return listId;
          return idMap.lists?.[listId] || null;
        };

        const resolveItemId = (itemId) => {
          if (!isTempId(itemId)) return itemId;
          return idMap.items?.[itemId] || null;
        };

        for (let idx = 0; idx < queue.length; idx += 1) {
          const action = queue[idx];
          try {
            if (action.type === "list.create") {
              const created = await api.createList(token, action.groupId, action.name);
              idMap.lists = { ...(idMap.lists || {}), [action.tempId]: created.id };
              applyLocalListUpdate(action.groupId, (lists) =>
                lists.map((list) => (list.id === action.tempId ? { ...created } : list))
              );
              const cachedItems = await getCache(`items:${action.tempId}`);
              if (cachedItems) {
                await setCache(`items:${created.id}`, cachedItems);
                await setCache(`items:${action.tempId}`, []);
              }
              if (selectedListId === action.tempId) {
                setSelectedListId(created.id);
                if (cachedItems) setItems(cachedItems);
              }
              didWork = true;
            } else if (action.type === "list.update") {
              const listId = resolveListId(action.listId);
              if (!listId) {
                remaining.push(action);
                continue;
              }
              await api.updateList(token, listId, action.payload);
              didWork = true;
            } else if (action.type === "list.delete") {
              const listId = resolveListId(action.listId);
              if (!listId) {
                remaining.push(action);
                continue;
              }
              await api.deleteList(token, listId);
              didWork = true;
            } else if (action.type === "item.create") {
              const listId = resolveListId(action.listId);
              if (!listId) {
                remaining.push(action);
                continue;
              }
              const created = await api.createItem(token, listId, action.text, action.price ?? null);
              idMap.items = { ...(idMap.items || {}), [action.tempId]: created.id };
              const cachedItems = (await getCache(`items:${listId}`)) || [];
              const nextCached = cachedItems.map((item) => (item.id === action.tempId ? created : item));
              await setCache(`items:${listId}`, nextCached);
              if (String(listId) === String(selectedListId)) {
                applyLocalItems(listId, items.map((item) => (item.id === action.tempId ? created : item)));
              }
              didWork = true;
            } else if (action.type === "item.update") {
              const itemId = resolveItemId(action.itemId);
              if (!itemId) {
                remaining.push(action);
                continue;
              }
              await api.updateItem(token, itemId, action.text ?? null, action.price ?? null);
              didWork = true;
            } else if (action.type === "item.check") {
              const itemId = resolveItemId(action.itemId);
              if (!itemId) {
                remaining.push(action);
                continue;
              }
              await api.checkItem(token, itemId, action.checked);
              didWork = true;
            } else if (action.type === "item.delete") {
              const itemId = resolveItemId(action.itemId);
              if (!itemId) {
                remaining.push(action);
                continue;
              }
              await api.deleteItem(token, itemId);
              didWork = true;
            }
          } catch (e) {
            remaining.push(action, ...queue.slice(idx + 1));
            break;
          }
        }

        await setCache("id-map", idMap);
        await setCache("queue", remaining);
        setPendingCount(remaining.length);
        if (didWork) {
          if (selectedGroupId) {
            refreshGroup(token, selectedGroupId, setGroupDetail, setSelectedListId, showToast);
          }
          if (selectedListId && !isTempId(selectedListId)) {
            refreshItems(token, selectedListId, setItems, showToast);
          }
          showToast("Синхронизация завершена", "success");
        }
      } finally {
        queueProcessingRef.current = false;
        setIsSyncing(false);
      }
    };
    processQueue();
  }, [isOnline, token]);

  useEffect(() => {
    if (!itemMenuId && !listMenuId) return;
    const handler = (event) => {
      const target = event.target;
      if (!target) return;
      if (target.closest?.(".item-menu") || target.closest?.(".icon-btn")) return;
      closeAllMenus();
    };
    document.addEventListener("touchstart", handler, true);
    document.addEventListener("pointerdown", handler, true);
    return () => {
      document.removeEventListener("touchstart", handler, true);
      document.removeEventListener("pointerdown", handler, true);
    };
  }, [itemMenuId, listMenuId]);

  useEffect(() => {
    if (!token || !inviteToken) return;
    const accept = async () => {
      try {
        await api.acceptInvite(token, inviteToken);
        showToast("Приглашение принято", "success");
        loadGroups();
      } catch (e) {
        showToast(e.message || "Не удалось принять приглашение");
      }
    };
    accept();
  }, [token, inviteToken]);

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    clearCache();
    setToken(null);
    setGroups([]);
    setGroupDetail(null);
    setItems([]);
    setPendingCount(0);
  };

  useEffect(() => {
    const onAuthExpired = () => {
      handleLogout();
      showToast("Сессия истекла. Выполните вход снова.");
    };
    window.addEventListener("shopping-auth-expired", onAuthExpired);
    return () => window.removeEventListener("shopping-auth-expired", onAuthExpired);
  }, []);

  useEffect(() => {
    if (itemMenuId == null && listMenuId == null) return undefined;
    const closeMenus = () => {
      setItemMenuId(null);
      setListMenuId(null);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeMenus();
    };
    document.addEventListener("click", closeMenus);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", closeMenus);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [itemMenuId, listMenuId]);

  const openConfirm = (title, message, onConfirm, confirmLabel = "Удалить") =>
    setConfirmState({ title, message, onConfirm, confirmLabel });

  const handleDeleteGroup = async () => {
    if (!groupDetail) return;
    openConfirm(
      "Удалить группу?",
      "Группа, её списки и покупки будут удалены для всех участников. Действие необратимо.",
      async () => {
        try {
          await api.deleteGroup(token, groupDetail.id);
          setGroupDetail(null);
          setSelectedGroupId(null);
          await loadGroups();
        } catch (e) {
          showToast(e.message || "Не удалось удалить группу");
        }
      }
    );
  };

  const handleCreateAliceCode = async () => {
    try {
      const data = await api.createAliceLinkCode(token);
      setAliceCodeDialog(data);
      if (data?.code && navigator.clipboard) {
        navigator.clipboard.writeText(data.code).catch(() => {});
      }
      showToast("Код для Алисы создан", "success");
    } catch (e) {
      showToast(e.message || "Не удалось создать код для Алисы");
    }
  };

  if (!token) {
    return (
      <div className="login-screen">
        <div className="landing-glow landing-glow-left" />
        <div className="landing-glow landing-glow-right" />
        <div className="login-layout">
          <section className="landing-panel">
            <div className="badge">Умные покупки</div>
            <h1 className="landing-title">Один список для семьи, веба, Telegram и Алисы</h1>
            <p className="landing-lead">
              Ведите общие покупки в реальном времени: добавляйте товары, отмечайте выполненное, фиксируйте цены,
              смотрите сводку трат и взаиморасчеты по участникам.
            </p>
            <div className="row" style={{ marginTop: 12, marginBottom: 8 }}>
              <a className="btn btn-secondary" href={ANDROID_APP_URL} target="_blank" rel="noreferrer">
                Скачать приложение для Android
              </a>
            </div>
            <div className="landing-feature-grid">
              <article className="landing-feature-card">
                <h3>Синхронизация без перезагрузки</h3>
                <p>Изменения у всех участников появляются почти сразу, без ручного обновления страницы.</p>
              </article>
              <article className="landing-feature-card">
                <h3>Домашняя бухгалтерия в списке</h3>
                <p>Отчет показывает, кто сколько потратил и кто кому должен, с учетом копеек.</p>
              </article>
              <article className="landing-feature-card">
                <h3>Уведомления в Telegram</h3>
                <p>Бот присылает уведомления при добавлении и удалении покупок, а также при создании новых списков.</p>
              </article>
              <article className="landing-feature-card">
                <h3>Оффлайн и мобильный режим</h3>
                <p>Если интернет пропал, действия не теряются и применяются автоматически после восстановления связи.</p>
              </article>
            </div>
            <div className="alice-block">
              <h2>Навык Алисы</h2>
              <p>Голосом можно открывать группы и списки, добавлять и удалять покупки, получать отчет.</p>
              <div className="alice-setup">
                <h3>Как подключить</h3>
                <ol className="alice-steps">
                  <li>Скажите: «Алиса, запусти навык Умные покупки».</li>
                  <li>В вебе или приложении создайте код привязки Алисы, нажав на кнопку Алиса и получив там код привязки.</li>
                  <li>В навыке скажите: «привязать 1234» (вместо 1234 назовите свой код).</li>
                </ol>
              </div>
              <div className="archive-toggle accordion" onClick={() => setShowAliceDetails((prev) => !prev)}>
                <span>Полные команды и примеры</span>
                <span>{showAliceDetails ? "▲" : "▼"}</span>
              </div>
              {showAliceDetails ? (
                <>
                  <div className="alice-setup">
                    <ul className="alice-flow">
                  <li>
                    <strong>1) Открыть группы:</strong> скажи <code>группы</code>, затем выбери:
                    <code>группа 1</code> или <code>группа Семья</code>.
                  </li>
                  <li>
                    <strong>2) Открыть списки в группе:</strong> скажи <code>списки</code>, затем выбери:
                    <code>список 2</code> или <code>список Продукты</code>.
                  </li>
                  <li>
                    <strong>3) Прослушать покупки:</strong> скажи <code>покупки</code>.
                  </li>
                  <li>
                    <strong>4) Добавить покупки:</strong> <code>добавь молоко</code>, <code>добавь хлеб</code>.
                  </li>
                  <li>
                    <strong>5) Отметить купленное:</strong> <code>отметь 1</code> или <code>отметь молоко</code>.
                  </li>
                  <li>
                    <strong>6) Удалить покупку:</strong> <code>удали покупку 2</code> или <code>удали покупку хлеб</code>.
                  </li>
                  <li>
                    <strong>7) Работа со списками:</strong> <code>создай список На неделю</code>,
                    <code>удали список 3</code>.
                  </li>
                  <li>
                    <strong>8) Отчет по тратам:</strong> <code>отчет</code> или <code>кто кому должен</code>.
                  </li>
                  <li>
                    <strong>9) Подсказка по возможностям:</strong> <code>что ты умеешь</code>.
                  </li>
                </ul>
                  </div>
                  <div className="alice-commands">
                    {ALICE_COMMANDS.map((command) => (
                      <span key={command} className="alice-command-chip">
                        {command}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>
          <div className="login-card">
            <h1>Умные покупки</h1>
            <p>Войдите через Telegram, чтобы создавать группы, списки и покупать вместе.</p>
            <div className="row">
              <button className="btn" onClick={handleLogin} disabled={authLoading}>
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" style={{ marginRight: 8 }}>
                  <path
                    d="M21.9 4.6c.3-1.3-.9-2.4-2.1-1.9L2.7 9.6c-1.3.5-1.2 2.3.1 2.7l4.4 1.4 1.7 5.4c.4 1.2 1.9 1.5 2.7.5l2.4-2.9 4.5 3.3c1 .8 2.5.2 2.8-1.1l2.6-14.3z"
                    fill="currentColor"
                  />
                </svg>
                {authLoading ? "Создаём сессию..." : "Войти через Telegram"}
              </button>
            </div>
            {authLink ? (
              <div className="link-box">
                <div className="muted">Ссылка для авторизации</div>
                <div className="row" style={{ marginTop: 8 }}>
                  {buildTelegramSchemeLink(authLink) ? (
                    <a className="btn btn-secondary" href={buildTelegramSchemeLink(authLink)}>
                      Открыть Telegram (tg://)
                    </a>
                  ) : null}
                  <a className="btn btn-secondary" href={authLink} target="_blank" rel="noreferrer">
                    Открыть бота
                  </a>
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigator.clipboard && navigator.clipboard.writeText(authLink)}
                  >
                    Скопировать ссылку
                  </button>
                </div>
                <div className="link-text">{authLink}</div>
              </div>
            ) : null}
            {inviteToken ? (
              <div className="toast success">После входа приглашение будет принято автоматически.</div>
            ) : null}
            {authError ? <div className="toast">{authError}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  const mobileAddHint = isMobile ? "Быстро добавить покупку" : "Добавить покупку";

  return (
    <div
      className="app-shell"
      data-mobile={isMobile ? "true" : "false"}
      data-mobile-tab={mobileTab}
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      <aside className="sidebar">
        <div className="brand">Умные покупки</div>
        <div className="badge">Вы вошли</div>
        <div className="sidebar-section">
          <div className="sidebar-title">Группы</div>
          {groupsLoading ? (
            <div className="list">
              <div className="shimmer" />
              <div className="shimmer" />
              <div className="shimmer" />
            </div>
          ) : (
            <div className="group-list">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={`group-card ${selectedGroupId === group.id ? "active" : ""}`}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <h4>{group.name}</h4>
                  <div className="group-meta">{pluralMembers(group.membersCount)}</div>
                </div>
              ))}
              {!groups.length ? (
                <EmptyState icon="people" title="Пока нет групп. Создайте первую — вместе проще покупать." />
              ) : null}
            </div>
          )}
        </div>
        <div className="sidebar-section">
          <GroupCreateForm token={token} onCreated={loadGroups} />
        </div>
        <div className="sidebar-section">
          <button className="btn btn-ghost" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="main">
        <div className={`pull-indicator ${pullDistance > 0 ? "active" : ""}`} style={{ height: pullDistance }}>
          <span>{pullDistance > 60 ? "Отпустите, чтобы обновить" : "Потяните вниз для обновления"}</span>
        </div>
        {isMobile && touchHintVisible ? (
          <div className="hint-bar" role="note">
            <span>Подсказка: удерживайте список или покупку — откроется меню действий.</span>
            <button className="hint-close" onClick={dismissTouchHint} aria-label="Скрыть подсказку">
              ×
            </button>
          </div>
        ) : null}
        <div className="topbar">
          <h1>{groupDetail?.name || "Выберите группу"}</h1>
          <div className="row">
            <span
              className={`sync-dot ${!isOnline ? "offline" : isSyncing || refreshing || pendingCount ? "syncing active" : "ok"}`}
              title={
                !isOnline
                  ? "Оффлайн"
                  : isSyncing || refreshing
                  ? "Синхронизация"
                  : pendingCount
                  ? `Ожидает синка: ${pendingCount}`
                  : "Синхронизировано"
              }
            />
            <span className="sync-label">
              {!isOnline
                ? "Оффлайн"
                : isSyncing || refreshing
                ? "Синхронизация…"
                : pendingCount
                ? `Не отправлено: ${pendingCount}`
                : "Сохранено"}
            </span>
            {!isOnline ? <span className="pill pill-muted">Оффлайн</span> : null}
            {groupDetail ? <span className="pill">{pluralMembers(groupDetail.members.length)}</span> : null}
            <button className="btn btn-secondary" onClick={handleCreateAliceCode}>
              Алиса
            </button>
            <button className="icon-btn" title="Выйти" onClick={handleLogout} aria-label="Выйти">
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 4h9v2H6v12h7v2H4V4zm9.5 4.5L15 7l5 5-5 5-1.5-1.5 2.5-2.5H9v-2h7l-2.5-2.5z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="card mobile-only panel-groups">
          <h3 className="card-title">Группы</h3>
          {groupsLoading ? (
            <div className="list">
              <div className="shimmer" />
              <div className="shimmer" />
            </div>
          ) : (
            <div className="group-list">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className={`group-card ${selectedGroupId === group.id ? "active" : ""}`}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <h4>{group.name}</h4>
                  <div className="group-meta">{pluralMembers(group.membersCount)}</div>
                </div>
              ))}
              {!groups.length ? (
                <EmptyState icon="people" title="Пока нет групп. Создайте первую — вместе проще покупать." />
              ) : null}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <GroupCreateForm token={token} onCreated={loadGroups} />
          </div>
        </div>

        {!groupDetail ? (
          <div className="card"><EmptyState icon="people" title="Выберите группу, чтобы увидеть её списки и покупки." /></div>
        ) : (
          <div className="grid">
            <div className="split">
              <div className="card panel-lists">
                <div className="card-title row space-between">
                  <h3>Покупки группы</h3>
                  <span className="pill pill-muted">
                    {groupDetail.lists.filter((list) => !list.archived).length} активных
                  </span>
                </div>
                <ListCreateForm onCreate={handleCreateList} />
                  <div className="list" style={{ marginTop: 16 }}>
                  {groupLoading ? (
                    <>
                      <div className="shimmer" />
                      <div className="shimmer" />
                      <div className="shimmer" />
                    </>
                  ) : groupDetail.lists.length ? (
                    groupDetail.lists
                      .filter((list) => !list.archived)
                      .map((list) => (
                      <div
                        key={list.id}
                        className={`list-item list-card ${selectedListId === list.id ? "active" : ""} ${list.hasUncheckedItems ? "has-unchecked" : ""}`}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          handleListTouchStart(list.id, e);
                        }}
                        onTouchMove={handleListTouchMove}
                        onTouchEnd={handleListTouchEnd}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setListMenuId(list.id);
                        }}
                        onClick={() => {
                          if (longPressSuppressClickRef.current) {
                            longPressSuppressClickRef.current = false;
                            longPressRef.current = false;
                            return;
                          }
                          setSelectedListId(list.id);
                          setLastListId(groupDetail.id, list.id);
                          if (isMobile) setMobileTab("items");
                        }}
                      >
                        <div className="item-main">
                          <div className="list-title-row">
                            <strong>{list.name}</strong>
                            <span className="chip">{list.itemsCount ?? 0} шт</span>
                          </div>
                          <div className="list-sub">
                            <span className="muted">Создан: {formatDate(list.createdAt)}</span>
                            {list.hasUncheckedItems ? (
                              <span className="status-pill">Есть покупки</span>
                            ) : (
                              <span className="status-pill muted">Все куплено</span>
                            )}
                          </div>
                        </div>
                        {isAdmin ? (
                          <div className="row action-bar" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="icon-btn"
                              title="Действия"
                              aria-label="Действия"
                              aria-expanded={listMenuId === list.id}
                              onClick={() => setListMenuId(listMenuId === list.id ? null : list.id)}
                            >
                              ⋯
                            </button>
                            {listMenuId === list.id ? (
                              <div
                                className="item-menu"
                                onMouseLeave={closeListMenu}
                                onClick={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="menu-item"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeListMenu();
                                    setRenameValue(list.name);
                                    setRenameDialog({ list });
                                  }}
                                >
                                  Переименовать
                                </button>
                                    <button
                                      className="menu-item"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeListMenu();
                                    handleArchiveList(list, true);
                                  }}
                                    >
                                      В архив
                                    </button>
                                <button
                                  className="menu-item danger"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeListMenu();
                                    openConfirm(
                                      "Удалить список?",
                                      `Список «${list.name}» будет удалён для всех участников вместе с покупками.`,
                                      () => handleDeleteList(list)
                                    );
                                  }}
                                >
                                  Удалить
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))
                    ) : (
                      <EmptyState icon="clipboard" title="Списков пока нет. Создайте первый в строке выше." />
                    )}
                  </div>
                  <div className="archive-toggle accordion" onClick={() => setShowArchive((prev) => !prev)}>
                    <span>Архив ({groupDetail.lists.filter((list) => list.archived).length})</span>
                    <span>{showArchive ? "▲" : "▼"}</span>
                  </div>
                {showArchive ? (
                  <div className="list" style={{ marginTop: 12 }}>
                    {groupDetail.lists.filter((list) => list.archived).length ? (
                      groupDetail.lists
                        .filter((list) => list.archived)
                        .map((list) => (
                          <div
                            key={list.id}
                              className="list-item list-card archived"
                              onTouchStart={(e) => {
                                e.stopPropagation();
                                handleListTouchStart(list.id, e);
                              }}
                              onTouchMove={handleListTouchMove}
                              onTouchEnd={handleListTouchEnd}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                setListMenuId(list.id);
                              }}
                              onClick={() => {
                                if (longPressSuppressClickRef.current) {
                                  longPressSuppressClickRef.current = false;
                                  longPressRef.current = false;
                                  return;
                                }
                                setSelectedListId(list.id);
                                setLastListId(groupDetail.id, list.id);
                                if (isMobile) setMobileTab("items");
                              }}
                            >
                            <div className="item-main">
                              <div className="list-title-row">
                                <strong>{list.name}</strong>
                                <span className="chip">{list.itemsCount ?? 0} шт</span>
                              </div>
                              <div className="list-sub">
                                <span className="muted">Создан: {formatDate(list.createdAt)}</span>
                                <span className="status-pill muted">Архив</span>
                              </div>
                            </div>
                            {isAdmin ? (
                              <div className="row action-bar" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="icon-btn"
                                  title="Действия"
                                  aria-label="Действия"
                                  aria-expanded={listMenuId === list.id}
                                  onClick={() => setListMenuId(listMenuId === list.id ? null : list.id)}
                                >
                                  ⋯
                                </button>
                            {listMenuId === list.id ? (
                                    <div
                                      className="item-menu"
                                      onMouseLeave={closeListMenu}
                                      onClick={(e) => e.stopPropagation()}
                                      onTouchStart={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        className="menu-item"
                                        onClick={() => {
                                        closeListMenu();
                                        setRenameValue(list.name);
                                        setRenameDialog({ list });
                                      }}
                                    >
                                      Переименовать
                                    </button>
                                    <button
                                      className="menu-item"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          closeListMenu();
                                          handleArchiveList(list, false);
                                        }}
                                    >
                                      Вернуть
                                    </button>
                                    <button
                                      className="menu-item danger"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          closeListMenu();
                                          openConfirm(
                                            "Удалить список?",
                                            `Архивный список «${list.name}» будет удалён вместе с покупками.`,
                                            () => handleDeleteList(list)
                                          );
                                        }}
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ))
                    ) : (
                      <EmptyState icon="box" title="Архив пуст. Тут будут завершённые списки." />
                    )}
                  </div>
                ) : null}
              </div>

              <div className="card card-soft panel-items">
                <div className="card-title row space-between">
                  <h3>Покупки</h3>
                  {items.length ? (
                    <span className="pill pill-muted">
                      {items.filter((item) => !item.checked).length} из {items.length}
                    </span>
                  ) : null}
                </div>
                  {selectedListId ? (
                    <>
                      <div className="sticky-add">
                        <ItemCreateForm
                          placeholder={mobileAddHint}
                          onCreate={handleCreateItem}
                        />
                      </div>
                      <div className="list" style={{ marginTop: 16 }}>
                      {itemsLoading ? (
                        <>
                          <div className="shimmer" />
                          <div className="shimmer" />
                          <div className="shimmer" />
                        </>
                      ) : items.length ? (
                        items.map((item) => (
                          <div
                            key={item.id}
                            className={`list-item ${item.checked ? "done" : ""} fade-in`}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              handleItemTouchStart(item.id, e);
                            }}
                            onTouchMove={handleItemTouchMove}
                            onTouchEnd={handleItemTouchEnd}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setItemMenuId(item.id);
                            }}
                          >
                            <label className="checkbox checkbox-left">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => handleToggleItem(item, !item.checked)}
                                aria-label={item.checked ? `Снять отметку: ${item.text}` : `Отметить купленным: ${item.text}`}
                              />
                            </label>
                            <div
                              className="item-main"
                              onClick={() => {
                                if (longPressSuppressClickRef.current) {
                                  longPressSuppressClickRef.current = false;
                                  longPressRef.current = false;
                                  return;
                                }
                                openPriceDialog(item, false);
                              }}
                            >
                              <div className="item-title-row">
                                <div className="item-title">{item.text}</div>
                                {priceEditId === item.id ? (
                                  <input
                                    className="input price-inline-input"
                                    autoFocus
                                    inputMode="decimal"
                                    placeholder="Цена, ₽"
                                    value={priceEditValue}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setPriceEditValue(e.target.value)}
                                    onBlur={() => saveInlinePrice(item)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        saveInlinePrice(item);
                                      }
                                      if (e.key === "Escape") {
                                        skipPriceSaveRef.current = true;
                                        setPriceEditId(null);
                                      }
                                    }}
                                  />
                                ) : item.price != null ? (
                                  <span
                                    className="price-chip"
                                    title="Изменить цену"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openInlinePrice(item);
                                    }}
                                  >
                                    {formatPrice(item.price)} ₽
                                  </span>
                                ) : (
                                  <span
                                    className="chip chip-muted-action"
                                    title="Указать цену"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openInlinePrice(item);
                                    }}
                                  >
                                    Указать цену
                                  </span>
                                )}
                              </div>
                              <div className="item-meta item-created muted">Создан: {formatDate(item.createdAt)}</div>
                              {item.checked && item.checkedByDisplay ? (
                                <div className="item-meta muted">
                                  Отметил: {item.checkedByDisplay}
                                  {item.checkedAt ? ` • ${formatDate(item.checkedAt)}` : ""}
                                </div>
                              ) : null}
                            </div>
                            <div className="row action-bar">
                              <button
                                className="icon-btn"
                                title="Действия"
                                aria-label="Действия"
                                aria-expanded={itemMenuId === item.id}
                                onClick={() => setItemMenuId(itemMenuId === item.id ? null : item.id)}
                              >
                                ⋯
                              </button>
                              {itemMenuId === item.id ? (
                                <div
                                  className="item-menu"
                                  onMouseLeave={closeItemMenu}
                                  onClick={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                >
                                  <button
                                    className="menu-item"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openEditItemDialog(item);
                                    }}
                                  >
                                    Редактировать
                                  </button>
                                  <button
                                    className="menu-item"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openPriceDialog(item, false);
                                    }}
                                  >
                                    Цена
                                  </button>
                                  <button
                                    className="menu-item danger"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      closeItemMenu();
                                      openConfirm("Удалить покупку?", `«${item.text}» будет удалена из списка.`, () =>
                                        handleDeleteItem(item.id)
                                      );
                                    }}
                                  >
                                    Удалить
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyState icon="cart" title="Покупок пока нет. Добавьте первую строкой выше." />
                      )}
                    </div>
                    {items.length ? (
                      <>
                        <div className="total sticky-total">
                          Итого: {items.reduce((sum, item) => sum + (item.price || 0), 0).toFixed(2)} ₽
                        </div>
                        {purchaseStats?.users?.length ? (
                          <div className="card card-soft" style={{ marginTop: 12 }}>
                            <div className="card-title">
                              <h3>Статистика по пользователям</h3>
                            </div>
                            <div className="list">
                              {purchaseStats.users.map((user) => (
                                <div key={user.userId} className="list-item">
                                  <div>
                                    <strong>{user.displayName}</strong>
                                    <div className="muted">
                                      {user.itemsCount} покупок • {Number(user.totalAmount || 0).toFixed(2)} ₽
                                    </div>
                                    {user.items?.length ? (
                                      <div className="muted" style={{ marginTop: 4 }}>
                                        {user.items.slice(0, 3).map((entry) => `${entry.text} (${Number(entry.price || 0).toFixed(2)} ₽)`).join(", ")}
                                        {user.items.length > 3 ? ` и ещё ${user.items.length - 3}` : ""}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="total" style={{ marginTop: 8 }}>
                              Итог по отмеченным: {Number(purchaseStats.totalAmount || 0).toFixed(2)} ₽
                            </div>
                            <div style={{ marginTop: 10 }}>
                              <strong>Взаиморасчеты</strong>
                              {settlements.length ? (
                                <div className="list" style={{ marginTop: 8 }}>
                                  {settlements.map((s, idx) => (
                                    <div className="list-item" key={`${s.from}-${s.to}-${idx}`}>
                                      <div>
                                        <strong>{s.from}</strong> должен <strong>{s.to}</strong>{" "}
                                        {Number(s.amount || 0).toFixed(2)} ₽
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="muted" style={{ marginTop: 6 }}>
                                  Долгов между участниками нет.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : (
                  <EmptyState icon="clipboard" title="Выберите список, чтобы увидеть покупки." />
                )}
              </div>
            </div>

            <div className="split">
              <div className="card panel-members">
                <div className="card-title row space-between accordion" onClick={() => setShowMembers((prev) => !prev)}>
                  <h3>Участники</h3>
                  <span className="muted">{showMembers ? "▲" : "▼"}</span>
                </div>
                {isAdmin ? (
                  <div style={{ marginBottom: 12 }}>
                    <button className="btn btn-ghost danger-text" onClick={handleDeleteGroup}>
                      Удалить группу
                    </button>
                  </div>
                ) : null}
                <AddMemberForm
                  token={token}
                  groupId={groupDetail.id}
                  onMemberAdded={() => refreshGroup(token, groupDetail.id, setGroupDetail, setSelectedListId, showToast)}
                  onInviteCreated={openInviteDialog}
                />
                {showMembers ? (
                  <div className="list" style={{ marginTop: 16 }}>
                    {groupDetail.members.length ? (
                      groupDetail.members.map((member) => (
                        <div key={member.id} className="list-item">
                          <div>
                            <strong>{member.login || member.telegramUsername || `User #${member.userId}`}</strong>
                            <div className="muted">{member.role}</div>
                          </div>
                          <div className="row">
                            {isAdmin && member.role !== "ADMIN" ? (
                              <button
                                className="btn btn-secondary"
                                onClick={() =>
                                  api
                                    .updateMemberRole(token, groupDetail.id, member.id, "ADMIN")
                                    .then(() => refreshGroup(token, groupDetail.id, setGroupDetail, setSelectedListId, showToast))
                                    .catch((e) => showToast(e.message || "Не удалось обновить роль"))
                                }
                              >
                                Сделать админом
                              </button>
                            ) : null}
                            <button
                              className="btn btn-secondary"
                              onClick={() =>
                                openConfirm(
                                  "Удалить участника?",
                                  `${member.login || member.telegramUsername || `User #${member.userId}`} потеряет доступ к группе.`,
                                  () =>
                                    removeMember(token, groupDetail.id, member.id, setGroupDetail, showToast)
                                )
                              }
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState icon="person" title="Пока нет участников" />
                    )}
                  </div>
                ) : null}
              </div>

              <div className="card card-soft panel-invites">
                <h3 className="card-title">Приглашения</h3>
                <InviteCreateForm
                  token={token}
                  groupId={groupDetail.id}
                  onInvite={openInviteDialog}
                />
                <div className="muted" style={{ marginTop: 12 }}>
                  Можно отправить ссылку в Telegram — пользователь попадет в группу после входа.
                </div>
              </div>
            </div>
          </div>
        )}
        {toast ? <div className={`toast ${toast.type === "success" ? "success" : ""}`}>{toast.message}</div> : null}
        {confirmState ? (
          <div className="modal-backdrop" onClick={() => setConfirmState(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <h3>{confirmState.title}</h3>
              <p className="muted">{confirmState.message}</p>
              <div className="row" style={{ marginTop: 16 }}>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    const action = confirmState.onConfirm;
                    setConfirmState(null);
                    action();
                  }}
                >
                  {confirmState.confirmLabel}
                </button>
                <button className="btn btn-secondary" onClick={() => setConfirmState(null)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {renameDialog ? (
          <div className="modal-backdrop" onClick={() => setRenameDialog(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <h3>Переименовать список</h3>
              <input
                className="input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) {
                    const target = renameDialog.list;
                    const nextName = renameValue.trim();
                    setRenameDialog(null);
                    handleRenameList(target, nextName);
                  }
                }}
              />
              <div className="row" style={{ marginTop: 16 }}>
                <button
                  className="btn"
                  onClick={() => {
                    if (!renameValue.trim()) return;
                    const target = renameDialog.list;
                    const nextName = renameValue.trim();
                    setRenameDialog(null);
                    handleRenameList(target, nextName);
                  }}
                >
                  Сохранить
                </button>
                <button className="btn btn-secondary" onClick={() => setRenameDialog(null)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {inviteDialog ? (
          <div className="modal-backdrop" onClick={() => setInviteDialog(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Инвайт-ссылка</h3>
              <p className="muted">{inviteDialog.link}</p>
              {inviteDialog.expiresAt ? <p className="muted">Действует до: {inviteDialog.expiresAt}</p> : null}
              <div className="row" style={{ marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(inviteDialog.link)}
                >
                  Скопировать
                </button>
                <button className="btn" onClick={() => setInviteDialog(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {aliceCodeDialog ? (
          <div className="modal-backdrop" onClick={() => setAliceCodeDialog(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Код привязки Алисы</h3>
              <p className="muted">Скажи в навыке: привязать {aliceCodeDialog.code}</p>
              <div className="link-text" style={{ letterSpacing: "1px", fontSize: "20px" }}>
                {aliceCodeDialog.code}
              </div>
              {aliceCodeDialog.expiresAt ? (
                <p className="muted">Действует до: {formatDate(aliceCodeDialog.expiresAt)}</p>
              ) : null}
              <div className="row" style={{ marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(aliceCodeDialog.code)}
                >
                  Скопировать код
                </button>
                <button className="btn" onClick={() => setAliceCodeDialog(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {priceDialogItem ? (
          <div className="modal-backdrop" onClick={() => setPriceDialogItem(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Стоимость</h3>
              <p className="muted">{priceDialogItem.text}</p>
              <input
                className="input"
                placeholder="Цена (₽)"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
              <div className="row" style={{ marginTop: 16 }}>
                <button
                  className="btn"
                  onClick={async () => {
                    const normalized = priceInput.replace(",", ".").trim();
                    const parsed = normalized ? Number(normalized) : null;
                    try {
                      if (priceDialogCheck && !priceDialogItem.checked) {
                        await handleToggleItem(priceDialogItem, true);
                      }
                      if (parsed !== null && !Number.isNaN(parsed)) {
                        await handleUpdateItem(priceDialogItem.id, null, parsed);
                      }
                      setPriceDialogItem(null);
                      setPriceDialogCheck(false);
                      setPriceInput("");
                    } catch (e) {
                      showToast(e.message || "Не удалось обновить стоимость");
                    }
                  }}
                >
                  Сохранить
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setPriceDialogItem(null);
                    setPriceDialogCheck(false);
                    setPriceInput("");
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {editItemDialog ? (
          <div className="modal-backdrop" onClick={() => setEditItemDialog(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Редактировать покупку</h3>
              <input
                className="input"
                placeholder="Название"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <input
                className="input"
                style={{ marginTop: 8 }}
                placeholder="Цена (₽)"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
              />
              <div className="row" style={{ marginTop: 16 }}>
                <button
                  className="btn"
                  onClick={async () => {
                    const normalized = editPrice.replace(",", ".").trim();
                    const parsed = normalized ? Number(normalized) : null;
                    try {
                      await handleUpdateItem(
                        editItemDialog.id,
                        editText.trim(),
                        Number.isFinite(parsed) ? parsed : null
                      );
                      setEditItemDialog(null);
                    } catch (e) {
                      showToast(e.message || "Не удалось обновить покупку");
                    }
                  }}
                >
                  Сохранить
                </button>
                <button className="btn btn-secondary" onClick={() => setEditItemDialog(null)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mobile-bar">
          <button
            className={`mobile-tab ${mobileTab === "groups" ? "active" : ""}`}
            onClick={() => setMobileTab("groups")}
          >
            Группы
          </button>
          <button
            className={`mobile-tab ${mobileTab === "lists" ? "active" : ""}`}
            onClick={() => setMobileTab("lists")}
          >
            Списки
          </button>
          <button
            className={`mobile-tab ${mobileTab === "items" ? "active" : ""}`}
            onClick={() => setMobileTab("items")}
          >
            Покупки
          </button>
          <button
            className={`mobile-tab ${mobileTab === "members" ? "active" : ""}`}
            onClick={() => setMobileTab("members")}
          >
            Участники
          </button>
        </div>
      </main>
    </div>
  );
}

function GroupCreateForm({ token, onCreated }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.createGroup(token, name.trim());
      setName("");
      onCreated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card card-soft" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h3 className="card-title">Новая группа</h3>
      <div className="row">
        <input className="input" placeholder="Название группы" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit" disabled={loading}>
          Создать
        </button>
      </div>
    </form>
  );
}

function ListCreateForm({ onCreate }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate(name.trim());
      setName("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input className="input" placeholder="Новый список" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn" type="submit" disabled={loading}>
        Добавить
      </button>
    </form>
  );
}

function ItemCreateForm({ onCreate, placeholder }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      await onCreate(text.trim());
      setText("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="row">
        <input
          className="input"
          placeholder={placeholder || "Добавить покупку"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <button className="btn" type="submit" style={{ marginTop: 12 }} disabled={loading}>
        Добавить
      </button>
    </form>
  );
}

function AddMemberForm({ token, groupId, onMemberAdded, onInviteCreated }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const payload = trimmed.startsWith("@")
        ? { login: null, telegramUsername: trimmed.slice(1) }
        : { login: trimmed, telegramUsername: null };
      await api.addMember(token, groupId, payload);
      setValue("");
      onMemberAdded();
    } catch (e) {
      if (e.code === "USER_NOT_FOUND") {
        const invite = await api.createInvite(token, groupId, 48);
        onInviteCreated(invite);
        setValue("");
      } else {
        throw e;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="row">
        <input
          className="input"
          placeholder="@username или логин участника"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn" type="submit" disabled={loading}>
          Добавить
        </button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Укажите @username из Telegram или логин. Если участника ещё нет в сервисе — создадим ссылку-приглашение, просто отправьте её ему.
      </div>
    </form>
  );
}

function InviteCreateForm({ token, groupId, onInvite }) {
  const [expiresInHours, setExpiresInHours] = useState("48");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const invite = await api.createInvite(token, groupId, Number(expiresInHours));
      onInvite(invite);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="row">
        <select
          className="input"
          value={expiresInHours}
          onChange={(e) => setExpiresInHours(e.target.value)}
          aria-label="Срок действия ссылки"
        >
          <option value="24">Сутки</option>
          <option value="48">2 дня</option>
          <option value="168">Неделя</option>
          <option value="720">Месяц</option>
        </select>
        <button className="btn" type="submit" disabled={loading}>
          Создать ссылку
        </button>
      </div>
    </form>
  );
}

async function refreshGroup(token, groupId, setGroupDetail, setSelectedListId, showToast) {
  try {
    const data = await api.getGroup(token, groupId);
    setGroupDetail(data);
    await setCache(`group:${groupId}`, data);
    if (data?.lists?.length) {
      setSelectedListId((prev) => {
        const existing = data.lists.find((list) => list.id === prev);
        return existing ? existing.id : pickListId(data.lists);
      });
    } else {
      setSelectedListId(null);
    }
  } catch (e) {
    showToast(e.message || "Не удалось обновить группу");
  }
}

async function refreshItems(token, listId, setItems, showToast) {
  if (typeof listId === "string" && listId.startsWith("tmp-")) return;
  try {
    const data = await api.listItems(token, listId);
    const sorted = [...data].sort((a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked ? 1 : -1;
    });
    setItems(sorted);
    await setCache(`items:${listId}`, sorted);
  } catch (e) {
    showToast(e.message || "Не удалось обновить покупки");
  }
}

async function toggleArchive(token, list, setGroupDetail, showToast) {
  try {
    await api.updateList(token, list.id, { archived: !list.archived });
    const data = await api.getGroup(token, list.groupId);
    setGroupDetail(data);
  } catch (e) {
    showToast(e.message || "Не удалось обновить список");
  }
}

async function toggleItem(token, item, setItems, showToast, checkedOverride = null) {
  try {
    const nextChecked = checkedOverride !== null ? checkedOverride : !item.checked;
    const updated = await api.checkItem(token, item.id, nextChecked);
    setItems((prev) =>
      prev.map((it) => (it.id === updated.id ? updated : it)).sort((a, b) => {
        if (a.checked === b.checked) return 0;
        return a.checked ? 1 : -1;
      })
    );
  } catch (e) {
    showToast(e.message || "Не удалось обновить покупку");
  }
}

async function deleteItem(token, itemId, setItems, showToast) {
  try {
    await api.deleteItem(token, itemId);
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  } catch (e) {
    showToast(e.message || "Не удалось удалить покупку");
  }
}

async function removeMember(token, groupId, memberId, setGroupDetail, showToast) {
  try {
    await api.removeMember(token, groupId, memberId);
    const data = await api.getGroup(token, groupId);
    setGroupDetail(data);
  } catch (e) {
    showToast(e.message || "Не удалось удалить участника");
  }
}
