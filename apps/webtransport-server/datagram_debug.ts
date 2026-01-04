/**
 * datagram_debug.ts
 * Manually verifies datagram echo.
 */
export { };

const url = "https://127.0.0.1:4433";
console.log(`Connecting to ${url}...`);

try {
    const transport = new WebTransport(url);

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 5000)
    );
    await Promise.race([transport.ready, timeout]);
    console.log("✅ WebTransport Ready!");

    const writer = transport.datagrams.writable.getWriter();
    const reader = transport.datagrams.readable.getReader();

    const data = new Uint8Array([10, 20, 30]);
    await writer.write(data);
    console.log("Sent datagram");

    const { value } = await reader.read();
    if (value) {
        console.log("Received datagram:", value);
        if (value[0] === 10) {
            await Deno.writeTextFile("debug_datagram_status.txt", "SUCCESS");
        } else {
            await Deno.writeTextFile("debug_datagram_status.txt", "FAILED: Data mismatch");
        }
    } else {
        await Deno.writeTextFile("debug_datagram_status.txt", "FAILED: Stream closed");
    }

    transport.close();
    await transport.closed;

} catch (err) {
    const error = err as Error;
    console.error("❌ Datagram test failed:", error);
    await Deno.writeTextFile("debug_datagram_status.txt", `FAILED: ${error.message}`);
    Deno.exit(1);
}
