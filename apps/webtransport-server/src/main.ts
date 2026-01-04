/**
 * src/main.ts
 * Deno WebTransport Server using QuicEndpoint (HTTP/3 over QUIC)
 * Requires: deno run --unstable-net --allow-net --allow-read src/main.ts
 */

if (import.meta.main) {
    const port = 4433;
    const certFile = "cert.pem";
    const keyFile = "key.pem";

    // Load TLS certificates
    let cert: string, key: string;
    try {
        cert = await Deno.readTextFile(certFile);
        key = await Deno.readTextFile(keyFile);
    } catch (err) {
        const error = err as Error;
        console.error(`❌ Failed to load TLS certificates: ${error.message}`);
        console.error("   Run 'deno task cert' or 'utils/generate_cert.ts' first.");
        Deno.exit(1);
    }

    console.log(`🚀 Starting WebTransport server on port ${port}...`);

    // Create QUIC endpoint for HTTP/3 WebTransport
    // deno-lint-ignore no-explicit-any
    const endpoint = new (Deno as any).QuicEndpoint({
        hostname: "0.0.0.0",
        port: port,
    });

    // Listen for incoming connections
    const listener = endpoint.listen({
        cert,
        key,
        alpnProtocols: ["h3"], // HTTP/3 protocol
    });

    console.log(`✅ WebTransport server listening on https://localhost:${port}`);

    // Accept incoming connections
    for await (const conn of listener) {
        handleQuicConnection(conn);
    }
}

// deno-lint-ignore no-explicit-any
async function handleQuicConnection(conn: any) {
    console.log("📡 New QUIC connection");
    
    try {
        // Accept WebTransport session
        // deno-lint-ignore no-explicit-any
        for await (const wt of conn.incomingWebTransportSessions as any) {
            console.log("✅ New WebTransport session");
            handleWebTransportSession(wt);
        }
    } catch (err) {
        console.error("Connection error:", err);
    }
}

// deno-lint-ignore no-explicit-any
async function handleWebTransportSession(session: any) {
    try {
        await session.ready;
        console.log("   Session ready");

        // Handle datagrams concurrently
        handleDatagrams(session);

        // Handle bidirectional streams
        for await (const stream of session.incomingBidirectionalStreams) {
            handleBidirectionalStream(stream);
        }
    } catch (err) {
        console.error("Session error:", err);
    }
}

// deno-lint-ignore no-explicit-any
async function handleDatagrams(session: any) {
    const reader = session.datagrams.readable.getReader();
    const writer = session.datagrams.writable.getWriter();
    console.log("   Datagram handler started");

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            // Echo back
            await writer.write(value);
            console.log("   Datagram echoed:", value.length, "bytes");
        }
    } catch (e) {
        console.error("Datagram error:", e);
    } finally {
        writer.close();
    }
}

// deno-lint-ignore no-explicit-any
async function handleBidirectionalStream(stream: any) {
    console.log("📨 New bidirectional stream");
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            console.log("   Stream data received:", value.length, "bytes");
            await writer.write(value);
            console.log("   Stream data echoed");
        }
    } catch (e) {
        console.error("Stream processing error:", e);
    } finally {
        writer.close();
    }
}
