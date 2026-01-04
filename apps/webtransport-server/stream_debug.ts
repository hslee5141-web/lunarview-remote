/**
 * stream_debug.ts
 * Manually verifies bidirectional stream echo.
 */
export { };

const url = "https://127.0.0.1:4433";
console.log(`Connecting to ${url}...`);

try {
    const transport = new WebTransport(url);

    // Timeout for connection
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 5000)
    );
    await Promise.race([transport.ready, timeout]);
    console.log("✅ WebTransport Ready!");

    // Create stream
    const stream = await transport.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // Write Ping
    const data = new TextEncoder().encode("Ping");
    await writer.write(data);
    console.log("Sent: Ping");

    // Read Pong (echo)
    const { value } = await reader.read();
    if (value) {
        const received = new TextDecoder().decode(value);
        console.log("Received:", received);
        if (received === "Ping") {
            await Deno.writeTextFile("debug_stream_status.txt", "SUCCESS");
        } else {
            await Deno.writeTextFile("debug_stream_status.txt", `FAILED: Expected Ping, got ${received}`);
        }
    } else {
        await Deno.writeTextFile("debug_stream_status.txt", "FAILED: Stream closed without data");
    }

    writer.close();
    transport.close();
    await transport.closed;

} catch (err) {
    const error = err as Error;
    console.error("❌ Stream test failed:", error);
    await Deno.writeTextFile("debug_stream_status.txt", `FAILED: ${error.message}`);
    Deno.exit(1);
}
