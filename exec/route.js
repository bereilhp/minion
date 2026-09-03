import { spawn } from "node:child_process";
import { HttpError, notFound, badRequest } from "ananajs";

// POST /exec
// Body: { prompt: string, workdir?: string, model?: string, effort?: string, sandbox?: string, approval?: string, timeoutMs?: number, json?: boolean }
export async function POST(ctx) {
  const body = await ctx.body();

  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw badRequest("`prompt` (string) is required");
  }

  const workdir = body.workdir || body.cwd || process.cwd();
  const model = body.model || "gpt-5.6-luna";
  const effort = body.effort || "medium"; // low | medium | high | xhigh
  const sandbox = body.sandbox; // read-only | workspace-write | danger-full-access
  const approval = body.approval; // on-request | never  (-a)
  const useJson = body.json === true;
  const timeoutMs = Number(body.timeoutMs) || 10 * 60 * 1000; // 10 min default (codex can be slow)

  const args = ["exec"];

  if (useJson) args.push("--json");
  args.push("-m", model);
  args.push("-c", `model_reasoning_effort=${JSON.stringify(effort)}`);
  if (sandbox) args.push("-s", sandbox);
  if (approval) args.push("-a", approval);
  if (body.workdir || body.cwd) args.push("-C", workdir);
  // pass prompt as final arg; if too large, we fallback to stdin
  const promptNeedsStdin = prompt.length > 8000;
  if (!promptNeedsStdin) args.push(prompt);

  const result = await runCodex(args, {
    stdin: promptNeedsStdin ? prompt : undefined,
    cwd: workdir,
    timeoutMs,
  });

  // If --json, parse JSONL events and extract last message
  if (useJson) {
    const events = result.stdout
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return { _raw: l };
        }
      });

    // try to find final message
    const last = [...events].reverse().find((e) => e.type === "item.completed" || e.msg?.type === "agent_message");
    return ctx.json({
      ok: result.code === 0,
      code: result.code,
      signal: result.signal,
      events,
      lastMessage: last ?? null,
      stderr: result.stderr,
      workdir,
      args: ["codex", ...args.slice(0, promptNeedsStdin ? args.length : args.length - 1), promptNeedsStdin ? "<stdin>" : "<prompt>"],
    });
  }

  return ctx.json({
    ok: result.code === 0,
    code: result.code,
    signal: result.signal,
    output: result.stdout,
    stderr: result.stderr,
    workdir,
  });
}

function runCodex(args, { stdin, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn("codex", args, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // harder kill after grace
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 3000);
    }, timeoutMs);

    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) stderr += `\n[timeout after ${timeoutMs}ms]`;
      resolve({ code, signal, stdout, stderr });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, signal: null, stdout, stderr: stderr + `\n[spawn error: ${err.message}]` });
    });
  });
}
