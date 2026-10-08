"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const client_1 = require("../prisma/client");
const connectDB = async () => {
    try {
        await client_1.prisma.$connect();
        console.log('PostgreSQL Connected...');
    }
    catch (err) {
        console.error('❌ Database connection error:', err);
        console.error('Error code:', err?.errorCode);
        console.error('Error message:', err?.message);
        if (err?.errorCode === 'P1001' || err?.errorCode === 'P2024') {
            console.error('\n💡 Troubleshooting tips:');
            console.error('1. Use the Neon *pooled* connection string (-pooler hostname)');
            console.error('2. On Vercel set DATABASE_URL with ?sslmode=require&pgbouncer=true');
            console.error('3. Avoid channel_binding=require on serverless');
            console.error('4. Confirm the Neon project is active (not suspended)');
        }
        // Never kill the whole serverless process on Vercel — a cold-start
        // connect failure would take down every request with exit status 1.
        if (process.env.VERCEL) {
            console.error('Continuing without eager DB connect on Vercel');
            return;
        }
        process.exit(1);
    }
};
exports.connectDB = connectDB;
//# sourceMappingURL=db.js.map