import type { RequestHandler } from "express";
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "todo_" });

const requestCount = new Counter({
  name: "todo_http_requests_total",
  help: "HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

const requestDuration = new Histogram({
  name: "todo_http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const httpMetrics: RequestHandler = (request, response, next) => {
  const stop = requestDuration.startTimer();
  response.on("finish", () => {
    const labels = {
      method: request.method,
      route: request.route?.path ? String(request.route.path) : request.path,
      status: String(response.statusCode),
    };
    requestCount.inc(labels);
    stop(labels);
  });
  next();
};
