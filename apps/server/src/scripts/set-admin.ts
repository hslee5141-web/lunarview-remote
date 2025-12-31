
import { Pool } from 'pg';
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
};

async function main() {
    console.log('--- Set Admin User Script ---');

    // 1. Get Database URL
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.log('DATABASE_URL not found in environment.');
        dbUrl = await question('Enter External Database URL (from Render Dashboard): ');
    } else {
        console.log('Using DATABASE_URL from environment.');
    }

    if (!dbUrl || !dbUrl.startsWith('postgres')) {
        console.error('Invalid Database URL.');
        process.exit(1);
    }

    // 2. Connect
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false } // Required for Render External connections
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected to database.');
        client.release();
    } catch (err: any) {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    }

    // 3. Get Email
    const email = await question('Enter the email address of the user to make admin: ');
    if (!email) {
        console.error('Email is required.');
        process.exit(1);
    }

    // 4. Update User
    try {
        const result = await pool.query(
            `UPDATE users SET is_admin = true, updated_at = NOW() WHERE email = $1 RETURNING id, email, is_admin`,
            [email]
        );

        if (result.rowCount === 0) {
            console.log(`❌ User with email '${email}' not found.`);
        } else {
            console.log('✅ Success! User updated:', result.rows[0]);
        }
    } catch (err: any) {
        console.error('❌ Update failed:', err.message);
    } finally {
        await pool.end();
        rl.close();
        process.exit(0);
    }
}

main();
