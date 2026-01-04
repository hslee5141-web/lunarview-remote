/**
 * client_debug.ts
 * Debug client for testing WebTransport connection.
 */
export { };

const url = "https://127.0.0.1:4433";
console.log(`Connecting to ${url}...`);

try {
    const transport = new WebTransport(url);
    console.log("WebTransport instance created.");

    // Timeout promise
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 3000)
    );

    await Promise.race([transport.ready, timeout]);
    console.log("✅ WebTransport Ready!");
    await Deno.writeTextFile("debug_status.txt", "SUCCESS");

    const writer = transport.datagrams.writable.getWriter();
    await writer.write(new Uint8Array([1, 2, 3]));
    console.log("Datagram sent.");
    writer.releaseLock();

    transport.close();
    console.log("Closed.");
} catch (err) {
    const error = err as Error;
    console.error("❌ Connection failed:", error);
    if (error.cause) console.error("Cause:", error.cause);
    await Deno.writeTextFile("debug_status.txt", `FAILED: ${error.message}`);
    Deno.exit(1);
}
