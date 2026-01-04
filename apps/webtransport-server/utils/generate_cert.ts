
/**
 * generate_cert.ts
 * Generates a self-signed ECDSA certificate for localhost using OpenSSL.
 * WebTransport requires TLS (HTTP/3).
 */

const command = new Deno.Command("openssl", {
    args: [
        "req",
        "-new",
        "-x509",
        "-nodes",
        "-days",
        "365",
        "-config",
        "utils/openssl.cnf",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-keyout",
        "key.pem",
        "-out",
        "cert.pem",
    ],
});

console.log("Generating self-signed certificate...");
const { code, stderr } = await command.output();

if (code === 0) {
    console.log("✅ Certificate generated successfully:");
    console.log("   - cert.pem");
    console.log("   - key.pem");

    // Calculate fingerprint (SHA-256) which is useful for WebTransport hash verification
    const fpCommand = new Deno.Command("openssl", {
        args: ["x509", "-in", "cert.pem", "-noout", "-fingerprint", "-sha256"],
    });
    const fpOutput = await fpCommand.output();
    const fingerprint = new TextDecoder().decode(fpOutput.stdout).trim();
    console.log(`ℹ️  Fingerprint: ${fingerprint}`);

} else {
    console.error("❌ Failed to generate certificate:");
    console.error(new TextDecoder().decode(stderr));
    Deno.exit(1);
}
