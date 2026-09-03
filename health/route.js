export async function GET(ctx) {
  return ctx.json({ status: "ok", ts: new Date().toISOString() });
}
