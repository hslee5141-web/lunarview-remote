/**
 * tests/stream_test.ts
 * Verifies bidirectional stream echo functionality.
 */

import { assertEquals } from "@std/assert";

Deno.test("WebTransport Bidirectional Stream Echo", async () => {
    const url = "https://127.0.0.1:4433";
    let transport: WebTransport;

    try {
        transport = new WebTransport(url);
        await transport.ready;
    } catch (e) {
        console.error("Failed to connect:", e);
        throw e;
    }

    try {
        // Create a bidirectional stream
        const stream = await transport.createBidirectionalStream();
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();

        // Write "Ping"
        const data = new TextEncoder().encode("Ping");
        await writer.write(data);

        const { value } = await reader.read();
        const received = new TextDecoder().decode(value);

        console.log("Received:", received);
        assertEquals(received, "Ping", "Server should echo back the data");

        writer.close();
        transport.close();
        await transport.closed;
    } catch (err) {
        transport.close();
        throw err;
    }
});
