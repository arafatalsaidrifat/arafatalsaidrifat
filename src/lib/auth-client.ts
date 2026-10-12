import { createAuthClient } from 'better-auth/react';
export const authClient=createAuthClient({baseURL:typeof window==='undefined'?(process.env.BETTER_AUTH_URL||'http://localhost:3000'):window.location.origin});
