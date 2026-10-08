// Supabase Edge Function: register-nickname
// Deploy with: supabase functions deploy register-nickname --no-verify-jwt
// This endpoint is intentionally public so visitors can sign up.
// Configure Supabase Auth rate limits / CAPTCHA at the gateway before public launch.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

async function loginEmail(nickname: string) {
  const bytes = new TextEncoder().encode(nickname.trim().toLowerCase().normalize('NFKC'));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') + '@users.invalid';
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const raw = await req.json();
    const nickname = typeof raw?.nickname === 'string' ? raw.nickname.trim().normalize('NFKC') : '';
    const password = typeof raw?.password === 'string' ? raw.password : '';
    if (nickname.length < 3 || nickname.length > 24 || !/^[\p{L}\p{N}_-]+$/u.test(nickname)) {
      return reply({ error: 'Ник: 3–24 символа, буквы, цифры, _ или -.' }, 400);
    }
    if (password.length < 6 || password.length > 128) {
      return reply({ error: 'Пароль: от 6 до 128 символов.' }, 400);
    }
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply({ error: 'Сервер регистрации не настроен.' }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const login_email = await loginEmail(nickname);
    // Supabase Auth enforces email uniqueness. Never expose account existence details.
    const { error } = await admin.auth.admin.createUser({
      email: login_email, password, email_confirm: true,
      user_metadata: { nickname },
    });
    if (error) {
      if (/already|registered|exists|duplicate|unique/i.test(error.message)) {
        return reply({ error: 'Этот ник уже занят.' }, 409);
      }
      console.error('Registration failed:', error.code || error.status || 'unknown');
      return reply({ error: 'Регистрация временно недоступна.' }, 500);
    }
    return reply({ login_email });
  } catch {
    return reply({ error: 'Некорректный запрос.' }, 400);
  }
});
