export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Digiroot] Server instrumentation loaded");

    const { startBot } = await import("./lib/bot");
    await startBot();
  }
}
