const BASE = "http://127.0.0.1:3212";
const j = async (m, p, b, c) => {
  const r = await fetch(BASE + p, { method: m, headers: { "content-type": "application/json", ...(c ? { cookie: c } : {}) }, body: b ? JSON.stringify(b) : undefined, redirect: "manual" });
  return { status: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0], data: await r.json().catch(() => null) };
};
let r = await j("POST", "/api/auth/login", { email: "demo@nonia.app", password: "demo1234" });
console.log("login demo:", r.status, r.data?.role?.slug, "org:", r.data?.organization?.slug);
const c = r.cookie;
for (const p of ["/api/members", "/api/visitors", "/api/cells", "/api/ministries", "/api/financeiro", "/api/events", "/api/dashboard", "/api/activities", "/api/users", "/api/roles"]) {
  const res = await j("GET", p, null, c);
  const n = Array.isArray(res.data) ? res.data.length : (res.data?.ministries?.length ?? res.data?.records?.length ?? res.data?.users?.length ?? "obj");
  console.log(String(p).padEnd(20), res.status, "registros:", n);
}
r = await j("POST", "/api/auth/login", { email: "demo@nonia.app", password: "errada99" });
console.log("senha errada:", r.status, r.data?.code);
