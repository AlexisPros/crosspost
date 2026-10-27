import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { appUrl } from "./app-url";
import { proxy } from "../proxy";

test("public redirects use APP_URL rather than the Docker listener", (t) => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = "http://localhost:3000";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  });

  assert.equal(appUrl("/connections?connected=1").href, "http://localhost:3000/connections?connected=1");
  assert.equal(appUrl("//other.example/path").origin, "http://localhost:3000");

  const local = new NextRequest("http://0.0.0.0:3000/connections", { headers: { host: "localhost:3000" } });
  assert.equal(proxy(local).headers.get("location"), "http://localhost:3000/login");

  const alias = new NextRequest("http://127.0.0.1:3000/login?next=connections", { headers: { host: "127.0.0.1:3000" } });
  assert.equal(proxy(alias).headers.get("location"), "http://localhost:3000/login?next=connections");

  const callback = new NextRequest("http://0.0.0.0:3000/api/oauth/x/callback?state=example&code=example", {
    headers: { host: "localhost:3000", cookie: "cp_session=example" },
  });
  assert.equal(proxy(callback).headers.get("location"), null);
});

test("canonical origin works behind an HTTPS reverse proxy", (t) => {
  const previous = process.env.APP_URL;
  process.env.APP_URL = "https://crosspost.example";
  t.after(() => {
    if (previous === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous;
  });
  const request = new NextRequest("http://0.0.0.0:3000/connections", {
    headers: { host: "app:3000", "x-forwarded-host": "crosspost.example", "x-forwarded-proto": "https", cookie: "cp_session=example" },
  });
  assert.equal(proxy(request).headers.get("location"), null);
});
