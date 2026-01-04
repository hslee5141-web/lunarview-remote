/**
 * tests/connection_test.ts
 * Verifies that the WebTransport server can accept connections.
 */

import { assertEquals } from "@std/assert";
import { delay } from "@std/async/delay";

Deno.test("WebTransport Connection Handshake", async () => {
    // Client side
    const url = "https://127.0.0.1:4433";
    let connected = false;

    // Retry connection logic since server might take a moment to bind
    for (let i = 0; i < 10; i++) {
        try {
            const transport = new WebTransport(url);

            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Connection timeout")), 2000)
            );

            await Promise.race([transport.ready, timeout]);
            console.log("Connected!");
            connected = true;
            transport.close();
            await transport.closed;
            break;
        } catch (err) {
            console.log(`Connection attempt ${i + 1} failed:`, err);
            await delay(1000);
        }
    }

    assertEquals(connected, true, "Should successfully establish WebTransport connection");
});
