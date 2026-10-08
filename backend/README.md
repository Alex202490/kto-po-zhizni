# Реальная проверка Supabase (2026-10-09)

Проверено через прямое подключение к проекту `ecgyrqggorfejgfklrml`:
- Таблицы `profiles`, `messages`, `message_reactions`, `direct_messages`, `friendships` и другие уже существуют.
- `messages.reply_to` уже существует.
- Функции `ensure_my_profile`, `send_friend_request`, `my_chat_media_usage` уже существуют.
- Edge Functions `register-nickname` (verify_jwt=false) и `delete-chat-media` активны.
- `backend/registration-chat-fix.sql` НЕ ПРИМЕНЯТЬ: он был подготовлен по устаревшей схеме `supabase.sql` и несовместим с существующим первичным ключом `message_reactions`.
- `supabase/functions/register-nickname/index.ts` — альтернативный исходник, он НЕ развернут и не должен заменять действующую функцию без проверки её поведения.
- Никаких изменений в живую базу при проверке не вносилось.
- Для реального подтверждения нужны тесты регистрации, входа и чата под тестовыми аккаунтами.
