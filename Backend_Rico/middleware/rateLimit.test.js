import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  aiLimiter,
  loginLimiter,
  registrationLimiter,
} from "./rateLimit.js";

async function withServer(configureApp, run) {
  const app = express();
  configureApp(app);

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
}

test("limits failed login attempts by IP", async () => {
  await withServer(
    (app) => {
      app.post("/login", loginLimiter, (_req, res) => {
        res.status(401).json({ error: "Invalid credentials" });
      });
    },
    async (baseUrl) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await fetch(`${baseUrl}/login`, { method: "POST" });
        assert.equal(response.status, 401);
      }

      const blockedResponse = await fetch(`${baseUrl}/login`, {
        method: "POST",
      });
      assert.equal(blockedResponse.status, 429);
    },
  );
});

test("limits registrations by IP", async () => {
  await withServer(
    (app) => {
      app.post("/register", registrationLimiter, (_req, res) => {
        res.status(201).json({ success: true });
      });
    },
    async (baseUrl) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(`${baseUrl}/register`, { method: "POST" });
        assert.equal(response.status, 201);
      }

      const blockedResponse = await fetch(`${baseUrl}/register`, {
        method: "POST",
      });
      assert.equal(blockedResponse.status, 429);
    },
  );
});

test("limits AI requests per user without sharing quotas between users", async () => {
  await withServer(
    (app) => {
      app.use((req, _res, next) => {
        req.userId = req.headers["x-user-id"];
        next();
      });
      app.post("/ai", aiLimiter, (_req, res) => {
        res.json({ success: true });
      });
    },
    async (baseUrl) => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await fetch(`${baseUrl}/ai`, {
          method: "POST",
          headers: { "x-user-id": "user-a" },
        });
        assert.equal(response.status, 200);
      }

      const blockedResponse = await fetch(`${baseUrl}/ai`, {
        method: "POST",
        headers: { "x-user-id": "user-a" },
      });
      assert.equal(blockedResponse.status, 429);

      const otherUserResponse = await fetch(`${baseUrl}/ai`, {
        method: "POST",
        headers: { "x-user-id": "user-b" },
      });
      assert.equal(otherUserResponse.status, 200);
    },
  );
});
