class i extends Error {
  constructor(e, r) {
    super(r), this.code = e, this.name = "ReminderError";
  }
}
function y(t) {
  if (t instanceof i) return t;
  let e = t;
  if (typeof e == "string")
    try {
      e = JSON.parse(e);
    } catch {
    }
  const r = e && typeof e == "object" ? e : void 0;
  return new i(typeof r?.code == "string" ? r.code : "unsupported", typeof r?.message == "string" ? r.message : String(t));
}
function u() {
  throw new i("invalidRequest", "Provide a provider, data type, enabled flag and valid reminder settings");
}
function s() {
  throw new i("invalidResponse", "Invalid reminder response");
}
function o(t, e) {
  return typeof t == "string" && [...t].length <= e;
}
function d(t) {
  return Number.isSafeInteger(t) && t >= 0;
}
function a(t) {
  const e = t;
  return !!e && o(e.source, 64) && !!e.source && o(e.uuid, 128) && !!e.uuid;
}
function f(t) {
  return !!t && a(t.provider) && o(t.type, 128) && !!t.type && typeof t.enabled == "boolean" && (t.cooldownMs === void 0 || Number.isSafeInteger(t.cooldownMs) && t.cooldownMs >= 3e4 && t.cooldownMs <= 864e5) && (t.quietHours === void 0 || !!t.quietHours && Number.isInteger(t.quietHours.start) && Number.isInteger(t.quietHours.end) && t.quietHours.start >= 0 && t.quietHours.start < 1440 && t.quietHours.end >= 0 && t.quietHours.end < 1440);
}
function c(t) {
  const e = t;
  return (!f(e) || typeof e.cooldownMs != "number" || typeof e.available != "boolean" || e.lastCheckedAt !== void 0 && !d(e.lastCheckedAt) || e.lastDeliveredAt !== void 0 && !d(e.lastDeliveredAt)) && s(), e;
}
function p(t) {
  const e = t;
  return (!e || !/^[a-f0-9]{64}$/.test(e.id) || !a(e.provider) || !o(e.type, 128) || !e.type || !o(e.resourceId, 1024) || !e.resourceId || !d(e.dueAt) || !d(e.deliveredAt) || !o(e.title, 120) || !o(e.body, 500)) && s(), e;
}
function g(t) {
  const e = async (r, n) => {
    try {
      return await t.invoke(`otools_host_plugin_reminders_${r}`, n);
    } catch (l) {
      throw y(l);
    }
  };
  return {
    async configure(r) {
      f(r) || u();
      const n = { provider: { source: r.provider.source, uuid: r.provider.uuid }, type: r.type, enabled: r.enabled };
      return r.quietHours !== void 0 && (n.quietHours = { start: r.quietHours.start, end: r.quietHours.end }), r.cooldownMs !== void 0 && (n.cooldownMs = r.cooldownMs), c(await e("configure", { request: n }));
    },
    async status() {
      const r = await e("status");
      return (!Array.isArray(r) || r.length > 16) && s(), r.map(c);
    },
    async pending() {
      const r = await e("pending");
      return (!Array.isArray(r) || r.length > 20) && s(), r.map(p);
    },
    async acknowledge(r) {
      (!Array.isArray(r) || r.length > 20 || r.some((n) => typeof n != "string" || !/^[a-f0-9]{64}$/.test(n))) && u(), await e("acknowledge", { ids: [...r] });
    }
  };
}
export {
  i as ReminderError,
  g as createReminderApi
};
//# sourceMappingURL=reminder-factory.js.map
